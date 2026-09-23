import Link from "@/components/ui/app-link";

import {
  createPayrollRunAction,
  getPayrollLegalEntities,
} from "@/lib/payroll";

import { requirePagePermission } from "@/lib/permissions";

type PageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const MONTHS = [
  { value: 1, label: "Gennaio" },
  { value: 2, label: "Febbraio" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Aprile" },
  { value: 5, label: "Maggio" },
  { value: 6, label: "Giugno" },
  { value: 7, label: "Luglio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Settembre" },
  { value: 10, label: "Ottobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Dicembre" },
];

export default async function NewPayrollRunPage({
  searchParams,
}: PageProps) {
  await requirePagePermission(
    "payroll.create",
  );

  const params = await searchParams;

  const legalEntities =
    await getPayrollLegalEntities();

  const now = new Date();

  const currentYear =
    now.getFullYear();

  const currentMonth =
    now.getMonth() + 1;

  return (
    <div className="container-fluid py-4">
      <div className="mb-4">
        <Link
          href="/paghe"
          className="text-decoration-none small"
        >
          <i
            className="bi bi-arrow-left me-2"
            aria-hidden="true"
          />
          Torna alle paghe
        </Link>
      </div>

      <div className="row justify-content-center">
        <div className="col-12 col-xl-9 col-xxl-8">
          <div className="mb-4">
            <h1 className="h3 mb-1">
              Nuova elaborazione
            </h1>

            <p className="text-muted mb-0">
              Crea il periodo mensile su cui
              registrare i dati paghe ricevuti
              dal consulente.
            </p>
          </div>

          {params.error && (
            <div
              className="alert alert-danger"
              role="alert"
            >
              {params.error}
            </div>
          )}

          <form action={createPayrollRunAction}>
            <div className="card mb-4">
              <div className="card-header bg-body">
                <h2 className="h5 mb-0">
                  Periodo e società
                </h2>
              </div>

              <div className="card-body">
                <div className="row g-3">
                  <div className="col-12 col-lg-6">
                    <label
                      htmlFor="legal_entity_id"
                      className="form-label"
                    >
                      Società
                    </label>

                    <select
                      id="legal_entity_id"
                      name="legal_entity_id"
                      className="form-select"
                      required
                    >
                      <option value="">
                        Seleziona società
                      </option>

                      {legalEntities.map(
                        (entity) => (
                          <option
                            key={entity.id}
                            value={entity.id}
                          >
                            {entity.code} —{" "}
                            {entity.business_name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="col-6 col-lg-3">
                    <label
                      htmlFor="month"
                      className="form-label"
                    >
                      Mese
                    </label>

                    <select
                      id="month"
                      name="month"
                      className="form-select"
                      defaultValue={currentMonth}
                      required
                    >
                      {MONTHS.map((month) => (
                        <option
                          key={month.value}
                          value={month.value}
                        >
                          {month.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-6 col-lg-3">
                    <label
                      htmlFor="year"
                      className="form-label"
                    >
                      Anno
                    </label>

                    <input
                      id="year"
                      name="year"
                      type="number"
                      className="form-control"
                      min={2000}
                      max={2100}
                      defaultValue={currentYear}
                      required
                    />
                  </div>

                  <div className="col-6 col-lg-3">
                    <label
                      htmlFor="country"
                      className="form-label"
                    >
                      Paese
                    </label>

                    <select
                      id="country"
                      name="country"
                      className="form-select"
                      defaultValue="IT"
                      required
                    >
                      <option value="IT">
                        Italia
                      </option>

                      <option value="FR">
                        Francia
                      </option>

                      <option value="LU">
                        Lussemburgo
                      </option>

                      <option value="BE">
                        Belgio
                      </option>

                      <option value="DE">
                        Germania
                      </option>

                      <option value="MC">
                        Monaco
                      </option>
                    </select>
                  </div>

                  <div className="col-6 col-lg-3">
                    <label
                      htmlFor="currency"
                      className="form-label"
                    >
                      Valuta
                    </label>

                    <select
                      id="currency"
                      name="currency"
                      className="form-select"
                      defaultValue="EUR"
                      required
                    >
                      <option value="EUR">
                        EUR — Euro
                      </option>

                      <option value="CHF">
                        CHF — Franco svizzero
                      </option>

                      <option value="GBP">
                        GBP — Sterlina
                      </option>

                      <option value="USD">
                        USD — Dollaro USA
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="card mb-4">
              <div className="card-header bg-body">
                <h2 className="h5 mb-0">
                  Origine dei dati
                </h2>
              </div>

              <div className="card-body">
                <div className="row g-3">
                  <div className="col-12">
                    <label
                      htmlFor="source"
                      className="form-label"
                    >
                      Fonte
                    </label>

                    <input
                      id="source"
                      name="source"
                      type="text"
                      className="form-control"
                      maxLength={200}
                      placeholder="Es. Studio paghe, file Excel, elaborazione consulente..."
                    />

                    <div className="form-text">
                      Indica da dove provengono i
                      dati ufficiali della mensilità.
                    </div>
                  </div>

                  <div className="col-12">
                    <label
                      htmlFor="notes"
                      className="form-label"
                    >
                      Note
                    </label>

                    <textarea
                      id="notes"
                      name="notes"
                      className="form-control"
                      rows={4}
                      maxLength={10000}
                      placeholder="Eventuali annotazioni sull'elaborazione..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2">
              <Link
                href="/paghe"
                className="btn btn-outline-secondary"
              >
                Annulla
              </Link>

              <button
                type="submit"
                className="btn btn-primary"
              >
                <i
                  className="bi bi-plus-lg me-2"
                  aria-hidden="true"
                />
                Crea elaborazione
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}