const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {taskSchema,anomalyPriority,registrySource,pageNumber}=require('../src/lib/work/model.ts');
const {hasPermission}=require('../src/lib/auth.ts');
const {statusLabel}=require('../src/lib/status.ts');
const id='22000000-0000-4000-8000-000000000001';
const valid={id:null,revision:0,legal_entity_id:id,title:'Contattare fornitore',description:'',notes:'',status:'todo',priority:'high',assigned_to:id,due_date:'2026-10-01',anomaly_id:null,records:[{kind:'invoice',id}]};
test('task validation preserves dates, UUID relations and rejects malformed work',()=>{
 assert.equal(taskSchema.parse(valid).due_date,'2026-10-01');
 assert.equal(taskSchema.parse({...valid,due_date:''}).due_date,null);
 for(const change of [{title:' '},{status:'blocked'},{priority:'critical'},{due_date:'2026-02-30'},{assigned_to:'user name'},{records:[{kind:'invoice',id:'https://example.com'}]},{records:[{kind:'arbitrary_table',id}]}])assert.equal(taskSchema.safeParse({...valid,...change}).success,false,JSON.stringify(change));
 assert.deepEqual(registrySource({id,invoice_id:id}),{kind:'invoice',id});
 assert.equal(pageNumber('-1'),1);assert.equal(pageNumber('1.5'),1);assert.equal(pageNumber('3'),3);
});
test('work permissions distinguish read, write and assignment without breaking admin',()=>{
 assert.equal(hasPermission('admin','future.module'),true);
 for(const role of ['viewer','management']){assert.equal(hasPermission(role,'task.read'),true);assert.equal(hasPermission(role,'task.create'),false);assert.equal(hasPermission(role,'anomaly.ignore'),false);}
 assert.equal(hasPermission('technical','task.create'),true);assert.equal(hasPermission('technical','task.assign'),false);assert.equal(hasPermission('technical','anomaly.ignore'),false);
 for(const role of ['administration','project_manager','hr'])for(const cap of ['task.assign','task.archive','anomaly.assign','anomaly.ignore'])assert.equal(hasPermission(role,cap),true);
 assert.equal(hasPermission('unknown','task.read'),false);
});
test('central status and severity map to coherent anomaly follow-up priority',()=>{
 assert.deepEqual(['todo','in_progress','completed','cancelled'].map(s=>statusLabel('task',s)),['Da fare','In corso','Completata','Annullata']);
 assert.deepEqual(['open','resolved','ignored'].map(s=>statusLabel('anomaly',s)),['Aperta','Risolta','Ignorata']);
 assert.deepEqual(['critical','warning','info'].map(anomalyPriority),['urgent','high','medium']);
});
test('dashboard operational data and source creation use existing loading components',()=>{
 const page=fs.readFileSync('src/app/(portal)/dashboard/page.tsx','utf8');
 assert.match(page,/getWorkDashboard/);assert.match(page,/href="\/anomalie\?view=open"/);assert.match(page,/<UpcomingDeadlines/);
 const query=fs.readFileSync('src/lib/work/dashboard.ts','utf8');assert.match(query,/\.eq\("assigned_to",user.id\)\.lte\("due_date",today\)/);assert.match(query,/\.eq\("severity","critical"\)/);
 for(const file of ['task-form','anomaly-actions']){const source=fs.readFileSync(`src/components/work/${file}.tsx`,'utf8');assert.match(source,/useActionState/);assert.match(source,/SubmitButton/);assert.match(source,/role="alert"/);}
});
