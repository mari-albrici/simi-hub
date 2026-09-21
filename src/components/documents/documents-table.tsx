import Link from "@/components/ui/app-link";
import type { ArchiveDocument } from "@/lib/documents";
import { documentStatusLabels } from "@/lib/document-validation";
import { formatDate } from "@/lib/formatters";

export function DocumentsTable({
  documents,
}: {
  documents: ArchiveDocument[];
}) {
  return (
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
          </tr>
        </thead>

        <tbody>
          {documents.map((document) => (
            <tr key={document.id}>
              {/* DOCUMENTO */}
              <td
                className="col-description"
                title={document.title || document.original_filename}
              >
                <Link href={`/documenti/${document.id}`}>
                  {document.title || document.original_filename}
                </Link>
              </td>

              {/* CATEGORIA */}
              <td
                className="col-description"
                title={document.category_name || "Non classificato"}
              >
                {document.category_name || "Non classificato"}
              </td>

              {/* DATA */}
              <td className="col-date">
                {formatDate(document.document_date)}
              </td>

              {/* COMMESSA */}
              <td className="col-description">
                {document.projects.map((project) => (
                  <div key={project.id}>
                    <Link href={`/commesse/${project.id}`}>
                      {project.label}
                    </Link>
                  </div>
                ))}
              </td>

              {/* SCADENZA */}
              <td className="col-date">
                {formatDate(document.expiry_date)}
              </td>

              {/* STATO */}
              <td className="col-status">
                <span
                  className={`badge text-bg-${
                    document.display_status === "expired"
                      ? "danger"
                      : document.display_status === "expiring"
                        ? "warning"
                        : "secondary"
                  }`}
                >
                  {documentStatusLabels[document.display_status] ||
                    document.display_status}
                </span>
              </td>
            </tr>
          ))}

          {!documents.length && (
            <tr>
              <td colSpan={6} className="text-muted py-4">
                Nessun documento per i filtri selezionati.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}