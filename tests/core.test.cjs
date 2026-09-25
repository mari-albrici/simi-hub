const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMonetaryAmount, parsePdfAmount } = require('../src/lib/money.ts');
const { invoiceSchema, dateSchema, companyFormSchema, projectFormSchema } = require('../src/lib/validations.ts');
const { validateDocumentFile } = require('../src/lib/files.ts');
const { deriveFinancialState } = require('../src/lib/finance-calculations.ts');
const { PERMISSION_MATRIX } = require('../src/lib/constants.ts');
const fs = require('node:fs');

test('management forecast validates manual CTC and ignores derived values', () => {
 const { projectManagementForecastLineSchema: schema } = require('../src/lib/validations.ts');
 const input={forecast_id:'11111111-1111-4111-8111-111111111111',cost_category_id:'22222222-2222-4222-8222-222222222222',cost_to_complete:0,notes:'',actual:12000,estimate_at_completion:1};
 const result=schema.parse(input);
 assert.equal(result.cost_to_complete,0); assert.equal(result.actual,undefined); assert.equal(result.estimate_at_completion,undefined);
 assert.equal(schema.safeParse({...input,cost_to_complete:3000}).success,true);
 for(const cost_to_complete of [-1,0.001,NaN,Infinity,1e12]) assert.equal(schema.safeParse({...input,cost_to_complete}).success,false);
 assert.equal(schema.safeParse({...input,forecast_id:'invalid'}).success,false);
});
test('management forecast requires a real date and keeps version/status server-controlled', () => {
 const { projectManagementForecastSchema: schema } = require('../src/lib/validations.ts');
 const input={name:'Forecast settembre',forecast_date:'2026-09-25',currency:'eur',notes:'',status:'approved',version_number:99};
 const result=schema.parse(input);
 assert.equal(result.currency,'EUR'); assert.equal(result.status,undefined); assert.equal(result.version_number,undefined);
 for(const change of [{forecast_date:''},{forecast_date:'2026-02-30'},{name:''},{currency:'EU'},{notes:'x'.repeat(2001)}]) assert.equal(schema.safeParse({...input,...change}).success,false);
});

test('management budget validates headers and prevents client-controlled version/status', () => {
 const { projectManagementBudgetSchema: schema } = require('../src/lib/validations.ts');
 const input = {name:'Budget iniziale',currency:'eur',valid_from:'',notes:'',status:'approved',version_number:9};
 const parsed=schema.parse(input);
 assert.equal(parsed.currency,'EUR'); assert.equal(parsed.status,undefined); assert.equal(parsed.version_number,undefined);
 for(const change of [{name:''},{currency:'EU'},{valid_from:'2027-02-30'},{notes:'x'.repeat(2001)}]) assert.equal(schema.safeParse({...input,...change}).success,false);
});
test('management budget accepts zero but rejects negative, imprecise and invalid lines', () => {
 const { projectManagementBudgetLineSchema: schema } = require('../src/lib/validations.ts');
 const input={budget_id:'11111111-1111-4111-8111-111111111111',cost_category_id:'22222222-2222-4222-8222-222222222222',amount:0,description:'',notes:''};
 assert.equal(schema.safeParse(input).success,true);
 assert.equal(schema.safeParse({...input,amount:999999999999.99}).success,true);
 for(const amount of [-1,0.001,NaN,Infinity,1e12]) assert.equal(schema.safeParse({...input,amount}).success,false);
 assert.equal(schema.safeParse({...input,cost_category_id:'invalid'}).success,false);
});

