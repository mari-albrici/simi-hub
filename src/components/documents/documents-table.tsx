"use client";

import { useState } from "react";

import Link from "@/components/ui/app-link";

import type {
  ArchiveDocument,
} from "@/lib/documents";

import type {
  FolderTreeItem,
} from "@/lib/folders";

import {
  documentStatusLabels,
} from "@/lib/document-validation";

import {
  formatDate,
} from "@/lib/formatters";

import {
  moveDocumentAction,
} from "@/lib/document-folder-actions";


export function DocumentsTable({
  documents,
  folderTree = [],
  currentFolderId = null,
  canManage = false,
}: {
  documents: ArchiveDocument[];
  folderTree?: FolderTreeItem[];
  currentFolderId?: string | null;
  canManage?: boolean;
}) {
  const [
    movingDocument,
    setMovingDocument,
  ] = useState<ArchiveDocument | null>(
    null,
  );


  return (
    <>
      <div className="table-responsive">
        <table className="table table-admin table-hover align-middle">

          <thead>
            <tr>
              <th>Documento</th>
              <th>Categoria</th>
              <th>Data</th>
              <th>Commessa</th>
              <th>Scadenza</th>
              <th>Stato</th>

              {canManage && (
                <th
                  className="text-end"
                  aria-label="Azioni"
                />
              )}
            </tr>
          </thead>


          <tbody>
            {documents.map(
              (document) => (
                <tr key={document.id}>

                  {/* DOCUMENTO */}

                  <td
                    className="col-description"
                    title={
                      document.title ||
                      document.original_filename
                    }
                  >
                    <Link
                      href={`/documenti/${document.id}`}
                    >
                      {document.title ||
                        document.original_filename}
                    </Link>
                  </td>


                  {/* CATEGORIA */}

                  <td
                    className="col-description"
                    title={
                      document.category_name ||
                      "Non classificato"
                    }
                  >
                    {document.category_name ||
                      "Non classificato"}
                  </td>


                  {/* DATA */}

                  <td className="col-date">
                    {formatDate(
                      document.document_date,
                    )}
                  </td>


                  {/* COMMESSA */}

                  <td className="col-description">
                    {document.projects.map(
                      (project) => (
                        <div key={project.id}>
                          <Link
                            href={`/commesse/${project.id}`}
                          >
                            {project.label}
                          </Link>
                        </div>
                      ),
                    )}
                  </td>


                  {/* SCADENZA */}

                  <td className="col-date">
                    {formatDate(
                      document.expiry_date,
                    )}
                  </td>


                  {/* STATO */}

                  <td className="col-status">
                    <span
                      className={`badge text-bg-${
                        document.display_status ===
                        "expired"
                          ? "danger"
                          : document.display_status ===
                              "expiring"
                            ? "warning"
                            : "secondary"
                      }`}
                    >
                      {documentStatusLabels[
                        document.display_status
                      ] ||
                        document.display_status}
                    </span>
                  </td>


                  {/* AZIONI */}

                  {canManage && (
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-light border-0"
                        aria-label={`Azioni documento ${
                          document.title ||
                          document.original_filename
                        }`}
                        title="Sposta documento"
                        onClick={() =>
                          setMovingDocument(
                            document,
                          )
                        }
                      >
                        <i
                          className="bi bi-three-dots-vertical"
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                  )}

                </tr>
              ),
            )}


            {!documents.length && (
              <tr>
                <td
                  colSpan={
                    canManage
                      ? 7
                      : 6
                  }
                  className="text-muted py-4"
                >
                  Nessun documento per i filtri selezionati.
                </td>
              </tr>
            )}
          </tbody>

        </table>
      </div>


      {/* =====================================================
          MODALE SPOSTA DOCUMENTO
          ===================================================== */}

      {movingDocument && (
        <div
          className="modal d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-backdrop show" />

          <div
            className="modal-dialog modal-dialog-centered position-relative"
            style={{
              zIndex: 1060,
            }}
          >
            <div className="modal-content">

              <div className="modal-header">
                <h2 className="modal-title fs-5">
                  Sposta documento
                </h2>

                <button
                  type="button"
                  className="btn-close"
                  aria-label="Chiudi"
                  onClick={() =>
                    setMovingDocument(null)
                  }
                />
              </div>


              <form
                action={
                  moveDocumentAction
                }
              >
                <div className="modal-body">

                  <input
                    type="hidden"
                    name="document_id"
                    value={
                      movingDocument.id
                    }
                  />


                  {currentFolderId && (
                    <input
                      type="hidden"
                      name="current_folder_id"
                      value={
                        currentFolderId
                      }
                    />
                  )}


                  <p>
                    Scegli dove spostare{" "}
                    <strong>
                      {movingDocument.title ||
                        movingDocument.original_filename}
                    </strong>
                    .
                  </p>


                  <label
                    className="form-label"
                    htmlFor={`move-document-${movingDocument.id}`}
                  >
                    Destinazione
                  </label>


                  <select
                    id={`move-document-${movingDocument.id}`}
                    name="destination_folder_id"
                    className="form-select"
                    defaultValue={
                      movingDocument.folder_id ??
                      ""
                    }
                  >
                    <option value="">
                      📂 Documenti
                    </option>

                    {folderTree.map(
                      (folder) => (
                        <option
                          key={folder.id}
                          value={folder.id}
                        >
                          {`${"— ".repeat(
                            folder.depth + 1,
                          )}${folder.name}`}
                        </option>
                      ),
                    )}
                  </select>


                  <div className="form-text">
                    Il documento verrà spostato
                    nella cartella selezionata.
                    Collegamenti, metadati e
                    versioni non verranno
                    modificati.
                  </div>

                </div>


                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() =>
                      setMovingDocument(null)
                    }
                  >
                    Annulla
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    Sposta
                  </button>
                </div>

              </form>

            </div>
          </div>
        </div>
      )}
    </>
  );
}