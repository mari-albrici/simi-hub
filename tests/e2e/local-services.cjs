/* Auth/Storage contract adapter for a LOCAL disposable integration database.
   PostgreSQL, PostgREST, RPCs and RLS are real. No application code is mocked.
   This is not a Supabase Auth/Storage implementation and is never used in production. */
const http=require('node:http');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const secret='simi-local-e2e-only-jwt-secret-32-characters';
const user={id:'15000000-0000-4000-8000-000000000001',email:'e2e@simisrl.eu',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const unsigned=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+86400});
const token=unsigned+'.'+crypto.createHmac('sha256',secret).update(unsigned).digest('base64url');
const session={access_token:token,refresh_token:'local-only',expires_in:86400,expires_at:Math.floor(Date.now()/1000)+86400,token_type:'bearer',user};
const files=new Map();
function sql(query){return execFileSync('docker',['exec','simi-cycle-e2e-db','psql','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c',query],{encoding:'utf8'}).trim();}
function literal(value){return "'"+value.replaceAll("'","''")+"'";}
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://127.0.0.1:55430');
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');
 if(req.method==='OPTIONS'){res.end();return;}
 const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(url.pathname==='/test-session'){json(session);return;}
 if(url.pathname.startsWith('/auth/v1/')){json(url.pathname.endsWith('/user')?user:session);return;}
 if(url.pathname.startsWith('/rest/v1/')){
 const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
 const headers={...req.headers,authorization:'Bearer '+token};delete headers.host;delete headers['content-length'];
 const response=await fetch('http://127.0.0.1:55431'+req.url.slice('/rest/v1'.length),{method:req.method,headers,body:body.length?body:undefined});
 res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>!['content-encoding','transfer-encoding','content-length'].includes(k))));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname.startsWith('/storage/v1/object/sign/')){
 const path=decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/simi-documents/'.length));
 const allowed=sql(`SET request.jwt.claim.sub = '${user.id}'; SELECT public.document_storage_access(${literal(path)},'read');`).endsWith('t');
 if(!allowed){json({message:'denied'},403);return;}
 json({signedURL:'/object/test-signed/'+encodeURIComponent(path)});return;
 }
 if(url.pathname.startsWith('/storage/v1/object/test-signed/')){const file=files.get(decodeURIComponent(url.pathname.slice('/storage/v1/object/test-signed/'.length)));if(!file){json({message:'missing'},404);return;}res.writeHead(200,{'Content-Type':'application/pdf'});res.end(file);return;}
 if(req.method==='POST'&&url.pathname.startsWith('/storage/v1/object/simi-documents/')){
 const path=decodeURIComponent(url.pathname.slice('/storage/v1/object/simi-documents/'.length));const chunks=[];for await(const c of req)chunks.push(c);files.set(path,Buffer.concat(chunks));
 sql(`SET ROLE authenticated; SET request.jwt.claim.sub = '${user.id}'; INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents',${literal(path)});`);
 json({Key:'simi-documents/'+path});return;
 }
 json({message:'unsupported local test route'},404);
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({message:String(e)}));}
});server.listen(55430,'127.0.0.1',()=>console.log('Local test Auth/Storage adapter ready'));