for (const [input,locale,value] of [
 ['1.220,00','it',1220],['1220,00','it',1220],['1 220,00','fr',1220],['1\u202f220,00','fr',1220],['1.220','it',1220],
 ['1220.00',undefined,1220],['1,220.00','en',1220],['-100,00','it',-100],['€ 1.220,00','it',1220],
 ['1.220,00 EUR','it',1220],['-€100,00','it',-100],['EUR -100,00','it',-100],['−100,00','it',-100],
 ['1.220',undefined,null],['1,220',undefined,null],['1,220.00','it',null],['1.220,00','en',null],
 ['12 20,00','it',null],['100,001','it',null],['1.22.00','it',null],['100 200','it',100200],['1e3',undefined,null],
 ['100,00 200,00','it',null],['NaN',undefined,null],['Infinity',undefined,null],['',undefined,null],
]) test(`money ${JSON.stringify(input)} (${locale ?? 'unspecified'})`,()=>assert.equal(parseMonetaryAmount(input,locale),value));
test('PDF field preserves full numeric token and sign',()=>{assert.equal(parsePdfAmount('Totale: -1220,00 EUR','it'),-1220);assert.equal(parsePdfAmount('100,00 / 200,00','it'),null);});
const id = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
function validInvoice() { return {
 invoice_type:'purchase',invoice_number:'TEST',legal_entity_id:id,counterparty_id:id,new_counterparty:null,invoice_date:'2026-09-17',due_date:'2026-10-17',status:'to_register',
 amount_net:100,vat_amount:22,amount_total:122,vat_rate:22,vat_exempt_reason:null,payment_method:'bank_transfer',notes:'',project_ids:[project],
 lines:[{description:'Servizio',quantity:1,unit_price:100,vat_rate:22,vat_exempt_reason:null,amount_net:100,amount_vat:22,amount_total:122,project_id:project}],
 installments:[{due_date:'2026-10-17',amount:122,paid:false}],
}; }
test('valid financial aggregate',()=>assert.equal(invoiceSchema.safeParse(validInvoice()).success,true));
for (const [name,change] of [
 ['header totals',v=>v.amount_total=123],['line VAT',v=>v.lines[0].amount_vat=21],['installment total',v=>v.installments[0].amount=121],
 ['negative amount',v=>v.amount_net=-1],['nonfinite amount',v=>v.amount_total=NaN],['missing VAT treatment',v=>v.lines[0].vat_rate=null],
 ['fractional cents',v=>v.amount_total=122.001],['invalid date',v=>v.installments[0].due_date='2026-02-30'],
 ['foreign project',v=>v.project_ids=[]],['duplicate projects',v=>v.project_ids.push(project)],
 ['duplicate line IDs',v=>{v.lines[0].id=id;v.lines.push({...v.lines[0]});}],['missing concurrency token',v=>v.id=id],
 ['UUID injection',v=>v.counterparty_id='not-an-id'],['quantity precision',v=>v.lines[0].quantity=1.00001],
]) test(`reject ${name}`,()=>{const v=validInvoice();change(v);assert.equal(invoiceSchema.safeParse(v).success,false);});
test('multiple VAT rates and stable IDs are accepted',()=>{const v=validInvoice();v.lines[0].id=id;v.lines.push({...v.lines[0],id:project,vat_rate:10,amount_vat:10,amount_total:110});v.amount_net=200;v.vat_amount=32;v.amount_total=232;v.installments[0].amount=232;assert.equal(invoiceSchema.safeParse(v).success,true);});
test('calendar validates leap years',()=>{assert.equal(dateSchema.safeParse('2024-02-29').success,true);assert.equal(dateSchema.safeParse('2025-02-29').success,false);});
test('international identifiers and IBAN checksum',()=>{
 const v={company_type:'supplier',business_name:'Société Test',email:'contact@example.fr',vat_number:'FR40303265045',iban:'FR14 2004 1010 0505 0001 3M02 606'};
 assert.equal(companyFormSchema.safeParse(v).success,true);assert.equal(companyFormSchema.safeParse({...v,iban:'FR00 2004 1010 0505 0001 3M02 606'}).success,false);
});
test('project requires UUID relations, not names',()=>assert.equal(projectFormSchema.safeParse({project_code:'C123',name:'Test',status:'active',customer_id:'Example company'}).success,false));
test('uploads verify content as well as MIME',async()=>{
 await validateDocumentFile(new File(['%PDF-1.7\n'],'a.pdf',{type:'application/pdf'}));
 await assert.rejects(validateDocumentFile(new File(['<script>'],'a.pdf',{type:'application/pdf'})));
 await assert.rejects(validateDocumentFile(new File(['x'],'a.html',{type:'text/html'})));
 await assert.rejects(validateDocumentFile(new File([new Uint8Array(10*1024*1024+1)],'a.pdf',{type:'application/pdf'})));
});
test('HR is restricted and viewer has no writes',()=>{
 assert.equal(PERMISSION_MATRIX.viewer.some(p=>/\.(create|update|delete|upload|write)$/.test(p)),false);
 assert.equal(PERMISSION_MATRIX.administration.includes('employee.read'),false);
 assert.equal(PERMISSION_MATRIX.hr.includes('employee.read'),true);
 assert.equal(PERMISSION_MATRIX.technical.includes('invoice.read'),false);
});
test('financial balances derive in cents and overdue only on residual',()=>{
 assert.deepEqual(deriveFinancialState(100,0,'2026-01-01','2026-02-01'),{allocated:0,residual:100,state:'overdue'});
 assert.deepEqual(deriveFinancialState(100,40,'2026-01-01','2026-02-01'),{allocated:40,residual:60,state:'partial'});
 assert.deepEqual(deriveFinancialState(100,100,'2026-01-01','2026-02-01'),{allocated:100,residual:0,state:'paid'});
 assert.deepEqual(deriveFinancialState(0.1,0.1,null,'2026-02-01'),{allocated:0.1,residual:0,state:'paid'});
});
test('SQL and application permission matrices match exactly',()=>{
 const sql=fs.readFileSync('supabase/migrations/014_phase1f_rbac.sql','utf8')+'\n'+fs.readFileSync('supabase/migrations/017_phase1f2_offers_contracts.sql','utf8');
 for(const [role,permissions] of Object.entries(PERMISSION_MATRIX)) {
  if (role === 'admin') continue; // Admin is an intentional wildcard in migration 011.
  const matches=[...sql.matchAll(new RegExp(`WHEN '${role}' THEN permission = ANY\\(ARRAY\\[([^\\]]+)\\]\\)`, 'g'))];
  assert.ok(matches.length,role);const found=[...new Set(matches.flatMap(match=>[...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1])))];
  assert.deepEqual(found.sort(),[...permissions].sort());
 }
 assert.match(fs.readFileSync('supabase/migrations/011_admin_role_wildcard.sql','utf8'),/WHEN 'admin' THEN true/);
});
test('admin has current and future capability names without an email exception',()=>{
 const { hasPermission } = require('../src/lib/auth.ts');
 assert.equal(hasPermission('admin','future.module.create'),true);
 assert.equal(hasPermission('viewer','future.module.create'),false);
});
test('commercial permissions allow operational roles and restrict read-only roles',()=>{
 const { hasPermission } = require('../src/lib/auth.ts');
 for (const domain of ['order','delivery_note']) {
  for (const role of ['administration','project_manager']) {
   assert.equal(hasPermission(role,`${domain}.read`),true);
   assert.equal(hasPermission(role,`${domain}.create`),true);
   assert.equal(hasPermission(role,`${domain}.delete`),false);
  }
  for (const role of ['technical','management']) {
   assert.equal(hasPermission(role,`${domain}.read`),true);
   assert.equal(hasPermission(role,`${domain}.create`),false);
  }
  assert.equal(hasPermission('hr',`${domain}.read`),false);
 }
});
test('invoice hotfix keeps signed decimal parsing and percentage discounts',()=>{
 const { parseMonetaryAmount, parsePdfAmount } = require('../src/lib/money.ts');
 const { invoiceLineAmounts } = require('../src/lib/invoice-calculations.ts');
 assert.equal(parseMonetaryAmount('-1.234,56','it'),-1234.56);
 assert.equal(parseMonetaryAmount('-1 234,56','fr'),-1234.56);
 assert.equal(parseMonetaryAmount('-1,234.56','en'),-1234.56);
 assert.equal(parseMonetaryAmount('(1.234,56)','it'),-1234.56);
 assert.equal(parsePdfAmount('-1.234,56','it'),-1234.56);
 assert.deepEqual(invoiceLineAmounts({quantity:1,unit_price:100,discount:10,vat_rate:22}),{net:90,vat:19.8,total:109.8});
 assert.deepEqual(invoiceLineAmounts({quantity:-1,unit_price:100,discount:0,vat_rate:22}),{net:-100,vat:-22,total:-122});
});
test('invoice form sends projects and eSolver registration through the existing workflow',()=>{
 const form=fs.readFileSync('src/app/(portal)/fatture/invoice-form.tsx','utf8');
 const crud=fs.readFileSync('src/lib/crud.ts','utf8');
 const page=fs.readFileSync('src/app/(portal)/fatture/page.tsx','utf8');
 assert.match(form,/name="project_ids"/);assert.match(form,/esolver_registration_number/);assert.match(form,/discount/);
 assert.match(crud,/esolver_registration_number/);assert.match(page,/esolver_registration_number/);
});

