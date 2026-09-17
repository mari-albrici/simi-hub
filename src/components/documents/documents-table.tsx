"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatDateIT, formatFileSize } from "@/lib/dashboard-helpers";
import { updateDocumentAction, deleteDocumentAction } from "@/lib/upload";
import type { DocumentRecord } from "@/lib/data";

export function DocumentsTable({ documents }: { documents: DocumentRecord[] }) {
  const [viewing, setViewing] = useState<DocumentRecord | null>(null);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);

  return (
    <>
      <div className="app-card p-0">
        <table className="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Nome file</th>
              <th>Dimensione</th>
              <th>Caricato il</th>
              <th>Scadenza</th>
              <th>Stato</th>
              <th className="text-end">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <button
                    type="button"
                    className="btn btn-link p-0 text-decoration-none fw-semibold"
                    onClick={() => setViewing(doc)}
                    disabled={!doc.downloadUrl}
                  >
                    {doc.title || doc.original_filename}
                  </button>
                </td>
                <td>{formatFileSize(doc.file_size)}</td>
                <td>{formatDateIT(doc.created_at)}</td>
                <td>{doc.expiry_date ? formatDateIT(doc.expiry_date) : "-"}</td>
                <td><StatusBadge status={doc.status} /></td>
                <td className="text-end">
                  <div className="d-flex gap-2 justify-content-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setViewing(doc)}
                      disabled={!doc.downloadUrl}
                    >
                      Visualizza
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(doc)}>
                      Modifica
                    </button>
                    <form action={deleteDocumentAction}>
                      <input type="hidden" name="id" value={doc.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Eliminare "${doc.title || doc.original_filename}"?`}
                        pendingLabel="Eliminazione…"
                      >
                        Elimina
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <div className="modal d-block" tabIndex={-1} role="dialog" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{viewing.title || viewing.original_filename}</h5>
                <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setViewing(null)} />
              </div>
              <div className="modal-body p-0" style={{ height: "75vh" }}>
                {viewing.downloadUrl ? (
                  <iframe
                    src={viewing.downloadUrl}
                    title={viewing.title || viewing.original_filename}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                  />
                ) : (
                  <div className="p-3 text-muted">Anteprima non disponibile.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal d-block" tabIndex={-1} role="dialog" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered" role="document">
            <div className="modal-content">
              <form action={updateDocumentAction} onSubmit={() => setEditing(null)}>
                <input type="hidden" name="id" value={editing.id} />
                <div className="modal-header">
                  <h5 className="modal-title">Modifica documento</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setEditing(null)} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Nome documento</label>
                    <input name="title" className="form-control" defaultValue={editing.title ?? editing.original_filename} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Data di scadenza</label>
                    <input name="expiry_date" type="date" className="form-control" defaultValue={editing.expiry_date ?? ""} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>Annulla</button>
                  <SubmitButton className="btn btn-dark" pendingLabel="Salvataggio…">Salva</SubmitButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
