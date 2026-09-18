const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMonetaryAmount, parsePdfAmount } = require('../src/lib/money.ts');
const { invoiceSchema, dateSchema, companyFormSchema, projectFormSchema } = require('../src/lib/validations.ts');
const { validateDocumentFile } = require('../src/lib/files.ts');
const { deriveFinancialState } = require('../src/lib/finance-calculations.ts');
const { PERMISSION_MATRIX } = require('../src/lib/constants.ts');
const fs = require('node:fs');

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
