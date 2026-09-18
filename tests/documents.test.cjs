const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateDocumentFile,normalizedDocumentName,documentHash}=require('../src/lib/files.ts');
const {documentFormSchema,documentFilterSchema}=require('../src/lib/document-validation.ts');
const {uploadDocumentFile}=require('../src/lib/document-upload-workflow.ts');
const pdf=()=>new File(['%PDF-1.7\nSIMI'],'originale.pdf',{type:'application/pdf'});
test('file hash identifies content independent of filename',async()=>{
 const a=await documentHash(pdf()),b=await documentHash(new File(['%PDF-1.7\nSIMI'],'altro.pdf',{type:'application/pdf'}));assert.equal(a,b);assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,await documentHash(new File(['%PDF-1.7\nALTRO'],'altro.pdf',{type:'application/pdf'})));
});
test('filename, extension, MIME and normalization are validated without changing original',async()=>{
 for(const name of ['../originale.pdf','bad\\file.pdf','bad\nfile.pdf','wrong.png',''])await assert.rejects(validateDocumentFile(new File(['%PDF-1.7\n'],name,{type:'application/pdf'})));
 const file=pdf();await validateDocumentFile(file);assert.equal(normalizedDocumentName('2026-09-18','Contratto','Commessa / 1071',file.name),'2026-09-18 - Contratto - Commessa 1071.pdf');assert.equal(file.name,'originale.pdf');
});
test('document metadata and filters support foreign data, status derivation, dates and contexts',()=>{
 const base={title:'Contrat',legal_entity_id:'11111111-1111-4111-8111-111111111111',country:'France',language:'fr'};
 assert.equal(documentFormSchema.parse(base).status,'valid');assert.equal(documentFormSchema.parse(base).expiry_date,null);
 assert.equal(documentFormSchema.safeParse({...base,status:'expired'}).success,false);
 assert.equal(documentFormSchema.safeParse({...base,expiry_date:'2026-02-30'}).success,false);
 assert.equal(documentFilterSchema.parse({q:'1071',status:'expired',page:'3'}).page,3);
 assert.equal(documentFilterSchema.safeParse({sort:'storage_path'}).success,false);
});
function database({uploadError=false,finalizeError=false,reserveError=false}={}){
 const calls=[];return {calls,db:{rpc:async(name,args)=>{calls.push({name,args});return name==='reserve_document_upload'?{data:reserveError?null:[{document_id:'doc',version_id:'version',storage_path:'documents/unique.pdf'}],error:reserveError?{code:'23514',message:'invalid'}:null}:{data:null,error:name==='finalize_document_version'&&finalizeError?{code:'23505',message:'duplicate'}:null};},storage:{from:bucket=>({upload:async(path,file,opts)=>{calls.push({name:'upload',bucket,path,opts});return {error:uploadError?{message:'Storage unavailable'}:null};}})}}};
}
test('upload reserves before Storage, never overwrites, then finalizes with original and normalized names',async()=>{
 const {db,calls}=database();await uploadDocumentFile(db,pdf(),{title:'Contratto',document_date:'2026-09-18'});
 assert.deepEqual(calls.map(x=>x.name),['reserve_document_upload','upload','finalize_document_version']);assert.equal(calls[0].args.filename,'originale.pdf');assert.match(calls[0].args.normalized,/2026-09-18 - Documento - Contratto.pdf/);assert.equal(calls[1].opts.upsert,false);
});
test('Storage failure records failed reservation and never finalizes',async()=>{
 const {db,calls}=database({uploadError:true});await assert.rejects(uploadDocumentFile(db,pdf(),{title:'Test'}),/Upload non riuscito/);assert.deepEqual(calls.map(x=>x.name),['reserve_document_upload','upload','fail_document_version']);
});
test('finalization failure leaves tracked uploaded file for retry, without deleting bytes',async()=>{
 const {db,calls}=database({finalizeError:true});await assert.rejects(uploadDocumentFile(db,pdf(),{title:'Test'}),/non finalizzato/);assert.equal(calls.at(-1).name,'finalize_document_version');assert.equal(calls.some(x=>x.name==='fail_document_version'),false);
});
test('new version and explicit duplicate consent flow through the common workflow',async()=>{
 const {db,calls}=database();await uploadDocumentFile(db,pdf(),{title:'Firmato'},{documentId:'logical',label:'Firmata',acknowledgeDuplicate:true});assert.equal(calls[0].args.doc,'logical');assert.equal(calls[0].args.version_label,'Firmata');assert.equal(calls.at(-1).args.acknowledge_duplicate,true);
});
const {createVersionSignedUrl}=require('../src/lib/document-signed-url.ts');
test('signed URL resolves authorized version, expires in five minutes and keeps private bucket',async()=>{
 const calls=[];const db={from:table=>({select:()=>({eq:(key,id)=>({single:async()=>{calls.push({table,key,id});return {data:{storage_path:'private/old.pdf',original_filename:'original.pdf',normalized_filename:'normalized.pdf',file_state:'ready'},error:null};}})})}),storage:{from:bucket=>({createSignedUrl:async(path,ttl,options)=>{calls.push({bucket,path,ttl,options});return {data:{signedUrl:'https://example.invalid/signed-token'},error:null};}})}};
 assert.equal(await createVersionSignedUrl(db,'old-version',true),'https://example.invalid/signed-token');assert.equal(calls[0].id,'old-version');assert.deepEqual(calls[1],{bucket:'simi-documents',path:'private/old.pdf',ttl:300,options:{download:'normalized.pdf'}});
 db.storage.from=()=>({createSignedUrl:async()=>({data:null,error:{message:'RLS denied'}})});await assert.rejects(createVersionSignedUrl(db,'old-version'),/Accesso al file/);
 db.from=()=>({select:()=>({eq:()=>({single:async()=>({data:{file_state:'pending'},error:null})})})});await assert.rejects(createVersionSignedUrl(db,'pending'),/non ancora disponibile/);
});
