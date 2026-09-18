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
 assert.doesNotMatch(invoice,/\/documenti\/\$\{pdf\.id\}/);assert.match(invoice,/PdfPreviewModal/);assert.match(invoice,/Documento fattura/);assert.match(invoice,/saveFinancialMovementAction/);assert.match(invoice,/SubmitButton/);
 assert.match(document,/Nuova versione/);assert.match(document,/Modifica dati/);assert.doesNotMatch(document,/Eventi registrati/);assert.match(document,/Dati/);assert.match(document,/deleteDocumentAction/);assert.match(document,/restoreDocumentAction/);assert.match(document,/document-viewer-frame/);
 assert.match(context,/UploadDocumentTrigger/);assert.match(context,/project|company|invoice/);
 assert.match(payments,/Nuovo movimento/);assert.match(payments,/Modifica/);assert.match(payments,/archiveFinancialMovementAction/);
});

test('PDF experience is shared and contextual',()=>{
 const modal=read('src/components/documents/pdf-preview-modal.tsx');
 const commercial=read('src/components/commercial/documents.tsx');
 assert.match(modal,/modal-xl/);assert.match(modal,/Scarica/);assert.match(modal,/Escape/);assert.match(modal,/versioni\/\$\{versionId\}\/file/);
 assert.match(commercial,/PdfPreviewModal/);assert.doesNotMatch(commercial,/href=\{`\/documenti\/\$\{d\.id\}`\}/);
});

test('loading feedback is shared, localized and retryable',()=>{
 const loading=read('src/components/ui/loading.tsx');
 const submit=read('src/components/ui/submit-button.tsx');
 const confirm=read('src/components/ui/confirm-submit-button.tsx');
 const upload=read('src/components/documents/upload-document-form.tsx');
 const pdf=read('src/components/documents/pdf-preview-modal.tsx');
 assert.match(loading,/LoadingSpinner/);assert.match(loading,/TableLoading/);assert.match(loading,/aria-busy/);
 assert.match(submit,/disabled=\{pending\}/);assert.match(submit,/pendingLabel/);
 assert.match(confirm,/inferredLabel/);assert.match(confirm,/Archiviazione/);
 assert.match(upload,/Caricamento documento/);assert.match(upload,/aria-busy=\{pending\}/);
 assert.match(pdf,/Caricamento PDF/);assert.match(pdf,/Impossibile caricare il PDF/);assert.match(pdf,/Riprova/);assert.match(pdf,/onError/);
});
test('loading and server error feedback are wired',()=>{
 const upload=read('src/components/documents/upload-document-form.tsx');
 const invoice=read('src/components/ui/submit-button.tsx');
 const toast=read('src/components/ui/toast-notifications.tsx');
 assert.match(upload,/useActionState/);assert.match(upload,/state\.error/);assert.match(upload,/pending/);
 assert.match(invoice,/useFormStatus/);assert.match(invoice,/disabled=\{pending\}/);assert.match(toast,/success|error/);
});
