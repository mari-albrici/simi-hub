"use server";

import { generateText, Output } from "ai";
import { z } from "zod";

// Modello AI Gateway usato per leggere i PDF delle fatture (supporta input file/PDF nativo).
const INVOICE_AI_MODEL = process.env.INVOICE_AI_MODEL || "google/gemini-3.5-flash";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const invoiceExtractionSchema = z.object({
  invoice_number: z.string().nullable(),
  invoice_type: z.enum(["purchase", "sale"]).nullable(),
  invoice_date: z.string().nullable(),
  due_date: z.string().nullable(),
  counterparty_name: z.string().nullable(),
  counterparty_vat_number: z.string().nullable(),
  issuer_name: z.string().nullable(),
  amount_net: z.number().nullable(),
  vat_rate: z.number().nullable(),
  vat_amount: z.number().nullable(),
  amount_total: z.number().nullable(),
  notes: z.string().nullable(),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

export type ExtractInvoiceResult =
  | { success: true; data: InvoiceExtraction }
  | { success: false; error: string };

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

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return {
      success: false,
      error: "Lettura automatica non configurata: imposta AI_GATEWAY_API_KEY nelle variabili d'ambiente.",
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const { output } = await generateText({
      model: INVOICE_AI_MODEL,
      output: Output.object({ schema: invoiceExtractionSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analizza il PDF di questa fattura ed estrai i dati richiesti dallo schema. " +
                "Usa il formato data YYYY-MM-DD. Se un campo non è presente nel documento, restituisci null anziché inventarlo. " +
                "'issuer_name' è l'azienda che ha emesso il documento (origine/mittente). " +
                "'counterparty_name' è l'intestatario/destinatario della fattura. " +
                "'invoice_type' è 'sale' se il documento è emesso da SIMI verso un cliente, 'purchase' se ricevuto da un fornitore terzo. " +
                "'vat_rate' è l'aliquota IVA in percentuale (es. 22 per il 22%).",
            },
            {
              type: "file",
              mediaType: "application/pdf",
              data: buffer,
              filename: file.name,
            },
          ],
        },
      ],
    });

    return { success: true, data: output };
  } catch (error) {
    console.error("Errore estrazione dati fattura PDF:", error);
    return {
      success: false,
      error: "Impossibile leggere automaticamente la fattura. Compila i campi manualmente.",
    };
  }
}
