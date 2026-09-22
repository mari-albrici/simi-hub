const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

// Exercise the actual action/page with only their I/O dependencies replaced.
function load(file,dependencies){
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
 const module={exports:{}};
 const run=vm.runInThisContext(`(function(require,module,exports){${compiled.outputText}\n})`,{filename:file});
 run(name=>Object.hasOwn(dependencies,name)?dependencies[name]:require(name),module,module.exports);
 return module.exports;
}
class Redirect extends Error{}

test('employee writes normalize empty dates to SQL NULL and retain valid dates',async()=>{
 const writes=[];
 const db={insert(data){writes.push(data);return this;},update(data){writes.push(data);return this;},from(){return this;},eq(){return this;},is(){return this;},select(){return this;},async single(){return {data:{id:'24000000-0000-4000-8000-000000000001'},error:null};}};
 const {saveEmployeeAction}=load('src/lib/employees.ts',{
  'next/cache':{revalidatePath(){}},'next/navigation':{redirect(url){throw new Redirect(url);}},
  '@/lib/permissions':{async authorizedClient(){return db;}},
  '@/lib/errors':{checkDatabase(error){if(error)throw error;},publicError(error){return {message:error.message,kind:'validation'};}},
 });
 for(const extra of [{},{id:'24000000-0000-4000-8000-000000000001',birth_date:'1980-02-29',hire_date:'2026-09-22'}]){
  const values={first_name:'Jean',last_name:'Dupont',legal_entity_id:'',status:'active',email:'',birth_date:'',hire_date:'',termination_date:'',...extra};
  const form=new FormData();for(const [key,value] of Object.entries(values))form.set(key,value);
  await assert.rejects(saveEmployeeAction(form),error=>error instanceof Redirect&&error.message.includes('success='));
  const written=writes.at(-1);
  for(const field of ['birth_date','hire_date','termination_date'])assert.equal(written[field],values[field]||null);
 }
 const form=new FormData();for(const [key,value] of Object.entries({first_name:'Jean',last_name:'Dupont',legal_entity_id:'',status:'active',email:'',birth_date:'2026-02-30'}))form.set(key,value);
 await assert.rejects(saveEmployeeAction(form),error=>error instanceof Redirect&&error.message.includes('error='));
 assert.equal(writes.length,2,'Invalid dates must never reach the database');
});

test('new offer revision keeps the group and number but submits no existing ID',async()=>{
 const original={id:'24000000-0000-4000-8000-000000000010',offer_group_id:'24000000-0000-4000-8000-000000000010',offer_number:'AUDIT-OFF',revision:2};
 function OfferForm(){}
 const {default:NewOffer}=load('src/app/(portal)/offerte/new/page.tsx',{
  '@/lib/permissions':{async requirePagePermission(){}},
  '@/lib/offers-contracts':{async getOffer(){return {offer:original};}},
  '@/lib/data':{async getAllCompanies(){return [];},async getLegalEntities(){return [];},async getProjects(){return [];}},
  '@/components/commercial/offer-form':{OfferForm},
 });
 const result=await NewOffer({searchParams:Promise.resolve({revision_of:original.id})});
 const form=result.props.children.find(child=>child.type===OfferForm);
 assert.equal(form.props.record.id,undefined);
 assert.equal(form.props.record.offer_group_id,original.offer_group_id);
 assert.equal(form.props.record.offer_number,original.offer_number);
 assert.equal(form.props.record.revision,3);
 assert.equal(original.revision,2);
 assert.ok(original.id);
});

test('schema replay includes every migration in order',()=>{
 const expected=fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort();
 const actual=[...fs.readFileSync('supabase/schema.sql','utf8').matchAll(/^\\ir migrations\/(.+\.sql)$/gm)].map(match=>match[1]);
 assert.deepEqual(actual,expected);
});
