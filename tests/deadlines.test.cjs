const {test}=require('node:test');
const assert=require('node:assert/strict');
const {manualDeadlineSchema,deadlineFilterSchema}=require('../src/lib/deadline-validation.ts');
const manual={title:'DURC',description:'',due_date:'2026-09-30',due_time:'',legal_entity_id:'11111111-1111-4111-8111-111111111111',category_code:'durc',priority:'high',project_id:'',company_id:'',document_id:'',assigned_to:'',notes:'',status:'open'};
test('manual deadline validates optional links, completion and actual dates',()=>{
 assert.equal(manualDeadlineSchema.parse(manual).assigned_to,null);
 assert.equal(manualDeadlineSchema.parse({...manual,status:'completed'}).status,'completed');
 for(const delta of [{due_date:'2026-02-30'},{due_time:'29:88'},{legal_entity_id:''},{priority:'urgent'},{title:' '},{assigned_to:'wrong'}])assert.equal(manualDeadlineSchema.safeParse({...manual,...delta}).success,false);
});
test('filters validate pagination, ownership and combined selections',()=>{
 const f=deadlineFilterSchema.parse({period:'7',kind:'payment',status:'open',mine:'1',page:'2',project:manual.legal_entity_id});
 assert.equal(f.page,2);assert.equal(f.mine,'1');
 for(const delta of [{page:'0'},{from:'2026-13-01'},{month:'2026-00'},{kind:'sql'},{assigned:'invalid'}])assert.equal(deadlineFilterSchema.safeParse(delta).success,false);
});
