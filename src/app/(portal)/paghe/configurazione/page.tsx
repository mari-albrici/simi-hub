"use server";

import Link from "next/link";

import {
  deletePayrollAccountingRuleAction,
  getPayrollAccountingItemTypes,
  getPayrollAccountingRules,
  getPayrollLegalEntities,
  savePayrollAccountingRuleAction,
} from "@/lib/payroll";

type SearchParams = Promise<{
  success?: string;
  error?: string;
  error_kind?: string;
  entity?: string;
  country?: string;
  status?: string;
  edit?: string;
}>;

const amountSourceLabels: Record<string, string> = {
  item: "Voce analitica",
  employee_summary: "Riepilogo dipendente",
  allocation: "Allocazione commessa",
  manual: "Manuale",
};

const allocationScopeLabels: Record<string, string> = {
  none: "Nessuna",
  project: "Commessa",
  employee: "Dipendente",
  project_employee: "Commessa + dipendente",
};

export default async function PayrollConfigurationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const entityFilter = params.entity ?? "";
  const countryFilter = (params.country ?? "").toUpperCase();
  const statusFilter = params.status ?? "all";
  const editId = params.edit ?? "";

  const [entities, itemTypes, rules] = await Promise.all([
    getPayrollLegalEntities(),
    getPayrollAccountingItemTypes(),
    getPayrollAccountingRules({
      legal_entity_id: entityFilter || undefined,
      country: countryFilter || undefined,
      active:
        statusFilter === "active"
          ? true
          : statusFilter === "inactive"
            ? false
            : undefined,
    }),
  ]);

  const editingRule = editId
    ? rules.find((rule) => rule.id === editId) ?? null
    : null;

  const countries = Array.from(
    new Set(
      [
        ...entities.map((entity) => entity.country),
        ...itemTypes.map((item) => item.country),
        ...rules.map((rule) => rule.country),
      ].filter((value): value is string => Boolean(value)),
    ),
  ).sort();

  return (
    <div className="container-fluid py-4">
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-2">
            <Link
              href="/paghe"
              className="btn btn-sm btn-outline-secondary"
              aria-label="Torna alle paghe"
            >
              <i className="bi bi-arrow-left" aria-hidden="true" />
            </Link>

            <span className="text-muted small">Paghe</span>
          </div>

          <h1 className="h3 mb-1">Configurazione contabile</h1>
          <p className="text-muted mb-0">
            Regole utilizzate per generare le scritture contabili delle
            elaborazioni paghe.
          </p>
        </div>

        <Link href="/paghe" className="btn btn-outline-secondary">
          Elaborazioni
        </Link>
      </div>

      {params.success && (
        <div className="alert alert-success" role="alert">
          {params.success}
        </div>
      )}

      {params.error && (
        <div className="alert alert-danger" role="alert">
          {params.error}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-header bg-body">
          <h2 className="h5 mb-0">Filtri</h2>
        </div>

        <div className="card-body">
          <form method="get" className="row g-3 align-items-end">
            <div className="col-12 col-md-4">
              <label className="form-label" htmlFor="filter-entity">
                Società
              </label>
              <select
                id="filter-entity"
                name="entity"
                className="form-select"
                defaultValue={entityFilter}
              >
                <option value="">Tutte</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.business_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-md-3">
              <label className="form-label" htmlFor="filter-country">
                Paese
              </label>
              <select
                id="filter-country"
                name="country"
                className="form-select"
                defaultValue={countryFilter}
              >
                <option value="">Tutti</option>
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-md-3">
              <label className="form-label" htmlFor="filter-status">
                Stato
              </label>
              <select
                id="filter-status"
                name="status"
                className="form-select"
                defaultValue={statusFilter}
              >
                <option value="all">Tutte</option>
                <option value="active">Attive</option>
                <option value="inactive">Disattivate</option>
              </select>
            </div>

            <div className="col-12 col-md-2 d-flex gap-2">
              <button type="submit" className="btn btn-primary flex-grow-1">
                Filtra
              </button>
              <Link
                href="/paghe/configurazione"
                className="btn btn-outline-secondary"
                aria-label="Azzera filtri"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </Link>
            </div>
          </form>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-7">
          <div className="card h-100">
            <div className="card-header bg-body d-flex justify-content-between align-items-center">
              <div>
                <h2 className="h5 mb-1">Regole contabili</h2>
                <div className="small text-muted">
                  {rules.length} {rules.length === 1 ? "regola" : "regole"}
                </div>
              </div>

              {editingRule && (
                <Link
                  href="/paghe/configurazione"
                  className="btn btn-sm btn-outline-secondary"
                >
                  Nuova regola
                </Link>
              )}
            </div>

            {rules.length === 0 ? (
              <div className="card-body py-5 text-center">
                <i
                  className="bi bi-journal-x fs-1 text-muted"
                  aria-hidden="true"
                />
                <h3 className="h6 mt-3">Nessuna regola configurata</h3>
                <p className="text-muted small mb-0">
                  Crea la prima regola dal modulo a destra.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Priorità</th>
                      <th>Regola</th>
                      <th>Ambito</th>
                      <th>Conti</th>
                      <th>Stato</th>
                      <th className="text-end">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>{rule.priority}</td>

                        <td>
                          <div className="fw-semibold">{rule.rule_name}</div>
                          <div className="small text-muted">
                            {rule.item_type_code} — {rule.item_type_name}
                          </div>
                          <div className="small text-muted">
                            {rule.legal_entity_name ?? "Tutte le società"}
                            {" · "}
                            {rule.country ?? "Tutti i Paesi"}
                          </div>
                        </td>

                        <td>
                          <div className="small">
                            {amountSourceLabels[rule.amount_source] ??
                              rule.amount_source}
                          </div>
                          <div className="small text-muted">
                            {allocationScopeLabels[rule.allocation_scope] ??
                              rule.allocation_scope}
                          </div>
                        </td>

                        <td className="text-nowrap">
                          <div>
                            <span className="text-muted small">Dare:</span>{" "}
                            {rule.debit_account_code ?? "—"}
                          </div>
                          <div>
                            <span className="text-muted small">Avere:</span>{" "}
                            {rule.credit_account_code ?? "—"}
                          </div>
                        </td>

                        <td>
                          <span
                            className={`badge ${
                              rule.active
                                ? "text-bg-success"
                                : "text-bg-secondary"
                            }`}
                          >
                            {rule.active ? "Attiva" : "Disattivata"}
                          </span>
                        </td>

                        <td className="text-end">
                          <div className="d-flex justify-content-end gap-2">
                            <Link
                              href={`/paghe/configurazione?edit=${encodeURIComponent(
                                rule.id,
                              )}`}
                              className="btn btn-sm btn-outline-primary"
                              title="Modifica"
                              aria-label={`Modifica ${rule.rule_name}`}
                            >
                              <i
                                className="bi bi-pencil"
                                aria-hidden="true"
                              />
                            </Link>

                            <form action={deletePayrollAccountingRuleAction}>
                              <input
                                type="hidden"
                                name="rule_id"
                                value={rule.id}
                              />
                              <button
                                type="submit"
                                className="btn btn-sm btn-outline-danger"
                                title="Elimina"
                                aria-label={`Elimina ${rule.rule_name}`}
                              >
                                <i
                                  className="bi bi-trash"
                                  aria-hidden="true"
                                />
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col-12 col-xl-5">
          <div className="card">
            <div className="card-header bg-body">
              <h2 className="h5 mb-1">
                {editingRule ? "Modifica regola" : "Nuova regola"}
              </h2>
              <div className="small text-muted">
                Associa una voce paghe ai conti e alla fonte dell&apos;importo.
              </div>
            </div>

            <div className="card-body">
              <form action={savePayrollAccountingRuleAction} className="row g-3">
                <input
                  type="hidden"
                  name="rule_id"
                  value={editingRule?.id ?? ""}
                />

                <div className="col-12">
                  <label className="form-label" htmlFor="rule-name">
                    Nome regola
                  </label>
                  <input
                    id="rule-name"
                    name="rule_name"
                    className="form-control"
                    defaultValue={editingRule?.rule_name ?? ""}
                    required
                  />
                </div>

                <div className="col-12">
                  <label className="form-label" htmlFor="item-type">
                    Voce paghe
                  </label>
                  <select
                    id="item-type"
                    name="item_type_id"
                    className="form-select"
                    defaultValue={editingRule?.item_type_id ?? ""}
                    required
                  >
                    <option value="" disabled>
                      Seleziona voce
                    </option>
                    {itemTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.name}
                        {item.country ? ` · ${item.country}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-md-7">
                  <label className="form-label" htmlFor="legal-entity">
                    Società
                  </label>
                  <select
                    id="legal-entity"
                    name="legal_entity_id"
                    className="form-select"
                    defaultValue={editingRule?.legal_entity_id ?? ""}
                  >
                    <option value="">Tutte le società</option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.business_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-md-5">
                  <label className="form-label" htmlFor="country">
                    Paese
                  </label>
                  <select
                    id="country"
                    name="country"
                    className="form-select"
                    defaultValue={editingRule?.country ?? ""}
                  >
                    <option value="">Tutti</option>
                    {countries.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label" htmlFor="debit-account">
                    Conto Dare
                  </label>
                  <input
                    id="debit-account"
                    name="debit_account_code"
                    className="form-control"
                    defaultValue={editingRule?.debit_account_code ?? ""}
                    placeholder="Es. 640100"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label" htmlFor="credit-account">
                    Conto Avere
                  </label>
                  <input
                    id="credit-account"
                    name="credit_account_code"
                    className="form-control"
                    defaultValue={editingRule?.credit_account_code ?? ""}
                    placeholder="Es. 240100"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label" htmlFor="amount-source">
                    Fonte importo
                  </label>
                  <select
                    id="amount-source"
                    name="amount_source"
                    className="form-select"
                    defaultValue={editingRule?.amount_source ?? "employee_summary"}
                    required
                  >
                    <option value="employee_summary">
                      Riepilogo dipendente
                    </option>
                    <option value="item">Voce analitica</option>
                    <option value="allocation">Allocazione commessa</option>
                    <option value="manual">Manuale</option>
                  </select>
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label" htmlFor="allocation-scope">
                    Livello dettaglio
                  </label>
                  <select
                    id="allocation-scope"
                    name="allocation_scope"
                    className="form-select"
                    defaultValue={editingRule?.allocation_scope ?? "none"}
                    required
                  >
                    <option value="none">Nessuno</option>
                    <option value="employee">Dipendente</option>
                    <option value="project">Commessa</option>
                    <option value="project_employee">
                      Commessa + dipendente
                    </option>
                  </select>
                </div>

                <div className="col-12 col-md-4">
                  <label className="form-label" htmlFor="priority">
                    Priorità
                  </label>
                  <input
                    id="priority"
                    name="priority"
                    type="number"
                    step="1"
                    className="form-control"
                    defaultValue={editingRule?.priority ?? 100}
                    required
                  />
                </div>

                <div className="col-12 col-md-8 d-flex align-items-end">
                  <div className="form-check mb-2">
                    <input
                      id="active"
                      name="active"
                      type="checkbox"
                      className="form-check-input"
                      defaultChecked={editingRule?.active ?? true}
                    />
                    <label className="form-check-label" htmlFor="active">
                      Regola attiva
                    </label>
                  </div>
                </div>

                <div className="col-12">
                  <label className="form-label" htmlFor="notes">
                    Note
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    className="form-control"
                    rows={3}
                    defaultValue={editingRule?.notes ?? ""}
                  />
                </div>

                <div className="col-12 d-flex gap-2">
                  <button type="submit" className="btn btn-primary">
                    {editingRule ? "Salva modifiche" : "Crea regola"}
                  </button>

                  {editingRule && (
                    <Link
                      href="/paghe/configurazione"
                      className="btn btn-outline-secondary"
                    >
                      Annulla
                    </Link>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
