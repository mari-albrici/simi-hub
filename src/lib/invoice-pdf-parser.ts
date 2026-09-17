"use server";

import { getDocumentProxy, extractText } from "unpdf";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export type InvoiceExtraction = {
  invoice_number: string | null;
  invoice_type: "purchase" | "sale" | null;
  invoice_date: string | null;
  due_date: string | null;
  counterparty_name: string | null;
  counterparty_vat_number: string | null;
  issuer_name: string | null;
  amount_net: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  amount_total: number | null;
  notes: string | null;
};

export type ExtractInvoiceResult =
  | { success: true; data: InvoiceExtraction }
  | { success: false; error: string };

// Converte importi in formato italiano ("1.220,00" / "1220,00" / "1220.00") in number.
function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?/);
  if (!match) return null;

  let numStr = match[0].replace(/\s/g, "");
  if (numStr.includes(",") && numStr.includes(".")) {
    numStr = numStr.replace(/\./g, "").replace(",", ".");
  } else if (numStr.includes(",")) {
    numStr = numStr.replace(",", ".");
  }

  const value = parseFloat(numStr);
  return Number.isFinite(value) ? value : null;
}

// Converte date italiane (gg/mm/aaaa, gg-mm-aaaa, gg.mm.aaaa) in formato ISO YYYY-MM-DD.
function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!match) return null;

  const [, d, m, yRaw] = match;
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function cleanText(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.replace(/^[:\-\s]+/, "").trim();
  return value.length > 0 ? value : null;
}

const VAT_RATE_LINE = /iva\s*(\d+(?:[.,]\d+)?)\s*%\s*[:\-]?\s*(.*)$/i;
const AMOUNT_NET_LINE = /(?:totale\s+)?imponibile\s*[:\-]?\s*(.*)$/i;
const DUE_DATE_LINE = /(?:data\s+)?scadenza(?:\s+pagamento)?\s*[:\-]?\s*(.*)$/i;
const INVOICE_DATE_LINE = /data\s*(?:fattura|documento|emissione)?\s*[:\-]\s*(.*)$/i;
const INVOICE_NUMBER_LINE = /(?:fattura\s*n[°.]?|numero\s*(?:fattura|documento)|invoice\s*(?:no|number))\s*[:\-.]?\s*(.*)$/i;
const ISSUER_LINE = /(?:fornitore|mittente|emesso\s*da)\s*[:\-]?\s*(.*)$/i;
const COUNTERPARTY_LINE = /(?:cliente|destinatario|spett(?:\.le|abile)?)\s*[:\-]?\s*(.*)$/i;
const AMOUNT_TOTAL_LINE = /totale\s*(?:documento|fattura|generale|complessivo)?\s*[:\-]?\s*(.*)$/i;
const VAT_NUMBER_ANYWHERE = /\b(IT)?\s?(\d{11})\b/i;

function parseInvoiceText(text: string): InvoiceExtraction {
  const result: InvoiceExtraction = {
    invoice_number: null,
    invoice_type: null,
    invoice_date: null,
    due_date: null,
    counterparty_name: null,
    counterparty_vat_number: null,
    issuer_name: null,
    amount_net: null,
    vat_rate: null,
    vat_amount: null,
    amount_total: null,
    notes: null,
  };

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    let match: RegExpMatchArray | null;

    if (result.vat_rate === null && (match = line.match(VAT_RATE_LINE))) {
      result.vat_rate = parseFloat(match[1].replace(",", "."));
      if (result.vat_amount === null) result.vat_amount = parseAmount(match[2]);
      continue;
    }

    if (result.amount_net === null && (match = line.match(AMOUNT_NET_LINE))) {
      result.amount_net = parseAmount(match[1]);
      continue;
    }

    if (result.due_date === null && (match = line.match(DUE_DATE_LINE))) {
      result.due_date = parseDate(match[1]);
      continue;
    }

    if (result.invoice_date === null && (match = line.match(INVOICE_DATE_LINE))) {
      result.invoice_date = parseDate(match[1]);
      continue;
    }

    if (result.invoice_number === null && (match = line.match(INVOICE_NUMBER_LINE))) {
      result.invoice_number = cleanText(match[1]);
      continue;
    }

    if (result.issuer_name === null && (match = line.match(ISSUER_LINE))) {
      result.issuer_name = cleanText(match[1]);
      continue;
    }

    if (result.counterparty_name === null && (match = line.match(COUNTERPARTY_LINE))) {
      result.counterparty_name = cleanText(match[1]);
      continue;
    }

    if (result.amount_total === null && !/imponibile/i.test(line) && (match = line.match(AMOUNT_TOTAL_LINE))) {
      result.amount_total = parseAmount(match[1]);
      continue;
    }

    if (result.counterparty_vat_number === null && (match = line.match(VAT_NUMBER_ANYWHERE))) {
      result.counterparty_vat_number = `${match[1] ?? ""}${match[2]}`.toUpperCase();
      continue;
    }
  }

  if (result.issuer_name && /simi/i.test(result.issuer_name)) {
    result.invoice_type = "sale";
  } else if (result.counterparty_name && /simi/i.test(result.counterparty_name)) {
    result.invoice_type = "purchase";
  }

  return result;
}

export async function extractInvoiceFromPdfAction(formData: FormData): Promise<ExtractInvoiceResult> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Seleziona un file PDF valido." };
  }

  if (file.type !== "application/pdf") {
    return { success: false, error: "Il file deve essere in formato PDF." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: "Il PDF supera la dimensione massima di 10MB." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });

    if (!text || text.trim().length < 10) {
      return {
        success: false,
        error: "Il PDF non contiene testo selezionabile (probabilmente una scansione): compila i campi manualmente.",
      };
    }

    return { success: true, data: parseInvoiceText(text) };
  } catch (error) {
    console.error("Errore lettura PDF fattura:", error);
    return {
      success: false,
      error: "Impossibile leggere automaticamente la fattura. Compila i campi manualmente.",
    };
  }
}
