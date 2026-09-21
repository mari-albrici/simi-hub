"use client";
import { formatMoney } from "@/lib/formatters";


import { statusOptions } from "@/lib/status";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "@/components/ui/app-link";
import { invoiceLineAmounts } from "@/lib/invoice-calculations";
import { createInvoiceAction, updateInvoiceAction } from "@/lib/crud";
import { extractInvoiceFromPdfAction, type InvoiceExtraction } from "@/lib/invoice-pdf-parser";
import { SubmitButton } from "@/components/ui/submit-button";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/types";

type CompanyOption = {
  id: string;
  business_name: string;
  company_type: "customer" | "supplier" | "both";
  vat_number?: string | null;
  address?: string | null;
  iban?: string | null;
};

type LegalEntityOption = { id: string; business_name: string };
type ProjectOption = { id: string; project_code: string; name: string };

interface LineRow {
  id?: string;
  project_id?: string | null;
  key: string;
  description: string;
  unit: string;
  discount: string;
  notes: string;
  quantity: string;
  unit_price: string;
  vat_rate: string;
  vat_exempt_reason: string;
}

interface InstallmentRow {
  id?: string;
  key: string;
  due_date: string;
  amount: string;
  paid: boolean;
}

interface InvoiceRecord {
  document_id?: string | null;
  id: string;
  updated_at: string;
  invoice_number: string;
  esolver_registration_number?: string | null;
  invoice_type: "purchase" | "sale";
  status: string;
  legal_entity_id?: string | null;
  supplier_id?: string | null;
  customer_id?: string | null;
  payment_method?: string | null;
  invoice_date?: string;
  received_date?: string | null;
  registration_date?: string | null;
  currency?: string;
  vat_treatment?: string | null;
  due_date?: string;
  amount_net: number;
  vat_rate?: number | null;
  vat_exempt_reason?: string | null;
  vat_amount: number;
  amount_total: number;
  notes?: string;
  project_ids?: string[];
  lines?: Array<{
    id?: string;
    project_id?: string | null;
    description: string;
    unit?: string | null;
    discount?: number;
    notes?: string | null;
    quantity: number;
    unit_price: number;
    vat_rate: number | null;
    vat_exempt_reason: string | null;
  }>;
  installments?: Array<{ id?: string; due_date: string; amount: number; paid: boolean }>;
}

function newKey() {
  return Math.random().toString(36).slice(2);
}