test('management allocations validate UUIDs, methods and positive cent amounts', () => {
 const { managementAllocationSchema } = require('../src/lib/validations.ts');
 const value = { invoice_id: id, project_id: project, allocated_amount: 6000, allocation_method: 'manual', notes: null };
 assert.equal(managementAllocationSchema.safeParse(value).success, true);
 assert.equal(managementAllocationSchema.safeParse({...value, allocation_method: 'direct', allocated_amount: 0.01}).success, true);
 for (const change of [
  {allocated_amount: 0}, {allocated_amount: -1}, {allocated_amount: 0.001},
  {allocated_amount: Infinity}, {allocated_amount: NaN}, {allocated_amount: 1000000000000},
  {invoice_id: 'invalid'}, {project_id: 'invalid'}, {id: 'invalid'},
  {allocation_method: 'automatic'}, {notes: 'x'.repeat(2001)},
 ]) assert.equal(managementAllocationSchema.safeParse({...value, ...change}).success, false);
});

test('management allocation category is nullable and validates UUIDs', () => {
 const { managementAllocationSchema } = require('../src/lib/validations.ts');
 const value = { invoice_id: id, project_id: project, allocated_amount: 10, allocation_method: 'manual', notes: null };
 for (const category of [undefined, null, '', project]) {
  const parsed = managementAllocationSchema.parse({...value, cost_category_id: category});
  assert.equal(parsed.cost_category_id, category || null);
 }
 for (const category of ['materials', 'invalid', 123]) {
  assert.equal(managementAllocationSchema.safeParse({...value, cost_category_id: category}).success, false);
 }
});

