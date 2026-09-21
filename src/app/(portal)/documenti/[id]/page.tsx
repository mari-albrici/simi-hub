import { ContextWork, ContextAnomalies } from "@/components/work/context";
import { DocumentPreview } from "@/components/documents/document-preview";
import { FileLink } from "@/components/documents/file-link";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import {
  getArchiveDocument,
  getDocumentVersions,
  documentOptions,
} from "@/lib/documents";
import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { documentStatusLabels } from "@/lib/document-validation";
import { ContextFields } from "@/components/documents/document-fields";
import {
  updateDocumentAction,
  deleteDocumentAction,
  restoreDocumentAction,
  linkDocumentAction,
  finalizeDocumentAction,
} from "@/lib/upload";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const user = await requirePagePermission("document.read");
  const { id } = await params;

  const doc = await getArchiveDocument(id);

  if (!doc) {
    notFound();
  }

  const [versions, options, query] = await Promise.all([
    getDocumentVersions(id),
    documentOptions(),
    searchParams,
  ]);

  const canEdit =
    hasPermission(user.role, "document.update") &&
    !doc.archived_at;

  const canUpload =
    canEdit &&
    hasPermission(user.role, "document.upload");

  const canArchive =
    hasPermission(user.role, "document.delete");

  const person = (personId: string | null) =>
    options.profiles.find(
      (profile) => profile.id === personId
    );

  const personName = (personId: string | null) => {
    const profile = person(personId);

    if (!profile) {
      return personId || "—";
    }

    return (
      [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ") ||
      personId ||
      "—"
    );
  };

  const documentTitle =
    doc.title || doc.original_filename;

  const currentVersion = versions.find(
    (version) => version.id === doc.current_version_id
  );

  const previousVersions = versions.filter(
    (version) => version.id !== doc.current_version_id
  );

  const hasLinks =
    doc.projects.length > 0 ||
    doc.companies.length > 0 ||
    doc.invoices.length > 0 ||
    Boolean(doc.expiry_date);

  return (
    <>
      {/* ======================================================
          BREADCRUMB
      ====================================================== */}

      <Link
        href="/documenti"
        className="breadcrumb-link"
      >
        <i
          className="bi bi-arrow-left me-1"
          aria-hidden="true"
        />
        Archivio documenti
      </Link>


      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="d-flex justify-content-between align-items-start gap-3 my-3 flex-wrap">
        <div>
          <h1 className="h3 mb-2">
            {documentTitle}
          </h1>

          <span className="badge text-bg-light border">
            {documentStatusLabels[doc.display_status]}
          </span>
        </div>

        <div className="d-flex gap-2 align-items-center flex-wrap">
          {canEdit && (
            <Link
              className="btn btn-outline-secondary"
              href={`/documenti/${id}/edit`}
            >
              <i
                className="bi bi-pencil me-2"
                aria-hidden="true"
              />
              Modifica dati
            </Link>
          )}

          {canUpload && (
            <Link
              className="btn btn-dark"
              href={`/documenti/${id}/versions/new`}
            >
              <i
                className="bi bi-upload me-2"
                aria-hidden="true"
              />
              Nuova versione
            </Link>
          )}

          {/* MENU ALTRE AZIONI */}

          {(doc.file_state === "ready" || canArchive) && (
            <div className="dropdown">
              <button
                type="button"
                className="btn btn-outline-secondary"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                aria-label="Altre azioni"
              >
                <i
                  className="bi bi-three-dots"
                  aria-hidden="true"
                />
              </button>

              <ul className="dropdown-menu dropdown-menu-end">
                {doc.file_state === "ready" &&
                  !doc.archived_at && (
                    <li>
                      <FileLink
                        className="dropdown-item"
                        href={`/documenti/versioni/${doc.current_version_id}/file?download=1`}
                      >
                        <i
                          className="bi bi-download me-2"
                          aria-hidden="true"
                        />
                        Scarica documento
                      </FileLink>
                    </li>
                  )}

                {canArchive && (
                  <>
                    {doc.file_state === "ready" &&
                      !doc.archived_at && (
                        <li>
                          <hr className="dropdown-divider" />
                        </li>
                      )}

                    <li>
                      <form
                        action={
                          doc.archived_at
                            ? restoreDocumentAction
                            : deleteDocumentAction
                        }
                      >
                        <input
                          type="hidden"
                          name="id"
                          value={id}
                        />

                        <ConfirmSubmitButton
                          className={
                            doc.archived_at
                              ? "dropdown-item"
                              : "dropdown-item text-danger"
                          }
                          confirmMessage={
                            doc.archived_at
                              ? "Ripristinare questo documento?"
                              : "Archiviare il documento conservando tutte le versioni?"
                          }
                        >
                          <i
                            className={`bi ${
                              doc.archived_at
                                ? "bi-arrow-counterclockwise"
                                : "bi-archive"
                            } me-2`}
                            aria-hidden="true"
                          />

                          {doc.archived_at
                            ? "Ripristina documento"
                            : "Archivia documento"}
                        </ConfirmSubmitButton>
                      </form>
                    </li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>


      {/* ======================================================
          MESSAGGIO SUCCESSO
      ====================================================== */}

      {query.success && (
        <div className="alert alert-success">
          {query.success}
        </div>
      )}


      {/* ======================================================
          DOCUMENTO + DATI
      ====================================================== */}

      <div className="row g-4 mb-4">

        {/* ==================================================
            ANTEPRIMA DOCUMENTO
        ================================================== */}

        <div className="col-xl-7">
          <section
            className="document-viewer-panel h-100"
            aria-labelledby="document-preview-title"
          >
            <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
              <h2
                className="h5 mb-0"
                id="document-preview-title"
              >
                <i
                  className="bi bi-file-earmark-pdf me-2 text-danger"
                  aria-hidden="true"
                />
                Anteprima documento
              </h2>

              {doc.file_state === "ready" &&
                !doc.archived_at && (
                  <FileLink
                    className="btn btn-sm btn-outline-secondary"
                    href={`/documenti/versioni/${doc.current_version_id}/file?download=1`}
                  >
                    <i
                      className="bi bi-download me-2"
                      aria-hidden="true"
                    />
                    Scarica
                  </FileLink>
                )}
            </div>

            {doc.file_state === "ready" &&
            !doc.archived_at ? (
              <DocumentPreview
                title={documentTitle}
                src={`/documenti/versioni/${doc.current_version_id}/file`}
                className="document-viewer-frame"
              />
            ) : (
              <p className="text-muted mb-0">
                {doc.archived_at
                  ? "Documento archiviato. Ripristinalo per accedere ai file."
                  : doc.file_state === "failed"
                    ? "Upload fallito. Carica una nuova versione."
                    : "Upload in attesa di finalizzazione."}
              </p>
            )}
          </section>
        </div>


        {/* ==================================================
            DATI DOCUMENTO
        ================================================== */}

        <div className="col-xl-5">
          <section className="app-card p-4 h-100">
            <div className="mb-4">
              <h2 className="h5 mb-1">
                Dati documento
              </h2>

              <div className="small text-muted">
                Informazioni e classificazione del documento
              </div>
            </div>

            <dl className="mb-0">
              {[
                [
                  "Categoria",
                  doc.category_name || "Non classificato",
                ],
                [
                  "Stato",
                  documentStatusLabels[doc.display_status],
                ],
                [
                  "Società SIMI",
                  doc.entity_name,
                ],
                [
                  "Numero / riferimento",
                  doc.reference,
                ],
                [
                  "Data documento",
                  doc.document_date
                    ? formatDate(doc.document_date)
                    : null,
                ],
                [
                  "Scadenza",
                  doc.expiry_date
                    ? formatDate(doc.expiry_date)
                    : null,
                ],
                [
                  "Paese / lingua",
                  [doc.country, doc.language]
                    .filter(Boolean)
                    .join(" / "),
                ],
                [
                  "Descrizione",
                  doc.description,
                ],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div
                    key={label}
                    className="py-2 border-bottom"
                  >
                    <dt className="small text-muted fw-normal mb-1">
                      {label}
                    </dt>

                    <dd className="mb-0 fw-medium text-break">
                      {value}
                    </dd>
                  </div>
                ))}
            </dl>

            {(canEdit || doc.notes) && (
              <section className="document-notes border-top mt-4 pt-3" aria-labelledby="document-notes-title">
                <h3 id="document-notes-title" className="h6 mb-3">Note</h3>
                {canEdit ? (
                  <form action={updateDocumentAction}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="intent" value="notes" />
                    <input type="hidden" name="expected_updated_at" value={doc.updated_at} />
                    <textarea
                      key={doc.updated_at}
                      name="notes"
                      aria-labelledby="document-notes-title"
                      className="form-control"
                      defaultValue={doc.notes ?? ""}
                      placeholder="Scrivi una nota sul documento..."
                      rows={5}
                      maxLength={10000}
                    />
                    <div className="d-flex justify-content-end mt-2">
                      <SubmitButton className="btn btn-sm btn-outline-secondary" pendingLabel="Salvataggio…">
                        <i className="bi bi-check-lg me-1" aria-hidden="true" />
                        Salva nota
                      </SubmitButton>
                    </div>
                  </form>
                ) : (
                  <p className="document-notes-content text-break mb-0">{doc.notes}</p>
                )}
              </section>
            )}
          </section>
        </div>
      </div>


      {/* ======================================================
          GESTIONE DOCUMENTO
      ====================================================== */}

      <section className="app-card p-4 mb-4">
        <div className="mb-4">
          <h2 className="h5 mb-1">
            Gestione documento
          </h2>

          <div className="small text-muted">
            Collegamenti e storico del documento
          </div>
        </div>

        <div className="row g-4">

          {/* ==================================================
              COLLEGAMENTI
          ================================================== */}

          <div className="col-lg-6">
            <div className="pe-lg-4 h-100 border-lg-end">
              <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
                <div>
                  <div className="small text-uppercase text-muted fw-semibold mb-1">
                    Collegamenti
                  </div>

                  <h3 className="h6 mb-0">
                    Record collegati
                  </h3>
                </div>

                {hasLinks && (
                  <span className="badge text-bg-light border">
                    {doc.projects.length +
                      doc.companies.length +
                      doc.invoices.length +
                      (doc.expiry_date ? 1 : 0)}
                  </span>
                )}
              </div>

              {hasLinks ? (
                <div className="d-flex flex-wrap gap-2">
                  {doc.projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/commesse/${project.id}`}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      <i
                        className="bi bi-folder me-2"
                        aria-hidden="true"
                      />
                      {project.label}
                    </Link>
                  ))}

                  {doc.companies.map((company) => (
                    <Link
                      key={company.id}
                      href={`/${
                        company.type === "supplier"
                          ? "fornitori"
                          : "clienti"
                      }/${company.id}`}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      <i
                        className="bi bi-building me-2"
                        aria-hidden="true"
                      />
                      {company.label}
                    </Link>
                  ))}

                  {doc.invoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={`/fatture/${invoice.id}`}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      <i
                        className="bi bi-receipt me-2"
                        aria-hidden="true"
                      />
                      {invoice.label}
                    </Link>
                  ))}

                  {doc.expiry_date && (
                    <Link
                      href={`/scadenze?kind=document&q=${encodeURIComponent(
                        documentTitle
                      )}`}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      <i
                        className="bi bi-calendar-event me-2"
                        aria-hidden="true"
                      />
                      Scadenziario
                    </Link>
                  )}
                </div>
              ) : (
                <div className="small text-muted">
                  Nessun record collegato.
                </div>
              )}

              {canEdit && (
                <details className="document-management-details mt-4">
                  <summary className="document-management-summary">
                    <i
                      className="bi bi-plus-lg me-2"
                      aria-hidden="true"
                    />
                    Aggiungi collegamento
                  </summary>

                  <form
                    action={linkDocumentAction}
                    className="row g-3 mt-2"
                  >
                    <input
                      name="id"
                      type="hidden"
                      value={id}
                    />

                    <ContextFields options={options} />

                    <div>
                      <SubmitButton
                        className="btn btn-sm btn-outline-secondary"
                        pendingLabel="Collegamento…"
                      >
                        Collega senza duplicare il file
                      </SubmitButton>
                    </div>
                  </form>
                </details>
              )}
            </div>
          </div>


          {/* ==================================================
              VERSIONE CORRENTE
          ================================================== */}

          <div className="col-lg-6">
            <div className="ps-lg-2">
              <div className="small text-uppercase text-muted fw-semibold mb-1">
                Versione
              </div>

              <h3 className="h6 mb-3">
                Versione corrente
              </h3>

              {currentVersion ? (
                <>
                  <div className="document-current-version">
                    <div className="d-flex align-items-start justify-content-between gap-3">
                      <div className="min-w-0">
                        <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                          <span className="fw-semibold">
                            v{currentVersion.version_number}
                            {currentVersion.label
                              ? ` · ${currentVersion.label}`
                              : ""}
                          </span>

                          <span className="badge text-bg-primary">
                            Corrente
                          </span>
                        </div>

                        <div className="text-break mb-1">
                          {currentVersion.original_filename}
                        </div>

                        <div className="small text-muted">
                          {formatDateTime(
                            currentVersion.created_at
                          )}
                          {" · "}
                          {personName(
                            currentVersion.created_by
                          )}
                        </div>

                        {currentVersion.notes && (
                          <div className="small mt-2">
                            {currentVersion.notes}
                          </div>
                        )}
                      </div>

                      {currentVersion.file_state === "ready" &&
                        !doc.archived_at && (
                          <div className="d-flex gap-2 flex-shrink-0">
                            <FileLink
                              className="btn btn-sm btn-outline-secondary"
                              href={`/documenti/versioni/${currentVersion.id}/file`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Apri
                            </FileLink>

                            <FileLink
                              className="btn btn-sm btn-outline-secondary"
                              href={`/documenti/versioni/${currentVersion.id}/file?download=1`}
                            >
                              <i
                                className="bi bi-download"
                                aria-hidden="true"
                              />
                              <span className="visually-hidden">
                                Scarica
                              </span>
                            </FileLink>
                          </div>
                        )}
                    </div>

                    {currentVersion.file_state === "pending" &&
                      canUpload &&
                      currentVersion.created_by === user.id && (
                        <form
                          action={finalizeDocumentAction}
                          className="mt-3"
                        >
                          <input
                            type="hidden"
                            name="id"
                            value={id}
                          />

                          <input
                            type="hidden"
                            name="version"
                            value={currentVersion.id}
                          />

                          <label className="form-check small mb-2">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              name="acknowledge_duplicate"
                              value="1"
                            />

                            Conferma eventuale contenuto duplicato
                          </label>

                          <SubmitButton
                            className="btn btn-sm btn-outline-secondary"
                            pendingLabel="Finalizzazione…"
                          >
                            Riprova finalizzazione
                          </SubmitButton>
                        </form>
                      )}
                  </div>


                  {/* ==========================================
                      STORICO VERSIONI
                  ========================================== */}

                  {previousVersions.length > 0 && (
                    <details className="document-management-details mt-4">
                      <summary className="document-management-summary">
                        Storico versioni
                        <span className="badge text-bg-light border ms-2">
                          {previousVersions.length}
                        </span>
                      </summary>

                      <div className="table-responsive mt-3">
                        <table className="table table-admin table-hover align-middle mb-0">
                          <thead>
                            <tr>
                              <th>Versione</th>
                              <th>File</th>
                              <th>Data / autore</th>
                              <th>Note</th>
                              <th>Azioni</th>
                            </tr>
                          </thead>

                          <tbody>
                            {previousVersions.map(
                              (version) => (
                                <tr key={version.id}>
                                  <td>
                                    <span className="fw-medium">
                                      v{version.version_number}
                                      {version.label
                                        ? ` · ${version.label}`
                                        : ""}
                                    </span>
                                  </td>

                                  <td>
                                    {version.original_filename}
                                  </td>

                                  <td>
                                    <div>
                                      {formatDateTime(
                                        version.created_at
                                      )}
                                    </div>

                                    <div className="small text-muted">
                                      {personName(
                                        version.created_by
                                      )}
                                    </div>
                                  </td>

                                  <td>
                                    {version.notes || "—"}
                                  </td>

                                  <td>
                                    {version.file_state ===
                                      "ready" &&
                                      !doc.archived_at && (
                                        <div className="d-flex gap-2">
                                          <FileLink
                                            href={`/documenti/versioni/${version.id}/file`}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            Apri
                                          </FileLink>

                                          <span className="text-muted">
                                            ·
                                          </span>

                                          <FileLink
                                            href={`/documenti/versioni/${version.id}/file?download=1`}
                                          >
                                            Scarica
                                          </FileLink>
                                        </div>
                                      )}

                                    {version.file_state ===
                                      "pending" &&
                                      canUpload &&
                                      version.created_by ===
                                        user.id && (
                                        <form
                                          action={
                                            finalizeDocumentAction
                                          }
                                          className="d-flex flex-column gap-2"
                                        >
                                          <input
                                            type="hidden"
                                            name="id"
                                            value={id}
                                          />

                                          <input
                                            type="hidden"
                                            name="version"
                                            value={version.id}
                                          />

                                          <label className="form-check small">
                                            <input
                                              className="form-check-input"
                                              type="checkbox"
                                              name="acknowledge_duplicate"
                                              value="1"
                                            />

                                            Conferma eventuale contenuto duplicato
                                          </label>

                                          <div>
                                            <SubmitButton
                                              className="btn btn-sm btn-outline-secondary"
                                              pendingLabel="Finalizzazione…"
                                            >
                                              Riprova finalizzazione
                                            </SubmitButton>
                                          </div>
                                        </form>
                                      )}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}

                  {previousVersions.length === 0 && (
                    <div className="small text-muted mt-3">
                      Nessuna versione precedente.
                    </div>
                  )}
                </>
              ) : (
                <div className="small text-muted">
                  Nessuna versione disponibile.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>


      {/* ======================================================
          ANOMALIE
          Il componente può essere reso invisibile quando vuoto.
      ====================================================== */}

      <ContextAnomalies
        kind="document"
        id={doc.id}
      />


      {/* ======================================================
          ATTIVITÀ
          Il componente può essere reso invisibile quando vuoto.
      ====================================================== */}

      <ContextWork
        kind="document"
        id={doc.id}
      />
    </>
  );
}