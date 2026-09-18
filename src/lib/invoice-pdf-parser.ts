"use server";

import os from "os";
import { parsePdfAmount } from "@/lib/money";
import { dateSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions";
import { publicError } from "@/lib/errors";
import { getDocumentProxy, extractText, renderPageAsImage } from "unpdf";
import { createWorker } from "tesseract.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_TEXT_LENGTH = 10;
const MAX_OCR_PAGES = 1;
const OCR_RENDER_SCALE = 2;
const OCR_TIMEOUT_MS = 45_000;

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
  currency: string | null;
  notes: string | null;
};

export type ExtractInvoiceResult =
  | { success: true; data: InvoiceExtraction }
  | { success: false; error: string };

// Current extraction labels are Italian: grouping is interpreted explicitly as Italian.
function parseAmount(raw: string | undefined) { return parsePdfAmount(raw, "it"); }

// Converte date italiane (gg/mm/aaaa, gg-mm-aaaa, gg.mm.aaaa) in formato ISO YYYY-MM-DD.
function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!match) return null;

  const [, d, m, yRaw] = match;
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
  const parsed = dateSchema.safeParse(`${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  return parsed.success ? parsed.data : null;
}

function cleanText(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.replace(/^[:\-\s]+/, "").trim();
  return value.length > 0 ? value : null;
}

// Confronto tollerante a punti/spazi tra le lettere (es. "S.I.M.I." nei facsimile SDI).
function containsSimi(value: string | null): boolean {
  if (!value) return false;
  return /simi/i.test(value.replace(/[^a-z]/gi, ""));
}

// Evita che l'OCR (download del modello lingua + riconoscimento) blocchi la function
// serverless fino al suo limite di durata: fallisce in modo controllato entro OCR_TIMEOUT_MS.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Fallback per PDF con testo non estraibile (scansioni o font senza mappatura Unicode,
// caso frequente nelle fatture elettroniche generate dal foglio di stile SDI): rende le
// prime pagine come immagine ed esegue OCR locale (nessuna API esterna).
async function ocrExtractText(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string> {
  const pagesToScan = Math.min(pdf.numPages, MAX_OCR_PAGES);
  const worker = await createWorker("ita", 1, { cachePath: os.tmpdir() });

  try {
    let combined = "";
    for (let pageNumber = 1; pageNumber <= pagesToScan; pageNumber += 1) {
      const imageBuffer = await renderPageAsImage(pdf, pageNumber, {
        scale: OCR_RENDER_SCALE,
        canvasImport: () => import("@napi-rs/canvas"),
      });
      const { data } = await worker.recognize(Buffer.from(imageBuffer));
      combined += `\n${data.text}`;
    }
    return combined;
  } finally {
    await worker.terminate();
  }
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

// Rileva il facsimile ufficiale SDI (Agenzia delle Entrate): layout a due colonne
// Cedente/prestatore (fornitore) | Cessionario/committente (cliente), molto diverso
// dalle fatture "generiche" gestite dalle regole sopra.
const SDI_FACSIMILE_MARKER = /cedente\/prestatore/i;

// Le colonne fornitore/cliente vengono spesso lette dall'OCR sulla stessa riga:
// "Denominazione: NOME1 Denominazione: NOME2" (una eventuale terza occorrenza,
// tipica del "Terzo Intermediario", viene ignorata prendendo solo le prime due).
function extractPairedLabelValues(text: string, label: string): string[] {
  const regex = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n]+?)(?=\\s*(?:${label}|Regime fiscale|Indirizzo|Comune|Cap|$))`, "gim");
  return [...text.matchAll(regex)].map((match) => match[1].trim()).filter(Boolean);
}

function extractVatNumbersSdi(text: string): string[] {
  const regex = /Identificativo fiscale ai fini\s*IVA:\s*(IT)\s*(\d{11})/gi;
  return [...text.matchAll(regex)].map((match) => `${match[1]}${match[2]}`.toUpperCase());
}

// "Data scadenza"/"Data termine" seguita, sulla stessa riga, dall'importo pagato:
// è il modo più affidabile per ottenere insieme scadenza e totale documento in questo layout.
function extractDueDateAndTotalSdi(text: string): { due_date: string | null; amount_total: number | null } {
  const regex = /Data\s*(?:scadenza|termine)\s*[:\-]?\s*(\d{1,2}[-./]\d{1,2}[-./]\d{2,4})(?:[ \t]*([\d.,]+))?/gi;
  const matches = [...text.matchAll(regex)];
  const withAmount = matches.find((match) => match[2]);

  if (withAmount) {
    return { due_date: parseDate(withAmount[1]), amount_total: parseAmount(withAmount[2]) };
  }
  if (matches.length > 0) {
    return { due_date: parseDate(matches[0][1]), amount_total: null };
  }
  return { due_date: null, amount_total: null };
}

// "Totale documento" (spesso letto dall'OCR come "Totaledocumento" o con la T iniziale
// mancante) seguito, entro pochi caratteri, dall'importo.
function extractAmountTotalFallbackSdi(text: string): number | null {
  const match = text.match(/T?otale\s*documento[^\d]{0,20}([\d.,]+)/i);
  return match ? parseAmount(match[1]) : null;
}

