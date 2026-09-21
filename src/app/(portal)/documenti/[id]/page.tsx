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
        .join(" ") || personId || "—"
    );
  };

  const documentTitle =
    doc.title || doc.original_filename;

  const visibilityLabels: Record<string, string> = {
    general: "Standard",
    restricted: "Riservato",
    hr: "HR",
  };

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

      <div className="d-flex justify-content-between align-items-start gap-3 my-3">

        <div>
          <h1 className="h3 mb-2">
            {documentTitle}
          </h1>

          <span className="badge text-bg-light border">
            {documentStatusLabels[doc.display_status]}
          </span>
        </div>

        <div className="d-flex gap-2 flex-wrap">

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
======================================================= */}

<div className="row g-4 mb-4">

  {/* ==================================================
      ANTEPRIMA DOCUMENTO — ~60%
  =================================================== */}

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
      DATI DOCUMENTO — ~40%
  =================================================== */}

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

          [
            "Note",
            doc.notes,
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

    </section>

  </div>

</div>

      {/* ======================================================
          COLLEGAMENTI
      ====================================================== */}

      <section className="app-card p-4 mb-4">

        <div className="mb-3">
          <h2 className="h5 mb-1">
            Collegamenti
          </h2>

          <div className="small text-muted">
            Record collegati a questo documento
          </div>
        </div>

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


        {/* AGGIUNGI COLLEGAMENTI */}

        {canEdit && (
          <details className="mt-4">

            <summary className="fw-medium">
              Aggiungi collegamenti
            </summary>

            <form
              action={linkDocumentAction}
              className="row g-3 mt-1"
            >
              <input
                name="id"
                type="hidden"
                value={id}
              />

              <ContextFields options={options} />

              <div>
                <SubmitButton
                  className="btn btn-outline-secondary"
                  pendingLabel="Collegamento…"
                >
                  Collega senza duplicare il file
                </SubmitButton>
              </div>

            </form>

          </details>
        )}

      </section>


      {/* ======================================================
          VERSIONI
      ====================================================== */}

      <section className="app-card p-4 mb-4">

        <div className="mb-3">
          <h2 className="h5 mb-1">
            Versioni
          </h2>

          <div className="small text-muted">
            Storico delle versioni del documento
          </div>
        </div>

        <div className="table-responsive">

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

              {versions.map((version) => (
                <tr key={version.id}>

                  <td>
                    <div className="d-flex align-items-center gap-2">

                      <span>
                        {version.version_number}
                        {version.label
                          ? ` ${version.label}`
                          : ""}
                      </span>

                      {version.id ===
                        doc.current_version_id && (
                        <span className="badge text-bg-primary">
                          Corrente
                        </span>
                      )}

                    </div>
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
                      {personName(version.created_by)}
                    </div>
                  </td>

                  <td>
                    {version.notes || "—"}
                  </td>

                  <td>

                    {version.file_state === "ready" &&
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

                    {version.file_state === "pending" &&
                      canUpload &&
                      version.created_by === user.id && (
                        <form
                          action={finalizeDocumentAction}
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
              ))}

            </tbody>

          </table>

        </div>

      </section>


      {/* ======================================================
          ARCHIVIA / RIPRISTINA
      ====================================================== */}

      {canArchive && (
        <div className="app-card p-4 mb-4">

          <div className="d-flex justify-content-between align-items-center gap-4 flex-wrap">

            <div>
              <h2 className="h6 mb-1">
                {doc.archived_at
                  ? "Documento archiviato"
                  : "Archiviazione"}
              </h2>

              <div className="small text-muted">
                {doc.archived_at
                  ? "Puoi ripristinare il documento e rendere nuovamente disponibili i file."
                  : "Il documento verrà archiviato mantenendo tutte le versioni e lo storico."}
              </div>
            </div>

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
                confirmMessage={
                  doc.archived_at
                    ? "Ripristinare questo documento?"
                    : "Archiviare il documento conservando tutte le versioni?"
                }
              >
                {doc.archived_at
                  ? "Ripristina documento"
                  : "Archivia documento"}
              </ConfirmSubmitButton>
            </form>

          </div>

        </div>
      )}


      {/* ======================================================
          ANOMALIE / ATTIVITÀ
      ====================================================== */}

      <ContextAnomalies
        kind="document"
        id={doc.id}
      />

      <ContextWork
        kind="document"
        id={doc.id}
      />
    </>
  );
}