import { ManagementAllocations } from "@/components/commercial/management-allocations";
import { getManagementAllocationsByInvoice, getManagementCostCategories } from "@/lib/management-allocations";
import { hasPermission } from "@/lib/auth";
import { InvoiceProjectRequirement } from "@/components/work/invoice-requirement";
import { ContextWork, ContextAnomalies } from "@/components/work/context";
import { FileLink } from "@/components/documents/file-link";
import { formatDate, formatMoney } from "@/lib/formatters";
import { InvoiceCycle } from "@/components/commercial/invoice-cycle";
import { SubmitButton } from "@/components/ui/submit-button";
import { getInvoiceDocuments } from "@/lib/documents";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import {
  requirePagePermission,
  getAccessScope,
} from "@/lib/permissions";
import { getInvoiceById, getProjects } from "@/lib/data";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import {
  getInvoiceFinancialSummaries,
  getInstallmentBalances,
} from "@/lib/finance";
import { saveFinancialMovementAction } from "@/lib/crud";
import { StatusBadge } from "@/components/ui/status-badge";
import { UploadDocumentTrigger } from "@/components/documents/upload-document-trigger";
import { PdfPreviewModal } from "@/components/documents/pdf-preview-modal";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePagePermission("invoice.read");

  const invoice = await getInvoiceById((await params).id);

  if (!invoice) {
    notFound();
  }

  const [
    invoiceDocuments,
    installmentBalances,
    access,
    financialSummaries,
  ] = await Promise.all([
    getInvoiceDocuments(invoice.id),
    getInstallmentBalances(invoice.id),
    getAccessScope("invoice"),
    getInvoiceFinancialSummaries([invoice.id]),
  ]);

  const canReadManagement = hasPermission(user.role, "management.read");
  const canUpdateManagement = hasPermission(user.role, "management.update");
  const [managementAllocations, allocationProjects, costCategories] = await Promise.all([
    canReadManagement ? getManagementAllocationsByInvoice(invoice.id) : Promise.resolve([]),
    canReadManagement && canUpdateManagement ? getProjects() : Promise.resolve([]),
    canReadManagement && canUpdateManagement ? getManagementCostCategories() : Promise.resolve([]),
  ]);

  const financial = financialSummaries.get(invoice.id) ?? {
    paid: 0,
    residual: invoice.amount_total,
    financialStatus: "to_pay" as const,
  };

  const money = (value: number) =>
    formatMoney(value, invoice.currency);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-4">
        <h1 className="h3 mb-0">
          Fattura {invoice.invoice_number}
        </h1>

        <div className="d-flex align-items-center gap-2">
          <StatusBadge
            domain="invoice"
            status={invoice.status}
          />

          {access.canUpdate && (
            <Link
              className="btn btn-dark"
              href={`/fatture/${invoice.id}/edit`}
            >
              Modifica
            </Link>
          )}
        </div>
      </div>

      <div className="app-card p-3 mb-3">
        <dl className="row mb-0">
          <dt className="col-sm-3">Progressivo eSolver</dt>
          <dd className="col-sm-9">
            {invoice.esolver_registration_number || "—"}
          </dd>

          <dt className="col-sm-3">Società</dt>
          <dd className="col-sm-9">
            {invoice.company_name}
          </dd>

          <dt className="col-sm-3">Controparte</dt>
          <dd className="col-sm-9">
            <Link
              href={`/${
                invoice.invoice_type === "purchase"
                  ? "fornitori"
                  : "clienti"
              }/${invoice.supplier_id ?? invoice.customer_id}`}
            >
              {invoice.customer_name}
            </Link>
          </dd>

          <dt className="col-sm-3">Commesse</dt>
          <dd className="col-sm-9">
            {invoice.linked_projects.length
              ? invoice.linked_projects.map((project) => (
                  <Link
                    key={project.id}
                    className="me-3"
                    href={`/commesse/${project.id}`}
                  >
                    {project.project_code}
                  </Link>
                ))
              : "Nessuna commessa collegata"}
          </dd>

          <dt className="col-sm-3">Imponibile</dt>
          <dd className="col-sm-9">
            {money(invoice.amount_net)}
          </dd>

          <dt className="col-sm-3">IVA registrata</dt>
          <dd className="col-sm-9">
            {money(invoice.vat_amount)}
            {invoice.vat_rate !== null
              ? ` (${invoice.vat_rate}%)`
              : ""}
          </dd>

          <dt className="col-sm-3">Totale</dt>
          <dd className="col-sm-9">
            {money(invoice.amount_total)}
          </dd>

          <dt className="col-sm-3">Pagato / incassato</dt>
          <dd className="col-sm-9">
            {money(financial.paid)}
          </dd>

          <dt className="col-sm-3">Residuo</dt>
          <dd className="col-sm-9">
            {money(financial.residual)}{" "}
            <StatusBadge
              domain="payment"
              status={financial.financialStatus}
            />
          </dd>

          <dt className="col-sm-3">Scadenza</dt>
          <dd className="col-sm-9">
            {invoice.due_date ?? "—"}
          </dd>

          <dt className="col-sm-3">Note</dt>
          <dd className="col-sm-9">
            {invoice.notes || "—"}
          </dd>
        </dl>

        <section
          className="document-inline-panel mt-3"
          aria-labelledby="invoice-document-title"
        >
          <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-2">
            <h2
              className="h6 mb-0"
              id="invoice-document-title"
            >
              <i
                className="bi bi-file-earmark-pdf me-2 text-danger"
                aria-hidden="true"
              />
              Documenti fattura

              {invoiceDocuments.length > 0 && (
                <span className="badge text-bg-light ms-2">
                  {invoiceDocuments.length}
                </span>
              )}
            </h2>

            {access.canUpdate && (
              <UploadDocumentTrigger
                context={{ invoice: invoice.id }}
              />
            )}
          </div>

          {invoiceDocuments.length > 0 ? (
            <div className="d-flex flex-column gap-2">
              {invoiceDocuments.map((document) => (
                <div
                  key={document.id}
                  className="d-flex align-items-center justify-content-between gap-3 flex-wrap border rounded p-2"
                >
                  <div className="d-flex align-items-center gap-2 min-w-0">
                    <i
                      className="bi bi-file-earmark-pdf text-danger"
                      aria-hidden="true"
                    />

                    <div className="min-w-0">
                      <div className="fw-semibold text-truncate">
                        {document.title ||
                          document.original_filename}
                      </div>

                      {document.reference && (
                        <div className="small text-muted">
                          {document.reference}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    {document.file_state === "ready" && (
                      <>
                        <PdfPreviewModal
                          versionId={
                            document.current_version_id
                          }
                          filename={
                            document.title ||
                            document.original_filename ||
                            "Documento fattura"
                          }
                        />

                        <FileLink
                          className="btn btn-sm btn-outline-secondary"
                          href={`/documenti/versioni/${document.current_version_id}/file?download=1`}
                        >
                          <i
                            className="bi bi-download me-1"
                            aria-hidden="true"
                          />
                          Scarica
                        </FileLink>
                      </>
                    )}

                    <Link
                      className="btn btn-sm btn-outline-dark"
                      href={`/documenti/${document.id}`}
                    >
                      <i
                        className="bi bi-box-arrow-up-right me-1"
                        aria-hidden="true"
                      />
                      Apri
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mb-0">
              Nessun documento collegato alla fattura.
            </p>
          )}
        </section>
      </div>

      {access.canUpdate && financial.residual > 0 && (
        <div className="app-card p-3 mb-3">
          <h2 className="h5">
            {invoice.invoice_type === "purchase"
              ? "Registra pagamento"
              : "Registra incasso"}
          </h2>

          <form
            action={saveFinancialMovementAction}
            className="row g-2"
          >
            <input
              type="hidden"
              name="direction"
              value={
                invoice.invoice_type === "purchase"
                  ? "payment"
                  : "receipt"
              }
            />

            <input
              type="hidden"
              name="legal_entity_id"
              value={invoice.legal_entity_id ?? ""}
            />

            <input
              type="hidden"
              name="counterparty_id"
              value={
                invoice.supplier_id ??
                invoice.customer_id ??
                ""
              }
            />

            <input
              type="hidden"
              name="currency"
              value={invoice.currency}
            />

            <input
              type="hidden"
              name="primary_invoice_id"
              value={invoice.id}
            />

            <div className="col-md-3">
              <label
                className="form-label"
                htmlFor="amount"
              >
                Importo
              </label>

              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={financial.residual.toFixed(2)}
                className="form-control"
                required
              />
            </div>

            <div className="col-md-3">
              <label
                className="form-label"
                htmlFor="movement_date"
              >
                Data
              </label>

              <input
                id="movement_date"
                name="movement_date"
                type="date"
                defaultValue={new Date()
                  .toISOString()
                  .slice(0, 10)}
                className="form-control"
                required
              />
            </div>

            <div className="col-md-3">
              <label
                className="form-label"
                htmlFor="payment_method"
              >
                Metodo
              </label>

              <input
                id="payment_method"
                name="payment_method"
                className="form-control"
              />
            </div>

            <div className="col-md-3">
              <label
                className="form-label"
                htmlFor="reference"
              >
                Riferimento
              </label>

              <input
                id="reference"
                name="reference"
                className="form-control"
              />
            </div>

            <div className="col-12">
              <SubmitButton
                className="btn btn-primary"
                pendingLabel="Registrazione…"
              >
                {invoice.invoice_type === "purchase"
                  ? "Registra pagamento"
                  : "Registra incasso"}
              </SubmitButton>
            </div>
          </form>
        </div>
      )}

      <div className="app-card p-3 mb-3">
        <h2 className="h5">Righe registrate</h2>

        {invoice.lines.length > 0 ? (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Descrizione</th>
                  <th>Imponibile</th>
                  <th>Aliquota</th>
                  <th>IVA</th>
                  <th>Totale</th>
                </tr>
              </thead>

              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description}</td>
                    <td>{money(line.amount_net)}</td>
                    <td>
                      {line.vat_exempt_reason ||
                        (line.vat_rate === null
                          ? "—"
                          : `${line.vat_rate}%`)}
                    </td>
                    <td>{money(line.amount_vat)}</td>
                    <td>{money(line.amount_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Nessuna riga registrata.</p>
        )}
      </div>

      <div className="app-card p-3 mb-3">
        <h2 className="h5">Rate registrate</h2>

        {invoice.installments.length > 0 ? (
          <ul>
            {invoice.installments.map((installment) => (
              <li
                key={installment.id}
                id={`rata-${installment.id}`}
              >
                {formatDate(installment.due_date)}
                {" — "}
                {money(installment.amount)}
                {" — Saldato: "}
                {money(
                  installmentBalances.get(installment.id)
                    ?.paid ?? 0
                )}
                {" — Residuo: "}
                {money(
                  installmentBalances.get(installment.id)
                    ?.residual ?? installment.amount
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nessuna rata registrata.</p>
        )}
      </div>

      {canReadManagement && (
        <ManagementAllocations
          invoiceId={invoice.id}
          amountTotal={invoice.amount_total}
          currency={invoice.currency}
          allocations={managementAllocations}
          projects={allocationProjects}
          costCategories={costCategories}
          canUpdate={canUpdateManagement}
        />
      )}

      <InvoiceCycle id={invoice.id} />

      <ActivityTimeline items={[]} />

      <InvoiceProjectRequirement
        id={invoice.id}
        canUpdate={access.canUpdate}
      />

      <ContextAnomalies
        kind="invoice"
        id={invoice.id}
      />

      <ContextWork
        kind="invoice"
        id={invoice.id}
      />
    </>
  );
}