test('manual costs preserve signed values and validate required fields', () => {
 const { manualCostEntrySchema } = require('../src/lib/validations.ts');
 const value = { cost_date: '2026-09-24', description: 'Trasporto urgente', amount: -850.25, currency: 'eur' };
 const parsed = manualCostEntrySchema.parse(value);
 assert.equal(parsed.amount, -850.25);
 assert.equal(parsed.currency, 'EUR');
 assert.equal(parsed.cost_category_id, null);
 assert.equal(manualCostEntrySchema.parse({...value, amount: 850}).amount, 850);
 for (const change of [{amount: 0}, {amount: NaN}, {amount: Infinity}, {amount: 1.001},
  {cost_date: '2026-02-30'}, {description: '  '}, {currency: 'EURO'},
  {supplier_id: 'invalid'}, {legal_entity_id: 'invalid'}, {cost_category_id: 'materials'}]) {
  assert.equal(manualCostEntrySchema.safeParse({...value, ...change}).success, false);
 }
 const safe = manualCostEntrySchema.parse({...value, source_type: 'invoice', source_id: id, status: 'excluded', created_by: id});
 for (const key of ['source_type', 'source_id', 'status', 'created_by']) assert.equal(key in safe, false);
});

test('cost centers are optional UUIDs and classification rejects economic field injection', () => {
 const { manualCostEntrySchema, costEntryClassificationSchema } = require('../src/lib/validations.ts');
 const value = { cost_date: '2026-09-24', description: 'Costo', amount: -10, currency: 'EUR' };
 for (const center of [undefined, null, '', project]) {
  assert.equal(manualCostEntrySchema.parse({...value, cost_center_id: center}).cost_center_id, center || null);
  assert.equal(costEntryClassificationSchema.parse({cost_center_id: center}).cost_center_id, center || null);
 }
 assert.equal(manualCostEntrySchema.safeParse({...value, cost_center_id: 'warehouse'}).success, false);
 assert.equal(costEntryClassificationSchema.safeParse({cost_center_id: 'invalid'}).success, false);
 const classification = costEntryClassificationSchema.parse({cost_center_id: project, cost_category_id: id,
  notes: 'Gestione', amount: 1, currency: 'USD', supplier_id: id, legal_entity_id: id, cost_date: '2026-01-01'});
 assert.deepEqual(Object.keys(classification).sort(), ['cost_category_id', 'cost_center_id', 'cost_pool_id', 'notes']);
});

