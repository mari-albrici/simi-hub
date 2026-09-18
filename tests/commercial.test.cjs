const {test}=require('node:test');
const assert=require('node:assert/strict');
const {orderFormSchema,deliveryFormSchema}=require('../src/lib/commercial-validation.ts');
const id='11111111-1111-4111-8111-111111111111';
const line={position:0,description:'Materiale',quantity:100,unit:'pz',project_id:id,unit_price:10,discount:0,vat_rate:20};
const order={order_number:'PO-1',order_date:'2026-09-18',order_type:'purchase',legal_entity_id:id,counterparty_id:id,currency:'EUR',status:'confirmed',project_ids:[id],lines:[line]};
test('order form validates stable IDs and discounts without assuming Italian VAT',()=>{
 assert.equal(orderFormSchema.safeParse(order).success,true);
 assert.equal(orderFormSchema.safeParse({...order,id,expected_updated_at:'2026-09-18T12:00:00Z',lines:[{...line,id}]}).success,true);
 for(const patch of [{quantity:0},{discount:1001},{vat_rate:101},{description:''},{id:'fake'},{quantity:0.0001}])assert.equal(orderFormSchema.safeParse({...order,lines:[{...line,...patch}]}).success,false);
});
test('DDT supports optional order, partial quantities, multiple projects and stable IDs',()=>{
 const note={note_number:'DDT-1',note_date:'2026-09-18',direction:'inbound',legal_entity_id:id,counterparty_id:id,order_ids:[],lines:[{...line,id,quantity:40,order_line_id:id},{...line,project_id:null,order_line_id:null}]};
 assert.equal(deliveryFormSchema.safeParse(note).success,true);
 assert.equal(deliveryFormSchema.safeParse({...note,note_date:'2026-02-30'}).success,false);
 assert.equal(deliveryFormSchema.safeParse({...note,lines:[]}).success,false);
});
