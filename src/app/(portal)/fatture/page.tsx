import { FilterForm } from "@/components/ui/filter-form";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import { formatDate, formatMoney } from "@/lib/formatters";
import {
  getAccessScope,
  requirePagePermission,
} from "@/lib/permissions";
import Link from "@/components/ui/app-link";
import { deleteInvoiceAction } from "@/lib/crud";
import {
  getInvoices,
  getLegalEntities,
} from "@/lib/data";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { NewInvoiceTrigger } from "./new-invoice-trigger";
import { getInvoiceFinancialSummaries } from "@/lib/finance";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusLabel } from "@/lib/status";

// Il workflow PDF rimane nella pagina dedicata con InvoiceForm.
// Margine esplicito oltre al timeout interno di invoice-pdf-parser.ts (45s).
export const maxDuration = 60;

type FattureSearchParams = {
  type?: string;
  purchase?: string;
  sale?: string;

  esolver_registration_number?: string;
  status?: string;
  financial?: string;
  search?: string;
  legal_entity_id?: string;
  company_id?: string;
  project_id?: string;
  date_from?: string;
  date_to?: string;
  due_from?: string;
  due_to?: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "aperte",
  overdue: "scadute",
  anomaly: "in anomalia",
  to_check: "da verificare",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<FattureSearchParams>;
}) {
  await requirePagePermission("invoice.read");

  const access = await getAccessScope("invoice");
  const params = await searchParams;

  /*
   * =====================================
   * TIPO FATTURA
   * =====================================
   *
   * Checkbox:
   *
   * nessuna selezionata -> tutte
   * solo Acquisto       -> purchase
   * solo Vendita        -> sale
   * entrambe            -> tutte
   *
   * Manteniamo anche compatibilità con
   * eventuali URL vecchi che usano ?type=
   */
  const purchaseChecked =
    params.purchase === "1" ||
    params.type === "purchase";

  const saleChecked =
    params.sale === "1" ||
    params.type === "sale";

  const type =
    purchaseChecked && !saleChecked
      ? "purchase"
      : saleChecked && !purchaseChecked
        ? "sale"
        : undefined;

  const status = params.status;

  const financialFilter =
    params.financial;

  const search =
    params.search?.trim() ||
    undefined;

  const esolver =
    params.esolver_registration_number?.trim() ||
    undefined;

  const [invoices, legalEntities] =
    await Promise.all([
      getInvoices({
        type,
        status,
        search,
        legal_entity_id:
          params.legal_entity_id,
        company_id:
          params.company_id,
        project_id:
          params.project_id,
        esolver_registration_number:
          esolver,
        date_from:
          params.date_from,
        date_to:
          params.date_to,
        due_from:
          params.due_from,
        due_to:
          params.due_to,
      }),

      getLegalEntities(),
    ]);

  const financial =
    await getInvoiceFinancialSummaries(
      invoices.map(
        (invoice) => invoice.id,
      ),
    );

  const displayedInvoices =
    financialFilter
      ? invoices.filter(
          (invoice) =>
            financial.get(invoice.id)
              ?.financialStatus ===
            financialFilter,
        )
      : invoices;

  const hasFilter = Boolean(
    type ||
      purchaseChecked ||
      saleChecked ||
      status ||
      financialFilter ||
      search ||
      esolver ||
      params.legal_entity_id ||
      params.company_id ||
      params.project_id ||
      params.date_from ||
      params.date_to ||
      params.due_from ||
      params.due_to,
  );

  /*
   * Solo sedi SIMI utili al filtro
   * geografico.
   */
  const invoiceEntities =
    legalEntities.filter((entity) =>
      ["IT", "FR", "LU"].includes(
        entity.country ?? "",
      ),
    );

  return (
    <>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">
            Fatture
          </h1>

          <p className="text-muted mb-0">
            Gestione fatture di acquisto
            e di vendita.
          </p>
        </div>

        {access.canCreate && (
          <NewInvoiceTrigger />
        )}
      </div>

      {!access.canCreate && (
        <p className="small text-muted">
          Il tuo ruolo consente la
          consultazione delle fatture,
          non la creazione.
        </p>
      )}

      <div className="app-card p-3">
        <FilterForm method="get">
          {params.status && (
            <input
              type="hidden"
              name="status"
              value={params.status}
            />
          )}

          {params.company_id && (
            <input
              type="hidden"
              name="company_id"
              value={params.company_id}
            />
          )}

          {params.project_id && (
            <input
              type="hidden"
              name="project_id"
              value={params.project_id}
            />
          )}

          <FilterToolbar
            activeCount={[
              params.esolver_registration_number,
              params.legal_entity_id,
              params.date_from,
              params.date_to,
              params.due_from,
              params.due_to,
            ].filter(Boolean).length}
            advanced={
              <>
                <div className="col-md-2">
                  <label className="form-label small">
                    Prog. eSolver
                  </label>

                  <input
                    name="esolver_registration_number"
                    defaultValue={
                      esolver ?? ""
                    }
                    className="form-control"
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label small">
                    Data documento da
                  </label>

                  <input
                    name="date_from"
                    type="date"
                    defaultValue={
                      params.date_from ??
                      ""
                    }
                    className="form-control"
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label small">
                    Data documento a
                  </label>

                  <input
                    name="date_to"
                    type="date"
                    defaultValue={
                      params.date_to ?? ""
                    }
                    className="form-control"
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label small">
                    Scadenza da
                  </label>

                  <input
                    name="due_from"
                    type="date"
                    defaultValue={
                      params.due_from ?? ""
                    }
                    className="form-control"
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label small">
                    Scadenza a
                  </label>

                  <input
                    name="due_to"
                    type="date"
                    defaultValue={
                      params.due_to ?? ""
                    }
                    className="form-control"
                  />
                </div>
              </>
            }
          >
            <div className="col-md-3">
              <label className="form-label small">
                Numero fattura /
                progressivo eSolver
              </label>

              <input
                name="search"
                defaultValue={
                  search ?? ""
                }
                className="form-control"
              />
            </div>

            <div className="col-md-2">
              <label className="form-label small">
                Nazione
              </label>

              <select
                name="legal_entity_id"
                defaultValue={
                  params.legal_entity_id ??
                  ""
                }
                className="form-select"
              >
                <option value="">
                  Tutte
                </option>

                {invoiceEntities.map(
                  (entity) => (
                    <option
                      key={entity.id}
                      value={entity.id}
                    >
                      {entity.country ===
                      "IT"
                        ? "ITA"
                        : entity.country ===
                            "FR"
                          ? "FRA"
                          : entity.country ===
                              "LU"
                            ? "LUX"
                            : entity.country}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label small d-block">
                Tipo
              </label>

              <div className="d-flex align-items-center gap-3 pt-2">
                <div className="form-check">
                  <input
                    id="filter-purchase"
                    name="purchase"
                    value="1"
                    type="checkbox"
                    className="form-check-input"
                    defaultChecked={
                      purchaseChecked
                    }
                  />

                  <label
                    className="form-check-label"
                    htmlFor="filter-purchase"
                  >
                    Acquisto
                  </label>
                </div>

                <div className="form-check">
                  <input
                    id="filter-sale"
                    name="sale"
                    value="1"
                    type="checkbox"
                    className="form-check-input"
                    defaultChecked={
                      saleChecked
                    }
                  />

                  <label
                    className="form-check-label"
                    htmlFor="filter-sale"
                  >
                    Vendita
                  </label>
                </div>
              </div>
            </div>

            <div className="col-md-2">
              <label className="form-label small">
                Stato finanziario
              </label>

              <select
                name="financial"
                defaultValue={
                  financialFilter ?? ""
                }
                className="form-select"
              >
                <option value="">
                  Tutti
                </option>

                <option value="to_pay">
                  Da pagare/incassare
                </option>

                <option value="partial">
                  Parziale
                </option>

                <option value="paid">
                  Saldata
                </option>

                <option value="overdue">
                  Scaduta
                </option>
              </select>
            </div>
          </FilterToolbar>
        </FilterForm>

        <div className="table-responsive">
          <table className="table table-admin align-middle mb-0">
            <thead>
              <tr>
                <th>Numero</th>
                <th>eSolver</th>
                <th>Data</th>
                <th>
                  Fornitore / Cliente
                </th>
                <th>Commessa</th>
                <th>Totale</th>
                <th>Residuo</th>
                <th>Scadenza</th>
                <th>Stato</th>
                <th className="text-end">
                  Azioni
                </th>
              </tr>
            </thead>

            <tbody>
              {displayedInvoices.length ===
                0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="text-muted py-4"
                  >
                    <p>
                      {hasFilter
                        ? "Nessuna fattura per i filtri selezionati."
                        : "Nessuna fattura registrata."}
                    </p>

                    {access.canCreate && (
                      <NewInvoiceTrigger />
                    )}
                  </td>
                </tr>
              )}

              {displayedInvoices.map(
                (invoice) => {
                  const f =
                    financial.get(
                      invoice.id,
                    );

                  return (
                    <tr
                      key={invoice.id}
                    >
                      <td className="col-description">
                        <div className="d-flex align-items-center gap-2">
                          <Link
                            href={`/fatture/${invoice.id}`}
                            className="fw-semibold"
                          >
                            {
                              invoice.invoice_number
                            }
                          </Link>

                          {invoice.entity_country && (
                            <span
                              className="badge text-bg-secondary"
                              title={
                                invoice.company_name
                              }
                            >
                              {invoice.entity_country ===
                              "IT"
                                ? "ITA"
                                : invoice.entity_country ===
                                    "FR"
                                  ? "FRA"
                                  : invoice.entity_country ===
                                      "LU"
                                    ? "LUX"
                                    : invoice.entity_country}
                            </span>
                          )}
                        </div>

                        <div className="small text-muted text-truncate">
                          {invoice.invoice_type ===
                          "purchase"
                            ? "Acquisto"
                            : "Vendita"}
                        </div>
                      </td>

                      <td className="text-break">
                        {invoice.esolver_registration_number ||
                          "—"}
                      </td>

                      <td className="col-date">
                        {formatDate(
                          invoice.invoice_date,
                        )}
                      </td>

                      <td
                        className="col-description"
                        title={
                          invoice.customer_name
                        }
                      >
                        {
                          invoice.customer_name
                        }
                      </td>

                      <td className="col-description">
                        {
                          invoice.project_code
                        }
                      </td>

                      <td className="col-money">
                        {formatMoney(
                          invoice.amount_total,
                          invoice.currency,
                        )}
                      </td>

                      <td className="col-money">
                        {formatMoney(
                          f?.residual,
                          invoice.currency,
                        )}
                      </td>

                      <td className="col-date">
                        {formatDate(
                          invoice.due_date,
                        )}
                      </td>

                      <td className="col-status">
                        <StatusBadge
                          domain="invoice"
                          status={
                            invoice.status
                          }
                        />
                      </td>

                      <td className="col-actions">
                        <RowActionsMenu>
                          <Link
                            href={`/fatture/${invoice.id}`}
                            className="dropdown-item"
                          >
                            Visualizza
                          </Link>

                          {access.canUpdate && (
                            <Link
                              href={`/fatture/${invoice.id}/edit`}
                              className="dropdown-item"
                            >
                              Modifica
                            </Link>
                          )}

                          {access.canDelete && (
                            <form
                              action={async () => {
                                "use server";

                                await deleteInvoiceAction(
                                  invoice.id,
                                );
                              }}
                            >
                              <ConfirmSubmitButton
                                confirmMessage={`Archiviare la fattura ${invoice.invoice_number}?`}
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
                },
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}