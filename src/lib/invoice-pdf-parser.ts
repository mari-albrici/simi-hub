"use server";

import os from "os";
import { parseInvoiceText, type InvoiceExtraction } from "./invoice-text-parser";
export type { InvoiceExtraction } from "./invoice-text-parser";
export type ExtractInvoiceResult = { success: true; data: InvoiceExtraction } | { success: false; error: string };
import { requirePermission } from "@/lib/permissions";
import { publicError } from "@/lib/errors";
import { getDocumentProxy, extractText, renderPageAsImage } from "unpdf";
import { createWorker } from "tesseract.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIN_TEXT_LENGTH = 10;
const MAX_OCR_PAGES = 1;
const OCR_RENDER_SCALE = 2;
const OCR_TIMEOUT_MS = 45_000;

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