test('cost entry allocations validate positive cents without requiring an invoice', () => {
 const { costEntryAllocationSchema } = require('../src/lib/validations.ts');
 const value = {project_id: project, cost_category_id: null, allocated_amount: 0.01, allocation_method: 'manual', notes: null};
 assert.equal(costEntryAllocationSchema.safeParse(value).success, true);
 assert.equal(costEntryAllocationSchema.safeParse({...value, allocation_method: 'direct'}).success, true);
 for (const change of [{allocated_amount: 0}, {allocated_amount: -1}, {allocated_amount: 0.001},
  {project_id: 'invalid'}, {cost_category_id: 'materials'}, {allocation_method: 'automatic'}]) {
  assert.equal(costEntryAllocationSchema.safeParse({...value, ...change}).success, false);
 }
 assert.equal('invoice_id' in costEntryAllocationSchema.parse({...value, invoice_id: id}), false);
});

test('cost pools validate period, driver and optional nonnegative planned quantity', () => {
 const { managementCostPoolSchema, costEntryClassificationSchema } = require('../src/lib/validations.ts');
 const value = {code: 'small_equipment', name: 'Piccola attrezzatura', cost_center_id: project,
  period_start: '2027-01-01', period_end: '2027-12-31', driver_type: 'labor_hours',
  planned_driver_quantity: 35000, currency: 'EUR', status: 'draft'};
 assert.equal(managementCostPoolSchema.safeParse(value).success, true);
 for (const quantity of [null, 0, 0.01]) assert.equal(managementCostPoolSchema.safeParse({...value, planned_driver_quantity: quantity}).success, true);
 assert.equal(managementCostPoolSchema.safeParse({...value, driver_type: 'worker_days'}).success, true);
 for (const change of [{period_end:'2026-12-31'}, {period_start:''}, {driver_type:'percentage'},
  {planned_driver_quantity:-1}, {planned_driver_quantity:1.001}, {planned_driver_quantity:Infinity},
  {cost_center_id:'invalid'}, {status:'deleted'}, {currency:'EURO'}, {name:' '}]) {
  assert.equal(managementCostPoolSchema.safeParse({...value,...change}).success, false);
 }
 assert.equal('standard_rate' in managementCostPoolSchema.parse({...value, standard_rate:99}), false);
 assert.equal(costEntryClassificationSchema.parse({cost_pool_id:id}).cost_pool_id, id);
 assert.equal(costEntryClassificationSchema.safeParse({cost_pool_id:'small_equipment'}).success, false);
});

test('management allocation permissions separate administration from read-only management', () => {
 const { hasPermission } = require('../src/lib/auth.ts');
 for (const role of ['admin', 'administration']) {
  assert.equal(hasPermission(role, 'management.read'), true);
  assert.equal(hasPermission(role, 'management.update'), true);
 }
 assert.equal(hasPermission('management', 'management.read'), true);
 assert.equal(hasPermission('management', 'management.update'), false);
 for (const role of ['hr', 'viewer', 'technical', 'project_manager', 'unknown']) {
  assert.equal(hasPermission(role, 'management.read'), false);
  assert.equal(hasPermission(role, 'management.update'), false);
 }
});

