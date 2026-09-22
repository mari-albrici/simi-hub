import { FilterForm } from "@/components/ui/filter-form";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import Link from "@/components/ui/app-link";

import {
  getAccessScope,
  requirePagePermission,
} from "@/lib/permissions";

import {
  getGuideCategories,
  searchGuides,
  type GuideStatus,
} from "@/lib/data";

const STATUS_LABELS: Record<GuideStatus, string> = {
  draft: "Bozza",
  published: "Pubblicata",
  archived: "Archiviata",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function GuidesPage({
  searchParams,
}: {
  searchParams: Promise<
    Record<string, string | undefined>
  >;
}) {
  await requirePagePermission("document.read");

  const params = await searchParams;

  /*
   * Usiamo document come dominio perché per ora
   * Guide e Procedure riutilizza i permessi document.*
   */
  const access = await getAccessScope("document");

  const status: GuideStatus | undefined =
    params.status === "draft" ||
    params.status === "published" ||
    params.status === "archived"
      ? params.status
      : undefined;

  const page = Math.max(
    1,
    Number(params.page || 1),
  );

  const [result, categories] = await Promise.all([
    searchGuides({
      q: params.q,
      category: params.category,
      status,
      important: params.important === "1",
      favorites: params.favorites === "1",
      page,
      pageSize: 50,
    }),

    getGuideCategories(),
  ]);

  const rootCategories = categories.filter(
    (category) => !category.parent_id,
  );

  const childrenByParent = new Map<
    string,
    typeof categories
  >();

  for (const category of categories) {
    if (!category.parent_id) {
      continue;
    }

    const list =
      childrenByParent.get(
        category.parent_id,
      ) ?? [];

    list.push(category);

    childrenByParent.set(
      category.parent_id,
      list,
    );
  }

  function link(
    extra: Record<
      string,
      string | undefined
    >,
  ) {
    const query = new URLSearchParams();

    const merged = {
      ...params,
      ...extra,
    };

    for (const [key, value] of Object.entries(merged)) {
      if (value) {
        query.set(
          key,
          value,
        );
      }
    }

    const queryString =
      query.toString();

    return queryString
      ? `/guide?${queryString}`
      : "/guide";
  }

  return (
    <>
      {/* =====================================================
          TESTATA
      ====================================================== */}

      <div className="d-flex justify-content-between align-items-start gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="h3 mb-1">
            Guide e Procedure
          </h1>

          <p className="text-muted mb-0">
            Procedure operative, istruzioni,
            checklist e documentazione interna.
          </p>
        </div>

        {access.canUpdate && (
          <Link
            href="/guide/new"
            className="btn btn-primary"
          >
            <i className="bi bi-plus-lg me-2" />
            Nuova guida
          </Link>
        )}
      </div>

      {/* =====================================================
          ACCESSI RAPIDI
      ====================================================== */}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Link
          href="/guide"
          className={
            !params.favorites &&
            !params.important &&
            !params.category
              ? "btn btn-primary btn-sm"
              : "btn btn-outline-secondary btn-sm"
          }
        >
          <i className="bi bi-collection me-2" />
          Tutte
        </Link>

        <Link
          href={link({
            favorites: "1",
            important: undefined,
            category: undefined,
            page: "1",
          })}
          className={
            params.favorites === "1"
              ? "btn btn-primary btn-sm"
              : "btn btn-outline-secondary btn-sm"
          }
        >
          <i className="bi bi-star me-2" />
          Preferite
        </Link>

        <Link
          href={link({
            important: "1",
            favorites: undefined,
            category: undefined,
            page: "1",
          })}
          className={
            params.important === "1"
              ? "btn btn-primary btn-sm"
              : "btn btn-outline-secondary btn-sm"
          }
        >
          <i className="bi bi-pin-angle me-2" />
          Importanti
        </Link>
      </div>

      {/* =====================================================
          FILTRI
      ====================================================== */}

      <FilterForm method="get">
        <FilterToolbar
          activeCount={[
            params.category,
            params.status,
            params.important,
            params.favorites,
          ].filter(Boolean).length}
          advanced={
            <>
              <div className="col-md-4">
                <label className="form-label small">
                  Categoria
                </label>

                <select
                  name="category"
                  defaultValue={
                    params.category || ""
                  }
                  className="form-select"
                >
                  <option value="">
                    Tutte le categorie
                  </option>

                  {rootCategories.map(
                    (root) => (
                      <optgroup
                        key={root.id}
                        label={root.name}
                      >
                        <option value={root.id}>
                          {root.name} — Tutte
                        </option>

                        {(
                          childrenByParent.get(
                            root.id,
                          ) ?? []
                        ).map(
                          (child) => (
                            <option
                              key={child.id}
                              value={child.id}
                            >
                              {child.name}
                            </option>
                          ),
                        )}
                      </optgroup>
                    ),
                  )}
                </select>
              </div>

              <div className="col-md-3">
                <label className="form-label small">
                  Stato
                </label>

                <select
                  name="status"
                  defaultValue={
                    params.status || ""
                  }
                  className="form-select"
                >
                  <option value="">
                    Tutti
                  </option>

                  <option value="published">
                    Pubblicate
                  </option>

                  <option value="draft">
                    Bozze
                  </option>

                  <option value="archived">
                    Archiviate
                  </option>
                </select>
              </div>

              <div className="col-auto">
                <label className="form-check mt-md-4 pt-md-2">
                  <input
                    type="checkbox"
                    name="important"
                    value="1"
                    className="form-check-input"
                    defaultChecked={
                      params.important === "1"
                    }
                  />

                  Solo importanti
                </label>
              </div>

              <div className="col-auto">
                <label className="form-check mt-md-4 pt-md-2">
                  <input
                    type="checkbox"
                    name="favorites"
                    value="1"
                    className="form-check-input"
                    defaultChecked={
                      params.favorites === "1"
                    }
                  />

                  Solo preferite
                </label>
              </div>
            </>
          }
        >
          <div className="col-md-5">
            <label className="form-label small">
              Ricerca
            </label>

            <input
              name="q"
              defaultValue={params.q}
              className="form-control"
              placeholder="Titolo, descrizione o contenuto"
            />
          </div>
        </FilterToolbar>
      </FilterForm>

      {/* =====================================================
          LAYOUT PRINCIPALE
      ====================================================== */}

      <div className="row g-4">
        {/* ===================================================
            CATEGORIE
        ==================================================== */}

        <div className="col-xl-3">
          <div className="app-card p-3">
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-folder2-open" />

              <h2 className="h6 mb-0">
                Categorie
              </h2>
            </div>

            <div className="list-group list-group-flush">
              <Link
                href={link({
                  category: undefined,
                  page: "1",
                })}
                className={`list-group-item list-group-item-action border-0 rounded ${
                  !params.category
                    ? "active"
                    : ""
                }`}
              >
                Tutte le categorie
              </Link>

              {rootCategories.map(
                (category) => {
                  const children =
                    childrenByParent.get(
                      category.id,
                    ) ?? [];

                  const rootActive =
                    params.category ===
                    category.id;

                  return (
                    <div
                      key={category.id}
                      className="mt-2"
                    >
                      <Link
                        href={link({
                          category:
                            category.id,
                          page: "1",
                        })}
                        className={`list-group-item list-group-item-action border-0 rounded fw-semibold ${
                          rootActive
                            ? "active"
                            : ""
                        }`}
                      >
                        <i className="bi bi-folder me-2" />

                        {category.name}
                      </Link>

                      {children.length > 0 && (
                        <div className="ms-3 mt-1">
                          {children.map(
                            (child) => (
                              <Link
                                key={
                                  child.id
                                }
                                href={link({
                                  category:
                                    child.id,
                                  page: "1",
                                })}
                                className={`list-group-item list-group-item-action border-0 rounded py-2 small ${
                                  params.category ===
                                  child.id
                                    ? "active"
                                    : ""
                                }`}
                              >
                                {child.name}
                              </Link>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>

        {/* ===================================================
            GUIDE
        ==================================================== */}

        <div className="col-xl-9">
          {result.rows.length === 0 ? (
            <div className="app-card p-5 text-center">
              <i className="bi bi-journal-text fs-1 text-muted d-block mb-3" />

              <h2 className="h5">
                Nessuna guida trovata
              </h2>

              <p className="text-muted mb-0">
                Non risultano guide per i filtri
                selezionati.
              </p>
            </div>
          ) : (
            <div className="row g-3">
              {result.rows.map(
                (guide) => (
                  <div
                    key={guide.id}
                    className="col-12"
                  >
                    <div className="app-card p-4">
                      <div className="d-flex align-items-start justify-content-between gap-3">
                        <div className="flex-grow-1 overflow-hidden">
                          {/* Categoria + badge */}

                          <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
                            {guide.parent_category_name && (
                              <span className="badge text-bg-light border">
                                {
                                  guide.parent_category_name
                                }
                              </span>
                            )}

                            {guide.category_name && (
                              <span className="badge text-bg-light border">
                                {
                                  guide.category_name
                                }
                              </span>
                            )}

                            {guide.is_important && (
                              <span className="badge text-bg-warning">
                                <i className="bi bi-pin-angle-fill me-1" />
                                Importante
                              </span>
                            )}

                            {guide.is_favorite && (
                              <span
                                className="text-warning"
                                title="Preferita"
                              >
                                <i className="bi bi-star-fill" />
                              </span>
                            )}

                            {guide.status !==
                              "published" && (
                              <span
                                className={`badge ${
                                  guide.status ===
                                  "draft"
                                    ? "text-bg-secondary"
                                    : "text-bg-dark"
                                }`}
                              >
                                {
                                  STATUS_LABELS[
                                    guide.status
                                  ]
                                }
                              </span>
                            )}
                          </div>

                          {/* Titolo */}

                          <Link
                            href={`/guide/${guide.id}`}
                            className="text-decoration-none text-body"
                          >
                            <h2 className="h5 mb-2">
                              {guide.title}
                            </h2>
                          </Link>

                          {/* Sommario */}

                          {guide.summary && (
                            <p className="text-muted mb-3">
                              {guide.summary}
                            </p>
                          )}

                          {/* Metadata */}

                          <div className="small text-muted">
                            <i className="bi bi-clock me-1" />

                            Aggiornata il{" "}
                            {formatDateTime(
                              guide.updated_at,
                            )}
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          <Link
                            href={`/guide/${guide.id}`}
                            className="btn btn-sm btn-outline-primary"
                          >
                            Apri
                            <i className="bi bi-arrow-right ms-2" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          {/* =================================================
              PAGINAZIONE
          ================================================== */}

          <div className="d-flex justify-content-between align-items-center mt-3">
            <span className="text-muted small">
              {result.count}{" "}
              {result.count === 1
                ? "guida"
                : "guide"}
            </span>

            <div className="d-flex gap-2">
              {page > 1 && (
                <Link
                  href={link({
                    page: String(
                      page - 1,
                    ),
                  })}
                  className="btn btn-sm btn-outline-secondary"
                >
                  Precedente
                </Link>
              )}

              {page * 50 <
                result.count && (
                <Link
                  href={link({
                    page: String(
                      page + 1,
                    ),
                  })}
                  className="btn btn-sm btn-outline-secondary"
                >
                  Successiva
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}