function toNum(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function computeLine(line: LineRow) {
  return invoiceLineAmounts({ quantity: toNum(line.quantity), unit_price: toNum(line.unit_price), discount: toNum(line.discount), vat_rate: line.vat_rate === "" ? null : toNum(line.vat_rate), vat_exempt_reason: line.vat_exempt_reason || null });
}

function emptyLine(): LineRow {
  return { key: newKey(), description: "", unit: "", discount: "0", notes: "", quantity: "1", unit_price: "0", vat_rate: "", vat_exempt_reason: "" };
}

function emptyInstallment(): InstallmentRow {
  return { key: newKey(), due_date: "", amount: "0", paid: false };
}

function containsWordSimi(value: string) {
  return /simi/i.test(value.replace(/[^a-z]/gi, ""));
}

export function InvoiceForm({
  mode,
  invoice,
  companies,
  legalEntities,
  projects,
  embedded = false,
  initialProjectId,
  onCancel,
}: {
  mode: "create" | "edit";
  invoice?: InvoiceRecord;
  companies: CompanyOption[];
  legalEntities: LegalEntityOption[];
  projects: ProjectOption[];
  embedded?: boolean;
  initialProjectId?: string;
  onCancel?: () => void;
  onSubmitted?: () => void;
}) {
  const invoiceFormId=useId();
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoice_number ?? "");
  const [esolverRegistrationNumber, setEsolverRegistrationNumber] = useState(invoice?.esolver_registration_number ?? "");
  const [invoiceType, setInvoiceType] = useState<"purchase" | "sale">(invoice?.invoice_type ?? "purchase");
  const [status, setStatus] = useState(invoice?.status ?? "to_register");
  const [legalEntityId, setLegalEntityId] = useState(invoice?.legal_entity_id ?? "");
  const [counterpartyId, setCounterpartyId] = useState(
    invoice?.invoice_type === "sale" ? invoice?.customer_id ?? "" : invoice?.supplier_id ?? "",
  );
  const [isNewCounterparty, setIsNewCounterparty] = useState(false);
  const [newCounterpartyName, setNewCounterpartyName] = useState("");
  const [newCounterpartyVat, setNewCounterpartyVat] = useState("");
  const [newCounterpartyAddress, setNewCounterpartyAddress] = useState("");
  const [newCounterpartyIban, setNewCounterpartyIban] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(invoice?.payment_method ?? "");
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoice_date ?? "");
  const [receivedDate, setReceivedDate] = useState(invoice?.received_date ?? "");
  const [registrationDate, setRegistrationDate] = useState(invoice?.registration_date ?? "");
  const [currency, setCurrency] = useState(invoice?.currency ?? "EUR");
  const [vatTreatment, setVatTreatment] = useState(invoice?.vat_treatment ?? "");
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [projectIds, setProjectIds] = useState<string[]>(invoice?.project_ids ?? (initialProjectId ? [initialProjectId] : []));
  const [notes, setNotes] = useState(invoice?.notes ?? "");

  const [headerAmountNet, setHeaderAmountNet] = useState(String(invoice?.amount_net ?? 0));
  const [headerVatRate, setHeaderVatRate] = useState(invoice?.vat_rate != null ? String(invoice.vat_rate) : "");
  const [headerVatExemptReason, setHeaderVatExemptReason] = useState(invoice?.vat_exempt_reason ?? "");
  const [headerVatAmount, setHeaderVatAmount] = useState(String(invoice?.vat_amount ?? 0));
  const [headerAmountTotal, setHeaderAmountTotal] = useState(String(invoice?.amount_total ?? 0));

  const [lines, setLines] = useState<LineRow[]>(
    invoice?.lines?.length
      ? invoice.lines.map((line) => ({
          key: newKey(),
          id: line.id,
          project_id: line.project_id,
          description: line.description,
          unit: line.unit ?? "", discount: String(line.discount ?? 0), notes: line.notes ?? "",
          quantity: String(line.quantity),
          unit_price: String(line.unit_price),
          vat_rate: line.vat_rate != null ? String(line.vat_rate) : "",
          vat_exempt_reason: line.vat_exempt_reason ?? "",
        }))
      : [],
  );
  const [installments, setInstallments] = useState<InstallmentRow[]>(
    invoice?.installments?.map((item) => ({
      key: newKey(),
      id: item.id,
      due_date: item.due_date,
      amount: String(item.amount),
      paid: item.paid,
    })) ?? [],
  );

  const [isExtracting, startExtraction] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const counterpartyType = invoiceType === "purchase" ? "supplier" : "customer";
  const counterpartyOptions = useMemo(
    () => companies.filter((company) => company.company_type === counterpartyType || company.company_type === "both"),
    [companies, counterpartyType],
  );
  const selectedCounterparty = counterpartyOptions.find((company) => company.id === counterpartyId);

  const lineTotals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        const { net, vat, total } = computeLine(line);
        return { net: acc.net + net, vat: acc.vat + vat, total: acc.total + total };
      },
      { net: 0, vat: 0, total: 0 },
    );
  }, [lines]);

  const hasLines = lines.length > 0;
  const displayAmountNet = hasLines ? lineTotals.net : toNum(headerAmountNet);
  const displayVatAmount = hasLines ? lineTotals.vat : toNum(headerVatAmount);
  const displayAmountTotal = hasLines ? lineTotals.total : toNum(headerAmountTotal);

  const installmentsTotal = installments.reduce((sum, item) => sum + toNum(item.amount), 0);

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function recalcHeaderFromNetAndRate(net: string, rate: string, exempt: string) {
    const netValue = toNum(net);
    const vat = exempt ? 0 : netValue * (toNum(rate) / 100);
    setHeaderVatAmount(String(Math.round(vat * 100) / 100));
    setHeaderAmountTotal(String(Math.round((netValue + vat) * 100) / 100));
  }

  function handlePdfSelected(file: File | undefined) {
    setAiError(null);
    setAiSuccess(false);
    if (!file) return;

    const pdfFormData = new FormData();
    pdfFormData.set("file", file);

    startExtraction(async () => {
      const result = await extractInvoiceFromPdfAction(pdfFormData);
      if (!result.success) {
        setAiError(result.error);
        return;
      }

      const data: InvoiceExtraction = result.data;
      if (data.invoice_number) setInvoiceNumber(data.invoice_number);
      if (data.invoice_type) setInvoiceType(data.invoice_type);
      if (data.invoice_date) setInvoiceDate(data.invoice_date);
      if (data.due_date) setDueDate(data.due_date);
      if (data.currency) setCurrency(data.currency);

      const partyName = data.issuer_name && containsWordSimi(data.issuer_name) ? data.counterparty_name : data.issuer_name;
      if (partyName) {
        const match = companies.find((company) => company.business_name.toLowerCase().includes(partyName.toLowerCase()));
        if (match) {
          setCounterpartyId(match.id);
          setIsNewCounterparty(false);
        } else {
          setIsNewCounterparty(true);
          setNewCounterpartyName(partyName);
          setNewCounterpartyVat(data.counterparty_vat_number ?? "");
        }
      }

      if (data.amount_net != null) setHeaderAmountNet(String(data.amount_net));
      if (data.vat_rate != null) setHeaderVatRate(String(data.vat_rate));
      if (data.vat_amount != null) setHeaderVatAmount(String(data.vat_amount));
      if (data.amount_total != null) setHeaderAmountTotal(String(data.amount_total));
      setAiSuccess(true);
    });
  }

  const action = mode === "create" ? createInvoiceAction : updateInvoiceAction;

  const [projectSearch, setProjectSearch] = useState("");

  return (
    <div className={embedded ? undefined : "mx-auto"} style={embedded ? undefined : { maxWidth: 1100 }}>
      {mode === "create" && (
        <div className="app-card p-4 mb-4">
          <h2 className="h5 mb-2">Lettura automatica da PDF</h2>
          <p className="text-muted small mb-3">
            Carica il PDF della fattura: i campi verranno precompilati automaticamente. Controlla sempre i dati prima di salvare.
          </p>
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              name="pdf_file"
              form={invoiceFormId}
              className="form-control"
              style={{ maxWidth: 360 }}
              disabled={isExtracting}
              onChange={(event) => handlePdfSelected(event.target.files?.[0])}
            />
            {isExtracting && (
              <span className="text-muted small">
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                Lettura del documento in corso…
              </span>
            )}
          </div>
          {aiError && <div className="alert alert-warning mt-3 mb-0 py-2">{aiError}</div>}
          {aiSuccess && !isExtracting && (
            <div className="alert alert-success mt-3 mb-0 py-2">Dati estratti dal PDF. Verifica i campi prima di salvare.</div>
          )}
        </div>
      )}

      <div className={embedded ? undefined : "app-card p-4"}>
        {!embedded && <h1 className="h3 mb-3">{mode === "create" ? "Nuova fattura" : "Modifica fattura"}</h1>}

        <form id={invoiceFormId} action={action} className="row g-3" onSubmit={() => { /* Keep form mounted until server action completes. */ }}>
          {mode === "edit" && invoice && <><input type="hidden" name="document_id" value={invoice?.document_id??""}/><input type="hidden" name="id" value={invoice.id} /><input type="hidden" name="expected_updated_at" value={invoice.updated_at} /></>}
          <input type="hidden" name="amount_net" value={displayAmountNet.toFixed(2)} />
          <input type="hidden" name="vat_amount" value={displayVatAmount.toFixed(2)} />
          <input type="hidden" name="amount_total" value={displayAmountTotal.toFixed(2)} />
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="esolver_registration_number" value={esolverRegistrationNumber} />
          {projectIds.map(projectId => <input key={projectId} type="hidden" name="project_ids" value={projectId} />)}
          <input type="hidden" name="vat_treatment" value={vatTreatment} />
          <input type="hidden" name="received_date" value={receivedDate} />
          <input type="hidden" name="registration_date" value={registrationDate} />
          <input
            type="hidden"
            name="lines_json"
            value={JSON.stringify(
              lines.map((line) => {
                const totals = computeLine(line);
                return {
                  id: line.id,
                  project_id: line.project_id ?? null,
                  description: line.description,
                  quantity: toNum(line.quantity),
                  unit_price: toNum(line.unit_price),
                  vat_rate: line.vat_exempt_reason || line.vat_rate === "" ? null : toNum(line.vat_rate),
                  vat_exempt_reason: line.vat_exempt_reason || null, unit: line.unit || null, discount: toNum(line.discount || "0"), notes: line.notes || null,
                  amount_net: totals.net,
                  amount_vat: totals.vat,
                  amount_total: totals.total,
                };
              }),
            )}
          />
          <input
            type="hidden"
            name="installments_json"
            value={JSON.stringify(
              installments.map((item) => ({ id: item.id, due_date: item.due_date, amount: toNum(item.amount), paid: item.paid })),
            )}
          />

          <div className="col-12">
            <h2 className="h6 text-uppercase text-muted mb-2">Dati generali</h2>
          </div>
          <div className="col-md-3">
            <label className="form-label">Numero fattura</label>
            <input
              name="invoice_number"
              className="form-control"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              required
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Tipo</label>
            <select
              name="invoice_type"
              className="form-select"
              value={invoiceType}
              onChange={(event) => {
                setInvoiceType(event.target.value as "purchase" | "sale");
                setCounterpartyId("");
                setIsNewCounterparty(false);
              }}
            >
              <option value="purchase">Acquisto (fornitore)</option>
              <option value="sale">Vendita (cliente)</option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Stato</label>
            <select name="status" className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statusOptions("invoice",["to_register","to_check","to_pay","scheduled","paid","anomaly","archived"]).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Sede SIMI</label>
            <select
              name="legal_entity_id"
              className="form-select"
              value={legalEntityId}
              onChange={(event) => setLegalEntityId(event.target.value)}
              required
            >
              <option value="">Seleziona…</option>
              {legalEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>{entity.business_name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3"><label className="form-label">Prog. eSolver</label><input name="esolver_registration_number_visible" className="form-control" value={esolverRegistrationNumber} onChange={(event) => setEsolverRegistrationNumber(event.target.value)} maxLength={120} /></div>

          <div className="col-md-4">
            <label className="form-label">Data fattura</label>
            <input name="invoice_date" type="date" className="form-control" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
          </div>
          <div className="col-md-4"><label className="form-label">Data ricezione</label><input name="received_date" type="date" className="form-control" value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></div>
          <div className="col-md-4"><label className="form-label">Data registrazione</label><input name="registration_date" type="date" className="form-control" value={registrationDate} onChange={(event) => setRegistrationDate(event.target.value)} /></div>
          <div className="col-md-4"><label className="form-label">Valuta</label><input name="currency_visible" className="form-control" maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required /></div>
          <div className="col-md-8"><label className="form-label">Trattamento IVA</label><select name="vat_treatment_visible" className="form-select" value={vatTreatment} onChange={(event) => setVatTreatment(event.target.value)}><option value="">Ordinario / da specificare</option><option value="esente">Esente</option><option value="non_imponibile">Non imponibile</option><option value="fuori_campo">Fuori campo</option><option value="reverse_charge">Reverse charge</option></select></div>
          <div className="col-md-4">
            <label className="form-label">Data scadenza</label>
            <input name="due_date" type="date" className="form-control" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Metodo di pagamento</label>
            <select name="payment_method" className="form-select" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="">Non specificato</option>
              {(Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="col-12"><hr className="my-1" /></div>
          <div className="col-12">
            <h2 className="h6 text-uppercase text-muted mb-2">{invoiceType === "purchase" ? "Fornitore" : "Cliente"}</h2>
          </div>

          {!isNewCounterparty ? (
            <>
              <div className="col-md-8">
                <label className="form-label">{invoiceType === "purchase" ? "Fornitore" : "Cliente"}</label>
                <select
                  name="counterparty_id"
                  className="form-select"
                  value={counterpartyId}
                  onChange={(event) => setCounterpartyId(event.target.value)}
                >
                  <option value="">Seleziona…</option>
                  {counterpartyOptions.map((company) => (
                    <option key={company.id} value={company.id}>{company.business_name}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <button type="button" className="btn btn-outline-secondary w-100" onClick={() => setIsNewCounterparty(true)}>
                  + Nuovo {invoiceType === "purchase" ? "fornitore" : "cliente"}
                </button>
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted">P.IVA</label>
                <input className="form-control" value={selectedCounterparty?.vat_number ?? ""} readOnly disabled />
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted">Indirizzo</label>
                <input className="form-control" value={selectedCounterparty?.address ?? ""} readOnly disabled />
              </div>
              <div className="col-md-4">
                <label className="form-label small text-muted">IBAN</label>
                <input className="form-control" value={selectedCounterparty?.iban ?? ""} readOnly disabled />
              </div>
            </>
          ) : (
            <>
              <input type="hidden" name="counterparty_id" value="" />
              <div className="col-md-6">
                <label className="form-label">Ragione sociale</label>
                <input
                  name="counterparty_new_name"
                  className="form-control"
                  value={newCounterpartyName}
                  onChange={(event) => setNewCounterpartyName(event.target.value)}
                  required
                />
              </div>
              <div className="col-md-6 d-flex align-items-end">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setIsNewCounterparty(false)}>
                  Seleziona esistente
                </button>
              </div>
              <div className="col-md-4">
                <label className="form-label">P.IVA</label>
                <input name="counterparty_new_vat" className="form-control" value={newCounterpartyVat} onChange={(event) => setNewCounterpartyVat(event.target.value)} />
              </div>
              <div className="col-md-4">
                <label className="form-label">Indirizzo</label>
                <input name="counterparty_new_address" className="form-control" value={newCounterpartyAddress} onChange={(event) => setNewCounterpartyAddress(event.target.value)} />
              </div>
              <div className="col-md-4">
                <label className="form-label">IBAN</label>
                <input name="counterparty_new_iban" className="form-control" value={newCounterpartyIban} onChange={(event) => setNewCounterpartyIban(event.target.value)} />
              </div>
            </>
          )}

          <div className="col-12"><hr className="my-1" /></div>
          <div className="col-12">
            <h2 className="h6 text-uppercase text-muted mb-2">Commesse collegate</h2>

<div className="dropdown">
  <button
    className="btn btn-outline-secondary dropdown-toggle w-100 text-start d-flex justify-content-between align-items-center"
    type="button"
    data-bs-toggle="dropdown"
    data-bs-auto-close="outside"
    aria-expanded="false"
  >
    <span>
      {projectIds.length === 0
        ? "Seleziona commesse..."
        : `${projectIds.length} commess${projectIds.length === 1 ? "a selezionata" : "e selezionate"}`}
    </span>
  </button>

  <div
    className="dropdown-menu w-100 p-3"
    style={{ maxHeight: "350px", overflowY: "auto" }}
  >
    <input
      type="search"
      className="form-control mb-2"
      placeholder="Cerca commessa..."
      value={projectSearch}
      onChange={(e) => setProjectSearch(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    />

    {projects.length === 0 ? (
      <span className="dropdown-item-text text-muted small">
        Nessuna commessa disponibile.
      </span>
    ) : (
      projects
        .filter((project) => {
          const search = projectSearch.toLowerCase();

          return (
            project.project_code.toLowerCase().includes(search) ||
            project.name.toLowerCase().includes(search)
          );
        })
        .map((project) => (
          <label
            key={project.id}
            className="dropdown-item d-flex align-items-center gap-2"
            style={{ cursor: "pointer" }}
          >
            <input
              type="checkbox"
              className="form-check-input mt-0"
              value={project.id}
              checked={projectIds.includes(project.id)}
              onChange={(event) => {
                setProjectIds((prev) =>
                  event.target.checked
                    ? [...prev, project.id]
                    : prev.filter((id) => id !== project.id),
                );
              }}
            />

            <span className="small">
              <strong>{project.project_code}</strong> — {project.name}
            </span>
          </label>
        ))
    )}
  </div>
</div>
          </div>

          <div className="col-12"><hr className="my-1" /></div>
          <div className="col-12 d-flex justify-content-between align-items-center">
            <h2 className="h6 text-uppercase text-muted mb-2">Righe fattura</h2>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              + Aggiungi riga
            </button>
          </div>
          {lines.length > 0 && (
            <div className="col-12 table-responsive">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Descrizione</th>
                    <th style={{ width: 80 }}>Unità</th>
                    <th style={{ width: 90 }}>Qtà</th>
                    <th style={{ width: 120 }}>Prezzo unit.</th>
                    <th style={{ width: 90 }}>Sconto %</th>
                    <th style={{ width: 110 }}>IVA %</th>
                    <th style={{ width: 140 }}>Esenzione</th>
                    <th style={{ width: 100 }} className="text-end">Totale</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const { total } = computeLine(line);
                    return (
                      <tr key={line.key}>
                        <td>
                          <input className="form-control form-control-sm" value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} />
                        </td>
                        <td><input className="form-control form-control-sm" value={line.unit} onChange={(event) => updateLine(line.key, { unit: event.target.value })} /></td>
                        <td>
                          <input type="number" step="0.01" className="form-control form-control-sm" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} />
                        </td>
                        <td>
                          <input type="number" step="0.01" className="form-control form-control-sm" value={line.unit_price} onChange={(event) => updateLine(line.key, { unit_price: event.target.value })} />
                        </td>
                        <td><input type="number" min="-100" max="100" step="0.01" className="form-control form-control-sm" value={line.discount} onChange={(event) => updateLine(line.key, { discount: event.target.value })} /></td>
                        <td>
                          <input type="number" step="0.01" className="form-control form-control-sm" value={line.vat_rate} disabled={Boolean(line.vat_exempt_reason)} onChange={(event) => updateLine(line.key, { vat_rate: event.target.value })} />
                        </td>
                        <td>
                          <input placeholder="Motivo (se esente)" className="form-control form-control-sm" value={line.vat_exempt_reason} onChange={(event) => updateLine(line.key, { vat_exempt_reason: event.target.value })} />
                        </td>
                        <td className="text-end">{formatMoney(total,currency)}</td>
                        <td>
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setLines((prev) => prev.filter((item) => item.key !== line.key))}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="col-12"><hr className="my-1" /></div>
          <div className="col-12">
            <h2 className="h6 text-uppercase text-muted mb-2">Riepilogo importi</h2>
            <p className="text-muted small mb-2">
              {hasLines ? "Calcolati automaticamente dalle righe fattura." : "Nessuna riga: inserisci gli importi manualmente."}
            </p>
          </div>
          <div className="col-md-3">
            <label className="form-label">Imponibile</label>
            <input
              type="number"
              min={-999999999999.99}
              step="0.01"
              className="form-control"
              value={hasLines ? displayAmountNet.toFixed(2) : headerAmountNet}
              disabled={hasLines}
              onChange={(event) => {
                setHeaderAmountNet(event.target.value);
                recalcHeaderFromNetAndRate(event.target.value, headerVatRate, headerVatExemptReason);
              }}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">IVA %</label>
            <input
              name="vat_rate"
              type="number"
              min={-100}
              step="0.01"
              className="form-control"
              value={headerVatRate}
              disabled={hasLines || Boolean(headerVatExemptReason)}
              onChange={(event) => {
                setHeaderVatRate(event.target.value);
                recalcHeaderFromNetAndRate(headerAmountNet, event.target.value, headerVatExemptReason);
              }}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Esenzione IVA</label>
            <input
              name="vat_exempt_reason"
              placeholder="Motivo (se esente)"
              className="form-control"
              value={headerVatExemptReason}
              disabled={hasLines}
              onChange={(event) => {
                setHeaderVatExemptReason(event.target.value);
                recalcHeaderFromNetAndRate(headerAmountNet, headerVatRate, event.target.value);
              }}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">IVA</label>
            <input type="number" min={-999999999999.99} step="0.01" className="form-control" value={hasLines ? displayVatAmount.toFixed(2) : headerVatAmount} disabled={hasLines} onChange={(event) => setHeaderVatAmount(event.target.value)} />
          </div>
          <div className="col-md-3 offset-md-9">
            <label className="form-label fw-semibold">Totale fattura</label>
            <input type="number" min={-999999999999.99} step="0.01" className="form-control fw-semibold" value={hasLines ? displayAmountTotal.toFixed(2) : headerAmountTotal} disabled={hasLines} onChange={(event) => setHeaderAmountTotal(event.target.value)} />
          </div>

          <div className="col-12"><hr className="my-1" /></div>
          <div className="col-12 d-flex justify-content-between align-items-center">
            <h2 className="h6 text-uppercase text-muted mb-2">Rate di pagamento (opzionale)</h2>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setInstallments((prev) => [...prev, emptyInstallment()])}>
              + Aggiungi rata
            </button>
          </div>
          {installments.length > 0 && (
            <div className="col-12 table-responsive">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Data scadenza</th>
                    <th>Importo</th>
                    <th>Pagata</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {installments.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <input type="date" className="form-control form-control-sm" value={item.due_date} onChange={(event) => setInstallments((prev) => prev.map((row) => (row.key === item.key ? { ...row, due_date: event.target.value } : row)))} />
                      </td>
                      <td>
                        <input type="number" step="0.01" className="form-control form-control-sm" value={item.amount} onChange={(event) => setInstallments((prev) => prev.map((row) => (row.key === item.key ? { ...row, amount: event.target.value } : row)))} />
                      </td>
                      <td>
                        <input type="checkbox" className="form-check-input" checked={item.paid} onChange={(event) => setInstallments((prev) => prev.map((row) => (row.key === item.key ? { ...row, paid: event.target.checked } : row)))} />
                      </td>
                      <td>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setInstallments((prev) => prev.filter((row) => row.key !== item.key))}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {installmentsTotal !== displayAmountTotal && (
                <p className="text-muted small mb-0">
                  Totale rate: {formatMoney(installmentsTotal,currency)} (fattura: {formatMoney(displayAmountTotal,currency)})
                </p>
              )}
            </div>
          )}

          <div className="col-12">
            <label className="form-label">Note</label>
            <textarea name="notes" className="form-control" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>

          <div className="col-12 d-flex align-items-end justify-content-end gap-2">
            {onCancel ? (
              <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>Annulla</button>
            ) : (
              <Link href="/fatture" className="btn btn-outline-secondary">Annulla</Link>
            )}
            <SubmitButton className="btn btn-dark" pendingLabel="Salvataggio…">Salva</SubmitButton>
          </div>
        <label className="form-check mt-3"><input className="form-check-input" type="checkbox" name="acknowledge_pdf_duplicate" value="1"/>Confermo il caricamento del PDF anche se lo stesso contenuto è già presente in archivio.</label></form>
      </div>
    </div>
  );
}