// Riga con il tipo documento ("TD01 fattura ...") seguita da numero e data, entrambi
// spesso rumorosi via OCR: si estrae la prima riga contenente "fattura" e si isola la
// data (se riconoscibile) e il testo restante come numero documento, best-effort.
function extractInvoiceNumberAndDateSdi(text: string): { invoice_number: string | null; invoice_date: string | null } {
  const line = text.split(/\r?\n/).find((candidate) => /fattura/i.test(candidate));
  if (!line) return { invoice_number: null, invoice_date: null };

  const dateMatch = line.match(/(\d{1,2}[-./]\d{1,2}[-./]\d{2,4})/);
  const invoice_date = dateMatch ? parseDate(dateMatch[1]) : null;

  const fatturaIndex = line.toLowerCase().indexOf("fattura");
  let numberPart = fatturaIndex >= 0 ? line.slice(fatturaIndex + "fattura".length) : line;
  if (dateMatch) {
    const cutIndex = numberPart.indexOf(dateMatch[1]);
    if (cutIndex >= 0) numberPart = numberPart.slice(0, cutIndex);
  }

  const invoice_number = cleanText(numberPart.replace(/[|_[\]]/g, " ").replace(/\s+/g, " "));
  return { invoice_number, invoice_date };
}

// Aliquota IVA: cerca un numero seguito dal simbolo "%" (es. "22%"), l'unico pattern
// che si è dimostrato affidabile in questo layout — le tabelle di riepilogo IVA senza
// simbolo "%" sono troppo rumorose per essere lette in modo sicuro dopo l'OCR.
function extractVatRateSdi(text: string): number | null {
  const match = text.match(/\b(\d{1,2}(?:,\d{1,2})?)\s*%/);
  return match ? parseFloat(match[1].replace(",", ".")) : null;
}

function parseSdiFacsimile(text: string): Partial<InvoiceExtraction> {
  const denominazioni = extractPairedLabelValues(text, "Denominazione:");
  const vatNumbers = extractVatNumbersSdi(text);
  const { due_date, amount_total } = extractDueDateAndTotalSdi(text);
  const { invoice_number, invoice_date } = extractInvoiceNumberAndDateSdi(text);

  const issuer_name = denominazioni[0] ?? null;
  const counterparty_name = denominazioni[1] ?? null;

  let invoice_type: InvoiceExtraction["invoice_type"] = null;
  if (containsSimi(counterparty_name)) invoice_type = "purchase";
  else if (containsSimi(issuer_name)) invoice_type = "sale";

  // La P.IVA "controparte" (rispetto a SIMI) è quella del fornitore per una fattura di
  // acquisto, del cliente per una fattura di vendita; se non determinabile, quella del fornitore.
  const counterparty_vat_number = invoice_type === "sale" ? (vatNumbers[1] ?? vatNumbers[0] ?? null) : (vatNumbers[0] ?? vatNumbers[1] ?? null);

  return {
    invoice_number,
    invoice_type,
    invoice_date,
    due_date,
    issuer_name,
    counterparty_name,
    counterparty_vat_number,
    amount_total: amount_total ?? extractAmountTotalFallbackSdi(text),
    vat_rate: extractVatRateSdi(text),
  };
}

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
    currency: null,
    notes: null,
  };

  const isSdiFacsimile = SDI_FACSIMILE_MARKER.test(text);
  if (isSdiFacsimile) {
    Object.assign(result, parseSdiFacsimile(text));
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const currencyMatch = text.match(/\b(EUR|USD|GBP|CHF|CAD|AUD)\b|([€$£])/i);
  if (currencyMatch) result.currency = (currencyMatch[1] ?? (currencyMatch[2] === "€" ? "EUR" : currencyMatch[2] === "$" ? "USD" : "GBP")).toUpperCase();

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

    // Le etichette generiche "fornitore"/"cliente" in questa riga sono affidabili solo nel
    // formato "semplice" (Fornitore: X / Cliente: Y): nel facsimile SDI la stessa parola
    // compare tra parentesi nell'intestazione a due colonne e produrrebbe un match errato.
    if (!isSdiFacsimile && result.issuer_name === null && (match = line.match(ISSUER_LINE))) {
      result.issuer_name = cleanText(match[1]);
      continue;
    }

    if (!isSdiFacsimile && result.counterparty_name === null && (match = line.match(COUNTERPARTY_LINE))) {
      result.counterparty_name = cleanText(match[1]);
      continue;
    }

    if (result.amount_total === null && !/imponibile/i.test(line) && (match = line.match(AMOUNT_TOTAL_LINE))) {
      result.amount_total = parseAmount(match[1]);
      continue;
    }

    if (!isSdiFacsimile && result.counterparty_vat_number === null && (match = line.match(VAT_NUMBER_ANYWHERE))) {
      result.counterparty_vat_number = `${match[1] ?? ""}${match[2]}`.toUpperCase();
      continue;
    }
  }

  if (!isSdiFacsimile) {
    if (containsSimi(result.issuer_name)) {
      result.invoice_type = "sale";
    } else if (containsSimi(result.counterparty_name)) {
      result.invoice_type = "purchase";
    }
  }

  return result;
}

export async function extractInvoiceFromPdfAction(formData: FormData): Promise<ExtractInvoiceResult> {
  try { await requirePermission("invoice.create"); } catch (error) { return { success: false, error: publicError(error).message }; }
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
    let { text } = await extractText(pdf, { mergePages: true });
    let usedOcr = false;

    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      try {
        text = await withTimeout(ocrExtractText(pdf), OCR_TIMEOUT_MS, "OCR timeout");
        usedOcr = true;
      } catch (ocrError) {
        console.error("Errore OCR fattura PDF:", ocrError);
      }
    }

    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      return {
        success: false,
        error: usedOcr
          ? "Impossibile leggere il testo del PDF anche con OCR: compila i campi manualmente."
          : "Il PDF non contiene testo selezionabile (probabilmente una scansione): compila i campi manualmente.",
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
