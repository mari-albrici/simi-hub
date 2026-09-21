const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarizeDeadlineFinance,summarizeInvoiceAmounts}=require('../src/lib/dashboard-financial.ts');
const {getTimeStatus}=require('../src/lib/dashboard-helpers.ts');
const today='2026-09-21';
const row=(residual,extra={})=>({source:'financial',kind:'payment',currency:'EUR',residual,due_date:'2026-10-01',completed:residual===0,archived_at:null,temporal_status:'future',...extra});
test('financial scenarios: unpaid, partial, split installments, settled, overdue and currencies',()=>{
 for(const [rows,exposure,future,overdue] of [
  [[row(1000)],1000,1000,0],
  [[row(600)],600,600,0],
  [[row(0),row(500,{due_date:'2026-11-01'})],500,500,0],
  [[row(0)],0,0,0],
  [[row(300,{due_date:'2026-09-20',temporal_status:'overdue'})],300,0,300],
 ]){
  const s=summarizeDeadlineFinance(rows,today);
  assert.equal(s.payable.currencies.EUR??0,exposure);
  assert.equal(s.cashFlow.slice(1).reduce((n,p)=>n+p.outflow,0),future);
  assert.equal(s.payableOverdue.currencies.EUR??0,overdue);
 }
 const split=summarizeDeadlineFinance([row(0),row(500,{due_date:'2026-11-01'})],today);
 assert.equal(split.cashFlow[1].outflow,0);assert.equal(split.cashFlow[2].outflow,500);
 const multi=summarizeDeadlineFinance([row(1000),row(800,{currency:'USD'}),row(900,{currency:'CHF',kind:'receipt'})],today);
 assert.deepEqual(multi.payable.currencies,{EUR:1000,USD:800});assert.equal(multi.cashFlow[1].outflow,1000);assert.equal(multi.cashFlow[1].inflow,0);assert.deepEqual(multi.otherCurrencies,['CHF','USD']);
});
test('undated exposure is retained, archives/manual/completed do not inflate finances, money stays in cents',()=>{
 const s=summarizeDeadlineFinance([row(0.1),row(0.2),row(100,{due_date:null}),row(800,{archived_at:today}),row(900,{source:'manual'}),row(0)],today);
 assert.equal(s.payable.amount,100.3);assert.equal(s.undatedCount,1);assert.equal(s.cashFlow[1].outflow,0.3);assert.equal(s.payable.count,3);
});
test('report separates purchases, sales and currencies, including signed adjustments',()=>{
 const rows=[{invoice_type:'purchase',currency:'EUR',amount_total:1000},{invoice_type:'sale',currency:'EUR',amount_total:700},{invoice_type:'purchase',currency:'USD',amount_total:900},{invoice_type:'purchase',currency:'EUR',amount_total:-100}];
 assert.deepEqual(summarizeInvoiceAmounts(rows),[{type:'purchase',currency:'EUR',amount:900},{type:'purchase',currency:'USD',amount:900},{type:'sale',currency:'EUR',amount:700}]);
});
test('UTC date windows preserve today, upcoming seven days and future boundaries',()=>{
 assert.equal(getTimeStatus('2026-09-20',today),'overdue');assert.equal(getTimeStatus(today,today),'today');assert.equal(getTimeStatus('2026-09-28',today),'upcoming');assert.equal(getTimeStatus('2026-09-29',today),'future');
 const s=summarizeDeadlineFinance([row(10,{due_date:today}),row(20,{due_date:'2026-09-28'}),row(30,{due_date:'2026-09-29'})],today);assert.equal(s.supplierSummary.dueSoon7,30);
});
