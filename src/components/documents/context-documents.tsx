import Link from "@/components/ui/app-link";
import { searchDocuments } from "@/lib/documents";
import { getAccessScope } from "@/lib/permissions";
import { DocumentsTable } from "./documents-table";
import { UploadDocumentTrigger } from "./upload-document-trigger";

type ContextDocumentsProps = {
  project?: string;
  company?: string;
  invoice?: string;
  entity?: string | null;
};

export async function ContextDocuments({
  project,
  company,
  invoice,
  entity,
}: ContextDocumentsProps) {
  const context = Object.fromEntries(
    Object.entries({
      project,
      company,
      invoice,
      entity,
    }).filter((entry): entry is [string, string] => !!entry[1])
  );

  const [result, access] = await Promise.all([
    searchDocuments(context),
    getAccessScope("document"),
  ]);

  return (
    <section className="app-card p-3">
      {/* HEADER */}

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3">
        <div>
          <h2 className="h5 mb-0">
            Documenti ({result.count})
          </h2>
        </div>

        {access.canUpload && (
          <UploadDocumentTrigger context={context} />
        )}
      </div>

      {/* TABELLA DOCUMENTI */}

      <DocumentsTable documents={result.rows} />

      {/* ELENCO COMPLETO */}

      <div className="mt-3">
        <Link
          href={`/documenti?${new URLSearchParams(context)}`}
          className="text-decoration-none"
        >
          Apri elenco completo e filtri
          <i
            className="bi bi-arrow-right ms-1"
            aria-hidden="true"
          />
        </Link>
      </div>
    </section>
  );
}