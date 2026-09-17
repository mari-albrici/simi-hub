"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createInvoiceAction } from "@/lib/crud";
import { extractInvoiceFromPdfAction, type InvoiceExtraction } from "@/lib/invoice-ai";

interface FormValues {
  invoice_number: string;
  invoice_type: "purchase" | "sale";
  status: string;
  customer_name: string;
  company_name: string;
  project_code: string;
  invoice_date: string;
  due_date: string;
  amount_net: string;
  vat_rate: string;
  vat_amount: string;
  amount_total: string;
  notes: string;
}

const INITIAL_VALUES: FormValues = {
  invoice_number: "INV-NEW",
  invoice_type: "purchase",
  status: "to_register",
  customer_name: "",
  company_name: "SIMI Italia",
  project_code: "C-NEW",
  invoice_date: "",
  due_date: "",
  amount_net: "",
  vat_rate: "",
  vat_amount: "",
  amount_total: "0",
  notes: "",
};

function toNumberString(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function applyExtraction(current: FormValues, data: InvoiceExtraction): FormValues {
  return {
    ...current,
    invoice_number: data.invoice_number ?? current.invoice_number,
    invoice_type: data.invoice_type ?? current.invoice_type,
    customer_name: data.counterparty_name ?? current.customer_name,
    invoice_date: data.invoice_date ?? current.invoice_date,
    due_date: data.due_date ?? current.due_date,
    amount_net: toNumberString(data.amount_net) || current.amount_net,
    vat_rate: toNumberString(data.vat_rate) || current.vat_rate,
    vat_amount: toNumberString(data.vat_amount) || current.vat_amount,
    amount_total: toNumberString(data.amount_total) || current.amount_total,
    notes:
      data.issuer_name || data.counterparty_vat_number
        ? [
            data.issuer_name ? `Origine: ${data.issuer_name}` : null,
            data.counterparty_vat_number ? `P.IVA: ${data.counterparty_vat_number}` : null,
            current.notes,
          ]
            .filter(Boolean)
            .join(" — ")
        : current.notes,
  };
}

export function NewInvoiceForm() {
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [isExtracting, startExtraction] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handlePdfSelected(file: File | undefined) {
    setAiError(null);
    setAiSuccess(false);
    if (!file) return;

    const pdfFormData = new FormData();
    pdfFormData.set("file", file);

    startExtraction(async () => {
      const result = await extractInvoiceFromPdfAction(pdfFormData);
      if (result.success) {
        setValues((prev) => applyExtraction(prev, result.data));
        setAiSuccess(true);
      } else {
        setAiError(result.error);
      }
    });
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 900 }}>
      <div className="app-card p-4 mb-4">
        <h2 className="h5 mb-2">Lettura automatica da PDF</h2>
        <p className="text-muted small mb-3">
          Carica il PDF della fattura: i campi sottostanti verranno precompilati automaticamente
          (data, intestatario, origine, totale, IVA, aliquota). Controlla sempre i dati prima di salvare.
        </p>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
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
          <div className="alert alert-success mt-3 mb-0 py-2">
            Dati estratti dal PDF. Verifica i campi prima di salvare.
          </div>
        )}
      </div>

      <div className="app-card p-4">
        <h1 className="h3 mb-3">Nuova fattura</h1>

        <form action={createInvoiceAction} className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Numero</label>
            <input
              name="invoice_number"
              className="form-control"
              value={values.invoice_number}
              onChange={(event) => updateField("invoice_number", event.target.value)}
              required
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Tipo</label>
            <select
              name="invoice_type"
              className="form-select"
              value={values.invoice_type}
              onChange={(event) => updateField("invoice_type", event.target.value as FormValues["invoice_type"])}
            >
              <option value="purchase">Acquisto</option>
              <option value="sale">Vendita</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Stato</label>
            <select
              name="status"
              className="form-select"
              value={values.status}
              onChange={(event) => updateField("status", event.target.value)}
            >
              <option value="to_register">Da registrare</option>
              <option value="to_pay">Da pagare</option>
              <option value="paid">Pagata</option>
              <option value="anomaly">Anomalia</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Cliente / Fornitore (intestatario)</label>
            <input
              name="customer_name"
              className="form-control"
              placeholder="Nome cliente o fornitore"
              value={values.customer_name}
              onChange={(event) => updateField("customer_name", event.target.value)}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Società</label>
            <input
              name="company_name"
              className="form-control"
              value={values.company_name}
              onChange={(event) => updateField("company_name", event.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Commessa</label>
            <input
              name="project_code"
              className="form-control"
              value={values.project_code}
              onChange={(event) => updateField("project_code", event.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Data fattura</label>
            <input
              name="invoice_date"
              type="date"
              className="form-control"
              value={values.invoice_date}
              onChange={(event) => updateField("invoice_date", event.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Scadenza</label>
            <input
              name="due_date"
              type="date"
              className="form-control"
              value={values.due_date}
              onChange={(event) => updateField("due_date", event.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Imponibile</label>
            <input
              name="amount_net"
              type="number"
              min={0}
              step="0.01"
              className="form-control"
              value={values.amount_net}
              onChange={(event) => updateField("amount_net", event.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">IVA %</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="form-control"
              value={values.vat_rate}
              onChange={(event) => updateField("vat_rate", event.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">IVA</label>
            <input
              name="vat_amount"
              type="number"
              min={0}
              step="0.01"
              className="form-control"
              value={values.vat_amount}
              onChange={(event) => updateField("vat_amount", event.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Totale</label>
            <input
              name="amount_total"
              type="number"
              min={0}
              step="0.01"
              className="form-control"
              value={values.amount_total}
              onChange={(event) => updateField("amount_total", event.target.value)}
            />
          </div>
          <div className="col-12">
            <label className="form-label">Note</label>
            <textarea
              name="notes"
              className="form-control"
              rows={2}
              value={values.notes}
              onChange={(event) => updateField("notes", event.target.value)}
            />
          </div>
          <div className="col-12 d-flex align-items-end justify-content-end gap-2">
            <Link href="/fatture" className="btn btn-outline-secondary">Annulla</Link>
            <button type="submit" className="btn btn-dark">Salva</button>
          </div>
        </form>
      </div>
    </div>
  );
}