test('pool driver entries accept zero and hundredths but reject invalid quantities and relations', () => {
 const { managementPoolDriverSchema } = require('../src/lib/validations.ts');
 const value = {pool_id: id, project_id: project, driver_quantity: 620, notes: 'Ore previste'};
 for (const quantity of [0, 0.01, 85, 620, 1100, 999999999999.99]) {
  assert.equal(managementPoolDriverSchema.safeParse({...value, driver_quantity:quantity}).success, true);
 }
 for (const change of [{driver_quantity:-1}, {driver_quantity:0.001}, {driver_quantity:NaN},
  {driver_quantity:Infinity}, {driver_quantity:1e12}, {pool_id:'invalid'}, {project_id:'invalid'}, {notes:'x'.repeat(2001)}]) {
  assert.equal(managementPoolDriverSchema.safeParse({...value,...change}).success, false);
 }
 const parsed = managementPoolDriverSchema.parse({...value, rate:99, allocated_amount:500, source_type:'timesheet'});
 assert.equal('rate' in parsed, false);
 assert.equal('allocated_amount' in parsed, false);
 assert.equal('source_type' in parsed, false);
});

test('management assets require the selected rate and protect physical location from generic edits', () => {
 const { managementAssetSchema } = require('../src/lib/validations.ts');
 const value = {asset_code:'SAL-001',name:'Saldatrice',category:'welding',purchase_date:'2027-01-01',
  purchase_cost:30000,management_value:20000,currency:'EUR',allocation_method:'daily',
  hourly_rate:null,daily_rate:75,monthly_rate:null,status:'available'};
 assert.equal(managementAssetSchema.safeParse(value).success,true);
 for (const method of ['hourly','daily','monthly']) {
  assert.equal(managementAssetSchema.safeParse({...value,allocation_method:method,[`${method}_rate`]:0.123456}).success,true);
  assert.equal(managementAssetSchema.safeParse({...value,allocation_method:method,[`${method}_rate`]:null}).success,false);
 }
 assert.equal(managementAssetSchema.safeParse({...value,allocation_method:'manual',daily_rate:null}).success,true);
 assert.equal(managementAssetSchema.safeParse({...value,purchase_cost:null,management_value:null,purchase_date:''}).success,true);
 for (const change of [{daily_rate:-1},{daily_rate:0.1234567},{daily_rate:1e8},{daily_rate:Infinity},
  {purchase_cost:-1},{purchase_cost:0.001},{currency:'EURO'},{asset_code:' '},{allocation_method:'percentage'},
  {category:'container'},{status:'deleted'},{purchase_date:'2027-02-30'}]) {
  assert.equal(managementAssetSchema.safeParse({...value,...change}).success,false);
 }
 const parsed=managementAssetSchema.parse({...value,current_project_id:project,created_by:id});
 assert.equal('current_project_id' in parsed,false);
 assert.equal('created_by' in parsed,false);
});

test('management asset movements and usages validate dates and preserve server calculation authority', () => {
 const { managementAssetMovementSchema, managementAssetUsageSchema } = require('../src/lib/validations.ts');
 const move={asset_id:id,to_project_id:project,movement_date:'2027-01-01'};
 assert.equal(managementAssetMovementSchema.safeParse(move).success,true);
 assert.equal(managementAssetMovementSchema.parse({...move,to_project_id:''}).to_project_id,null);
 assert.equal(managementAssetMovementSchema.safeParse({...move,to_project_id:'invalid'}).success,false);
 assert.equal(managementAssetMovementSchema.safeParse({...move,movement_date:'2027-02-30'}).success,false);
 const usage={asset_id:id,project_id:project,start_date:'2027-01-01',end_date:'2027-01-12',usage_quantity:12,manual_amount:null,status:'active'};
 assert.equal(managementAssetUsageSchema.safeParse(usage).success,true);
 assert.equal(managementAssetUsageSchema.safeParse({...usage,usage_quantity:null,manual_amount:123.45,status:'closed'}).success,true);
 for (const change of [{end_date:'2026-12-31'},{usage_quantity:-1},{usage_quantity:0.001},
  {manual_amount:-1},{manual_amount:Infinity},{project_id:'invalid'},{status:'cancelled'}]) {
  assert.equal(managementAssetUsageSchema.safeParse({...usage,...change}).success,false);
 }
 const parsed=managementAssetUsageSchema.parse({...usage,amount:1,rate:0,usage_unit:'manual',currency:'USD'});
 for (const field of ['amount','rate','usage_unit','currency']) assert.equal(field in parsed,false);
});

