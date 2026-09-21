import { FilterForm } from "@/components/ui/filter-form";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAccessScope, requirePagePermission } from "@/lib/permissions";
import Link from "@/components/ui/app-link";
import { deleteProjectAction } from "@/lib/crud";
import {
  getCompaniesByType,
  getLegalEntities,
  getProfileDirectory,
  searchProjects,
} from "@/lib/data";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

const labels: Record<string, string> = {
  draft: "Preparazione",
  active: "Attiva",
  suspended: "Sospesa",
  completed: "Completata",
  closed: "Chiusa",
  archived: "Archiviata",
};

type SortField = "project_code" | "customer" | "status";
type SortDirection = "asc" | "desc";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePagePermission("project.read");
  const params = await searchParams;
  const access = await getAccessScope("project");

  const sort: SortField =
    params.sort === "customer" || params.sort === "status"
      ? params.sort
      : "project_code";

  const direction: SortDirection =
    params.direction === "desc" ? "desc" : "asc";

  const [result, customers, entities, managers] = await Promise.all([
    searchProjects({
      q: params.q,
      legal_entity_id: params.entity,
      country: params.country,
      customer_id: params.customer,
      project_manager_id:
        params.mine === "1" ? user.id : params.manager,
      status: params.status,
      date_from: params.from,
      date_to: params.to,
      page: Number(params.page || 1),
      archived: params.archived === "1",

      // Ordinamento
      sort,
      direction,
    }),
    getCompaniesByType("customer"),
    getLegalEntities(),
    getProfileDirectory(),
  ]);

  const page = Math.max(1, Number(params.page || 1));

  const link = (extra: Record<string, string>) => {
    const q = new URLSearchParams(
      Object.entries({
        ...params,
        ...extra,
      }).filter(([, value]) => !!value) as [string, string][],
    );

    return `/commesse?${q}`;
  };

  /**
   * Genera il link per l'ordinamento.
   *
   * Se clicco sulla colonna già attiva:
   * asc -> desc
   * desc -> asc
   *
   * Se clicco su una nuova colonna:
   * parte da asc.
   */
  const sortLink = (field: SortField) =>
    link({
      sort: field,
      direction:
        sort === field && direction === "asc"
          ? "desc"
          : "asc",
      page: "1",
    });

  const sortIcon = (field: SortField) => {
    if (sort !== field) {
      return <i className="bi bi-arrow-down-up ms-2 text-muted" />;
    }

    return direction === "asc" ? (
      <i className="bi bi-arrow-up ms-2" />
    ) : (
      <i className="bi bi-arrow-down ms-2" />
    );
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Commesse</h1>
          <p className="text-muted mb-0">
            Fascicolo operativo e amministrativo delle commesse.
          </p>
        </div>

        {access.canCreate && (
          <Link href="/commesse/new" className="btn btn-primary">
            <i className="bi bi-plus-lg me-2" />
            Nuova commessa
          </Link>
        )}
      </div>

      <FilterForm method="get">
        <FilterToolbar
          activeCount={[
            "entity",
            "country",
            "manager",
            "from",
            "to",
            "archived",
          ].filter((key) => params[key]).length}
          advanced={
            <>
              <div className="col-md-2">
                <label className="form-label small">Società</label>
                <select
                  name="entity"
                  defaultValue={params.entity || ""}
                  className="form-select"
                >
                  <option value="">Tutte</option>

                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.business_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-2">
                <label className="form-label small">Responsabile</label>
                <select
                  name="manager"
                  defaultValue={params.manager || ""}
                  className="form-select"
                >
                  <option value="">Tutti</option>

                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {[manager.first_name, manager.last_name]
                        .filter(Boolean)
                        .join(" ")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-2">
                <label className="form-label small">Apertura da</label>
                <input
                  name="from"
                  type="date"
                  defaultValue={params.from}
                  className="form-control"
                />
              </div>

              <div className="col-md-2">
                <label className="form-label small">Apertura a</label>
                <input
                  name="to"
                  type="date"
                  defaultValue={params.to}
                  className="form-control"
                />
              </div>

              <div className="col-md-2">
                <label className="form-label small">Paese</label>
                <input
                  name="country"
                  defaultValue={params.country}
                  className="form-control"
                />
              </div>

              <div className="col-auto">
                <label className="form-check">
                  <input
                    type="checkbox"
                    name="archived"
                    value="1"
                    defaultChecked={params.archived === "1"}
                    className="form-check-input"
                  />
                  Archiviate
                </label>
              </div>
            </>
          }
        >
          <div className="col-md-3">
            <label className="form-label small">Ricerca</label>
            <input
              name="q"
              defaultValue={params.q}
              className="form-control"
              placeholder="Numero, nome, cliente, luogo"
            />
          </div>

          <div className="col-md-2">
            <label className="form-label small">Stato</label>
            <select
              name="status"
              defaultValue={params.status || ""}
              className="form-select"
            >
              <option value="">Tutti</option>

              {Object.entries(labels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-2">
            <label className="form-label small">Cliente</label>
            <select
              name="customer"
              defaultValue={params.customer || ""}
              className="form-select"
            >
              <option value="">Tutti</option>

              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.business_name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-auto">
            <label className="form-check">
              <input
                className="form-check-input"
                name="mine"
                value="1"
                type="checkbox"
                defaultChecked={params.mine === "1"}
              />
              Le mie commesse
            </label>
          </div>
        </FilterToolbar>
      </FilterForm>

      <div className="app-card">
        <div className="table-responsive">
          <table className="table table-admin align-middle mb-0">
            <thead>
              <tr>
                {/* COMMESSA */}
                <th>
                  <Link
                    href={sortLink("project_code")}
                    className="text-decoration-none text-reset d-inline-flex align-items-center"
                  >
                    Commessa
                    {sortIcon("project_code")}
                  </Link>
                </th>

                {/* CLIENTE */}
                <th>
                  <Link
                    href={sortLink("customer")}
                    className="text-decoration-none text-reset d-inline-flex align-items-center"
                  >
                    Cliente
                    {sortIcon("customer")}
                  </Link>
                </th>

                {/* LUOGO */}
                <th>Luogo</th>

                {/* PUBBLICA AMMINISTRAZIONE */}
                <th className="text-center">P.A.</th>

                {/* STATO */}
                <th>
                  <Link
                    href={sortLink("status")}
                    className="text-decoration-none text-reset d-inline-flex align-items-center"
                  >
                    Stato
                    {sortIcon("status")}
                  </Link>
                </th>

                <th className="col-actions">
                  <span className="visually-hidden">Azioni</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted py-4">
                    Nessuna commessa per i filtri selezionati.
                  </td>
                </tr>
              )}

              {result.rows.map((project) => {
                const isPublicAdministration =
                  Boolean(project.cig?.trim()) &&
                  Boolean(project.cup?.trim());

                return (
                  <tr key={project.id}>
                    {/* COMMESSA */}
                    <td
                      className="col-description"
                      title={project.name}
                    >
                      <Link
                        href={`/commesse/${project.id}`}
                        className="text-decoration-none fw-semibold"
                      >
                        {project.project_code}
                      </Link>

                      <div className="small text-muted text-truncate">
                        {project.name}
                      </div>
                    </td>

                    {/* CLIENTE */}
                    <td className="col-description">
                      {project.customer_id ? (
                        <Link href={`/clienti/${project.customer_id}`}>
                          {project.customer_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* LUOGO */}
                    <td className="col-description">
                      {project.city || "—"}
                    </td>

                    {/* P.A. */}
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={isPublicAdministration}
                        disabled
                        aria-label={
                          isPublicAdministration
                            ? "Pubblica Amministrazione"
                            : "Non Pubblica Amministrazione"
                        }
                      />
                    </td>

                    {/* STATO */}
                    <td className="col-status">
                      <StatusBadge
                        domain="project"
                        status={project.status}
                      />
                    </td>

                    {/* AZIONI */}
                    <td className="col-actions">
                      <RowActionsMenu
                        label={`Azioni per ${project.project_code}`}
                      >
                        <Link
                          href={`/commesse/${project.id}`}
                          className="dropdown-item"
                        >
                          Apri
                        </Link>

                        {access.canUpdate && (
                          <Link
                            href={`/commesse/${project.id}/edit`}
                            className="dropdown-item"
                          >
                            Modifica
                          </Link>
                        )}

                        {access.canDelete && (
                          <form
                            action={async () => {
                              "use server";
                              await deleteProjectAction(project.id);
                            }}
                          >
                            <ConfirmSubmitButton
                              confirmMessage={`Archiviare la commessa ${project.project_code}?`}
                              pendingLabel="Archiviazione…"
                            >
                              Archivia
                            </ConfirmSubmitButton>
                          </form>
                        )}
                      </RowActionsMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="d-flex justify-content-between p-3">
          <span className="text-muted">
            {result.count} commesse
          </span>

          <div className="d-flex gap-2">
            {page > 1 && (
              <Link
                className="btn btn-sm btn-outline-secondary"
                href={link({
                  page: String(page - 1),
                })}
              >
                Precedente
              </Link>
            )}

            {page * 50 < result.count && (
              <Link
                className="btn btn-sm btn-outline-secondary"
                href={link({
                  page: String(page + 1),
                })}
              >
                Successiva
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}