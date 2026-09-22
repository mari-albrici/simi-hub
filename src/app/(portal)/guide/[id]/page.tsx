import Link from "@/components/ui/app-link";
import { getGuideById, getGuideCategories } from "@/lib/data";
import { requirePagePermission } from "@/lib/permissions";
import { notFound } from "next/navigation";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("document.read");

  const { id } = await params;

  const [guide, categories] = await Promise.all([
    getGuideById(id),
    getGuideCategories(),
  ]);

  if (!guide) {
    notFound();
  }

  const category = guide.category_id
    ? categories.find((item) => item.id === guide.category_id)
    : null;

  const parentCategory =
    category?.parent_id
      ? categories.find((item) => item.id === category.parent_id)
      : null;

  return (
    <>
      <div className="d-flex justify-content-between align-items-start gap-3 mb-4 flex-wrap">
        <div>
          <div className="mb-2">
            <Link
              href="/guide"
              className="small text-decoration-none"
            >
              <i className="bi bi-arrow-left me-2" />
              Guide e Procedure
            </Link>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
            {parentCategory && (
              <span className="badge text-bg-light border">
                {parentCategory.name}
              </span>
            )}

            {category && (
              <span className="badge text-bg-light border">
                {category.name}
              </span>
            )}

            {guide.is_important && (
              <span className="badge text-bg-warning">
                <i className="bi bi-pin-angle-fill me-1" />
                Importante
              </span>
            )}

            <span
              className={`badge ${
                guide.status === "published"
                  ? "text-bg-success"
                  : guide.status === "draft"
                    ? "text-bg-secondary"
                    : "text-bg-dark"
              }`}
            >
              {guide.status === "published"
                ? "Pubblicata"
                : guide.status === "draft"
                  ? "Bozza"
                  : "Archiviata"}
            </span>
          </div>

          <h1 className="h3 mb-2">
            {guide.title}
          </h1>

          {guide.summary && (
            <p className="text-muted mb-0">
              {guide.summary}
            </p>
          )}
        </div>

        <Link
          href={`/guide/${guide.id}/edit`}
          className="btn btn-outline-primary"
        >
          <i className="bi bi-pencil me-2" />
          Modifica
        </Link>
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="app-card p-4 mb-4">
            <h2 className="h5 mb-3">
              Procedura
            </h2>

            {guide.content ? (
              <div style={{ whiteSpace: "pre-wrap" }}>
                {guide.content}
              </div>
            ) : (
              <p className="text-muted mb-0">
                Nessun contenuto inserito.
              </p>
            )}
          </div>

          <div className="app-card p-4">
            <h2 className="h5 mb-3">
              Checklist
            </h2>

            {guide.checklist.length === 0 ? (
              <p className="text-muted mb-0">
                Nessuna checklist associata.
              </p>
            ) : (
              <div className="d-flex flex-column gap-3">
                {guide.checklist.map((item, index) => (
                  <div
                    key={item.id}
                    className="d-flex align-items-start gap-3 border-bottom pb-3"
                  >
                    <div
                      className="d-flex align-items-center justify-content-center rounded bg-body-secondary flex-shrink-0"
                      style={{
                        width: 32,
                        height: 32,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div>
                      <div className="fw-semibold">
                        {item.label}
                      </div>

                      {item.description && (
                        <div className="small text-muted mt-1">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="col-xl-4">
          <div className="app-card p-4">
            <h2 className="h6 text-uppercase text-muted mb-3">
              Informazioni
            </h2>

            <dl className="mb-0">
              <dt className="small text-muted">
                Categoria
              </dt>

              <dd>
                {parentCategory
                  ? `${parentCategory.name} → `
                  : ""}
                {category?.name || "—"}
              </dd>

              <dt className="small text-muted mt-3">
                Stato
              </dt>

              <dd>
                {guide.status === "published"
                  ? "Pubblicata"
                  : guide.status === "draft"
                    ? "Bozza"
                    : "Archiviata"}
              </dd>

              <dt className="small text-muted mt-3">
                Creata
              </dt>

              <dd>
                {formatDateTime(guide.created_at)}
              </dd>

              <dt className="small text-muted mt-3">
                Ultimo aggiornamento
              </dt>

              <dd>
                {formatDateTime(guide.updated_at)}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}