test('management containers validate registry fields without accepting physical position', () => {
 const { managementContainerSchema } = require('../src/lib/validations.ts');
 const value={container_code:'CT-001',name:'Container saldatura',ownership_type:'owned',purchase_date:'',purchase_cost:null,currency:'EUR',status:'available'};
 for (const ownership_type of ['owned','rented','third_party']) assert.equal(managementContainerSchema.safeParse({...value,ownership_type}).success,true);
 for (const status of ['available','in_use','maintenance','retired']) assert.equal(managementContainerSchema.safeParse({...value,status}).success,true);
 for (const change of [{ownership_type:'leased'},{status:'deleted'},{container_code:' '},{name:''},{purchase_cost:-1},
  {purchase_cost:1.001},{purchase_cost:Infinity},{currency:'EURO'},{purchase_date:'2027-02-30'}]) {
  assert.equal(managementContainerSchema.safeParse({...value,...change}).success,false);
 }
 const parsed=managementContainerSchema.parse({...value,current_project_id:project,asset_count:99,created_by:id});
 for (const field of ['current_project_id','asset_count','created_by']) assert.equal(field in parsed,false);
});

test('management container logistics require valid dates and relations; transport cost remains optional', () => {
 const { managementContainerMovementSchema,managementContainerAssetSchema,managementContainerAssetRemovalSchema } = require('../src/lib/validations.ts');
 const move={container_id:id,to_project_id:project,movement_date:'2027-01-01',transport_cost:null,currency:'EUR'};
 assert.equal(managementContainerMovementSchema.safeParse(move).success,true);
 assert.equal(managementContainerMovementSchema.parse({...move,to_project_id:''}).to_project_id,null);
 assert.equal(managementContainerMovementSchema.safeParse({...move,transport_cost:123.45}).success,true);
 for (const change of [{container_id:'bad'},{to_project_id:'bad'},{movement_date:'2027-02-30'},
  {transport_cost:-1},{transport_cost:0.001},{transport_cost:Infinity},{currency:'EURO'}]) {
  assert.equal(managementContainerMovementSchema.safeParse({...move,...change}).success,false);
 }
 const added=managementContainerAssetSchema.parse({container_id:id,asset_id:project,date_in:'2027-01-01',date_out:'2027-01-02',amount:900});
 assert.equal('date_out' in added,false); assert.equal('amount' in added,false);
 assert.equal(managementContainerAssetSchema.safeParse({...added,asset_id:'bad'}).success,false);
 assert.equal(managementContainerAssetSchema.safeParse({...added,date_in:''}).success,false);
 assert.equal(managementContainerAssetRemovalSchema.safeParse({id,date_out:'2027-01-02'}).success,true);
 assert.equal(managementContainerAssetRemovalSchema.safeParse({id,date_out:''}).success,false);
});

test('consumable items validate units, six-decimal costs and inactive state', () => {
 const { managementConsumableItemSchema }=require('../src/lib/validations.ts');
 const v={item_code:'DISC',name:'Dischi',unit:'pcs',default_unit_cost:2.2,currency:'EUR',is_active:true};
 for(const unit of ['pcs','kg','m','l','box','pack','other']) assert.equal(managementConsumableItemSchema.safeParse({...v,unit}).success,true);
 assert.equal(managementConsumableItemSchema.safeParse({...v,default_unit_cost:null,is_active:false}).success,true);
 assert.equal(managementConsumableItemSchema.safeParse({...v,default_unit_cost:0.123456}).success,true);
 for(const change of [{unit:'pallet'},{default_unit_cost:-1},{default_unit_cost:0.1234567},{default_unit_cost:1e8},{default_unit_cost:Infinity},{currency:'EURO'},{item_code:''}]) {
  assert.equal(managementConsumableItemSchema.safeParse({...v,...change}).success,false);
 }
});

