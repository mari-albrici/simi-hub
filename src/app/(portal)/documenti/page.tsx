import { uploadDocumentAction } from "@/lib/upload";
import { getDocuments } from "@/lib/data";
import { SubmitButton } from "@/components/ui/submit-button";
import { DocumentsTable } from "@/components/documents/documents-table";

type DocumentiSearchParams = { error?: string };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<DocumentiSearchParams>;
}) {
  const { error } = await searchParams;
  const documents = await getDocuments();

  return (
    <><div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Documenti</h1>
          <p className="text-muted mb-0">Archivio documentale delle commesse e delle aziende.</p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="app-card p-3 mb-4">
        <h2 className="h5 mb-3">Carica documento</h2>
        <form action={uploadDocumentAction} className="row g-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label">File</label>
            <input className="form-control" type="file" name="file" required />
          </div>
          <div className="col-md-3">
            <SubmitButton>Carica</SubmitButton>
          </div>
        </form>
      </div>

      <div className="content-panel p-3 mb-4">
        <div className="row g-2">
          <div className="col-md-3"><input className="form-control" placeholder="Ricerca documento" /></div>
          <div className="col-md-2"><select className="form-select"><option>Categoria</option></select></div>
          <div className="col-md-2"><select className="form-select"><option>Commessa</option></select></div>
          <div className="col-md-2"><select className="form-select"><option>Cliente</option></select></div>
          <div className="col-md-2"><select className="form-select"><option>Stato</option></select></div>
          <div className="col-md-1"><button className="btn btn-outline-secondary w-100">Filtra</button></div>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="app-card p-3">
          <div className="empty-state">
            <div className="h5">Nessun documento caricato</div>
            <p className="mb-0">Inizia caricando i documenti della prima commessa o del team amministrativo.</p>
          </div>
        </div>
      ) : (
        <DocumentsTable documents={documents} />
      )}
    </>
  );
}
