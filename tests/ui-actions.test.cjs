const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
test('primary create actions are reachable from list pages and permission guarded',()=>{
 const invoices=read('src/app/(portal)/fatture/page.tsx');
 const invoiceTrigger=read('src/app/(portal)/fatture/new-invoice-trigger.tsx');
 const documents=read('src/app/(portal)/documenti/page.tsx');
 const documentTrigger=read('src/components/documents/upload-document-trigger.tsx');
 assert.match(invoices,/NewInvoiceTrigger/);assert.match(invoices,/access\.canCreate/);assert.match(invoiceTrigger,/\/fatture\/new/);
 assert.match(documents,/UploadDocumentTrigger/);assert.match(documents,/access\.canUpload/);assert.match(documentTrigger,/\/documenti\/new/);
 assert.match(invoices,/Nessuna fattura registrata/);assert.match(documents,/Nessun documento presente/);
});
test('context and detail actions remain navigable',()=>{
 const invoice=read('src/app/(portal)/fatture/[id]/page.tsx');
 const document=read('src/app/(portal)/documenti/[id]/page.tsx');
 const context=read('src/components/documents/context-documents.tsx');
 const payments=read('src/app/(portal)/pagamenti/page.tsx');
 assert.match(invoice,/\/documenti\/\$\{pdf\.id\}/);assert.match(invoice,/Visualizza PDF/);assert.match(invoice,/Scarica PDF/);assert.match(invoice,/saveFinancialMovementAction/);assert.match(invoice,/SubmitButton/);
 assert.match(document,/Nuova versione/);assert.match(document,/Modifica metadata/);assert.match(document,/set_document_archive|deleteDocumentAction/);assert.match(document,/restoreDocumentAction/);assert.match(document,/signed|versioni/);
 assert.match(context,/UploadDocumentTrigger/);assert.match(context,/project|company|invoice/);
 assert.match(payments,/Nuovo movimento/);assert.match(payments,/Modifica/);assert.match(payments,/archiveFinancialMovementAction/);
});
test('loading and server error feedback are wired',()=>{
 const upload=read('src/components/documents/upload-document-form.tsx');
 const invoice=read('src/components/ui/submit-button.tsx');
 const toast=read('src/components/ui/toast-notifications.tsx');
 assert.match(upload,/useActionState/);assert.match(upload,/state\.error/);assert.match(upload,/pending/);
 assert.match(invoice,/useFormStatus/);assert.match(invoice,/disabled=\{pending\}/);assert.match(toast,/success|error/);
});