test('consumable movements validate operation shape, three-decimal quantity and adjustment reason', () => {
 const {managementConsumableMovementSchema:s}=require('../src/lib/validations.ts');
 const base={item_id:id,movement_type:'load',to_container_id:project,quantity:1.125,unit_cost:2.2,movement_date:'2027-01-01'};
 assert.equal(s.safeParse(base).success,true);
 assert.equal(s.safeParse({...base,movement_type:'transfer',from_container_id:id,unit_cost:null}).success,true);
 assert.equal(s.safeParse({...base,movement_type:'consumption',from_container_id:id,to_container_id:null,project_id:project,unit_cost:null}).success,true);
 assert.equal(s.safeParse({...base,movement_type:'adjustment',unit_cost:null,notes:'Conteggio fisico'}).success,true);
 assert.equal(s.safeParse({...base,movement_type:'adjustment',from_container_id:id,to_container_id:null,unit_cost:null,notes:'Rettifica'}).success,true);
 for(const change of [{quantity:0},{quantity:-1},{quantity:1.0001},{quantity:Infinity},{quantity:1e11},{unit_cost:null},
  {movement_date:'2027-02-30'},{project_id:id},{from_container_id:id},
  {movement_type:'transfer',from_container_id:project},{movement_type:'consumption'},
  {movement_type:'adjustment',notes:' '}]) assert.equal(s.safeParse({...base,...change}).success,false);
 assert.equal('amount' in s.parse({...base,amount:0,currency:'USD'}),false);
});

test('management labor rates validate dates and six-decimal costs with HR-specific permissions', () => {
 const {employeeManagementRateSchema:s}=require('../src/lib/validations.ts');
 const {hasPermission}=require('../src/lib/auth.ts');
 const v={employee_id:id,valid_from:'2027-01-01',valid_to:null,hourly_cost:28.4,currency:'EUR'};
 assert.equal(s.safeParse(v).success,true);
 assert.equal(s.safeParse({...v,hourly_cost:0}).success,true);
 assert.equal(s.safeParse({...v,hourly_cost:28.123456,valid_to:'2027-01-01'}).success,true);
 for(const change of [{valid_to:'2026-12-31'},{valid_from:'2027-02-30'},{hourly_cost:-1},{hourly_cost:0.1234567},
 {hourly_cost:Infinity},{hourly_cost:1e8},{employee_id:'bad'},{currency:'EURO'}]) assert.equal(s.safeParse({...v,...change}).success,false);
 assert.equal(hasPermission('hr','employee.hr.read'),true);
 assert.equal(hasPermission('management','employee.hr.read'),false);
 assert.equal(hasPermission('administration','employee.hr.read'),false);
});

test('management labor entries validate hours and reject client financial snapshots', () => {
 const {projectLaborEntrySchema:s}=require('../src/lib/validations.ts');
 const v={employee_id:id,project_id:project,work_date:'2027-01-01',hours:142,hour_type:'ordinary'};
 for(const hour_type of ['ordinary','overtime','travel','other']) assert.equal(s.safeParse({...v,hour_type}).success,true);
 for(const change of [{hours:0},{hours:-1},{hours:0.001},{hours:1e6},{hours:Infinity},{hour_type:'holiday'},
 {employee_id:'bad'},{project_id:'bad'},{work_date:'2027-02-30'}]) assert.equal(s.safeParse({...v,...change}).success,false);
 const parsed=s.parse({...v,hourly_cost_snapshot:0,amount:0,currency:'USD',status:'cancelled'});
 for(const key of ['hourly_cost_snapshot','amount','currency','status']) assert.equal(key in parsed,false);
});
