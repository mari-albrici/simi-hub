import { invoiceLineAmounts, invoiceHeaderVat } from "./invoice-calculations";
import { z } from "zod";
import { cents } from "./money";

export const uuidSchema = z.uuid();
export const nullableUuid = z.preprocess(v => v === "" || v === undefined ? null : v, uuidSchema.nullable());
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01";
}, "Data non valida");
export const optionalDate = z.preprocess(v => v === "" || v === undefined ? null : v, dateSchema.nullable());
const text = z.string().trim().max(2000);
const optionalText = z.preprocess(v => v === undefined || v === null ? "" : v, text);
const email = z.union([z.email(), z.literal("")]);
const amount = z.number().finite().min(-999999999999.99).max(999999999999.99).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, "Massimo due decimali");
const rate = z.number().finite().min(0).max(100).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, "Massimo due decimali").nullable();
export const invoiceStatusSchema = z.enum(["received", "to_check", "to_register", "registered", "to_pay", "scheduled", "paid", "anomaly", "archived"]);
export const projectStatusSchema = z.enum(["draft", "active", "suspended", "completed", "closed", "archived"]);
export const invoiceLineSchema = z.object({
  id: uuidSchema.optional(), project_id: nullableUuid, unit: optionalText, discount: z.number().finite().min(-100).max(100).refine(n=>Math.abs(n*10000-Math.round(n*10000))<0.0001,"Massimo quattro decimali").default(0), notes: optionalText,
  description: z.string().trim().min(1).max(2000), quantity: z.number().finite().min(-1e9).max(1e9).refine(n => Math.abs(n*1000-Math.round(n*1000))<0.0001, "Massimo tre decimali"),
  unit_price: z.number().finite().min(-1e9).max(1e9).refine(n => Math.abs(n*10000-Math.round(n*10000))<0.0001, "Massimo quattro decimali"), vat_rate: rate,
  vat_exempt_reason: z.string().trim().max(500).nullable(),
  amount_net: amount, amount_vat: amount, amount_total: amount,
}).superRefine((v, ctx) => {
  const {net,vat} = invoiceLineAmounts(v);
  if (v.vat_rate === null && !v.vat_exempt_reason) ctx.addIssue({ code: "custom", message: "Indicare aliquota o trattamento IVA" });
  if (cents(v.amount_net) !== cents(net) || cents(v.amount_vat) !== cents(vat) || cents(v.amount_total) !== cents(net + vat)) ctx.addIssue({ code: "custom", message: "Importi riga incoerenti" });
});
export const installmentSchema = z.object({ id: uuidSchema.optional(), due_date: dateSchema, amount: amount.refine(n => n !== 0), paid: z.boolean() });
export const companyFormSchema = z.object({
  esolver_code: z.preprocess(v => v === undefined || v === null || v === "" ? null : v, z.string().trim().max(120).nullable()),
  company_type: z.enum(["customer", "supplier", "both"]), business_name: z.string().trim().min(2).max(250),
  vat_number: optionalText.refine(v => !v || /^[\p{L}\p{N} .\/-]{2,40}$/u.test(v), "Identificativo fiscale non valido"),
  country: optionalText, city: optionalText, address: optionalText,
  email: email.default(""), phone: optionalText,
  iban: optionalText.transform(v => v.replace(/\s/g, "").toUpperCase()).refine(v => {
    if (!v) return true;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
    const rearranged = v.slice(4) + v.slice(0, 4);
    let remainder = 0;
    for (const char of rearranged) for (const digit of /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char) remainder = (remainder * 10 + Number(digit)) % 97;
    return remainder === 1;
  }, "IBAN non valido"),
});
export const projectFormSchema = z.object({
  project_code: z.string().trim().min(3).max(80), name: z.string().trim().min(2).max(250),
  description: optionalText, notes: optionalText, customer_id: nullableUuid, customer_contact_id: nullableUuid,
  project_manager_id: nullableUuid, legal_entity_id: nullableUuid,
  country: optionalText, city: optionalText, status: projectStatusSchema, opening_date: optionalDate,
  planned_start_date: optionalDate, actual_start_date: optionalDate, expected_closing_date: optionalDate, closing_date: optionalDate,
});
export const invoiceSchema = z.object({
  id: uuidSchema.optional(), expected_updated_at: z.iso.datetime({ offset: true }).optional(), document_id: nullableUuid,
  esolver_registration_number: optionalText.refine(v=>v.length<=120,"Massimo 120 caratteri"),
  invoice_type: z.enum(["purchase", "sale"]), invoice_number: z.string().trim().min(1).max(120),
  legal_entity_id: uuidSchema, counterparty_id: nullableUuid,
  new_counterparty: companyFormSchema.nullable(), invoice_date: optionalDate, received_date: optionalDate, registration_date: optionalDate, due_date: optionalDate,
  currency: z.string().regex(/^[A-Z]{3}$/).default("EUR"), vat_treatment: optionalText,
  status: invoiceStatusSchema, amount_net: amount, vat_amount: amount, amount_total: amount,
  vat_rate: rate, vat_exempt_reason: z.string().trim().max(500).nullable(),
  payment_method: z.enum(["bank_transfer", "sepa_direct_debit", "credit_card", "check", "cash", "other"]).nullable(),
  notes: optionalText, project_ids: z.array(uuidSchema).max(500),
  lines: z.array(invoiceLineSchema).max(1000), installments: z.array(installmentSchema).max(500),
}).superRefine((v, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!v.counterparty_id && !v.new_counterparty) issue("Selezionare una controparte");
  if (v.counterparty_id && v.new_counterparty) issue("Selezionare una sola controparte");
  if (v.id && !v.expected_updated_at) issue("Versione fattura mancante: ricaricare");
  if (cents(v.amount_total) !== cents(v.amount_net) + cents(v.vat_amount)) issue("Totale diverso da imponibile + IVA");
  if (v.lines.length) {
    for (const [header, field] of [[v.amount_net, "amount_net"], [v.vat_amount, "amount_vat"], [v.amount_total, "amount_total"]] as const)
      if (cents(header) !== v.lines.reduce((n, line) => n + cents(line[field]), 0)) issue("Totali delle righe incoerenti con la fattura");
  } else if (v.vat_exempt_reason && v.vat_amount !== 0) issue("Una fattura esente non può avere IVA");
  else if (v.vat_rate !== null && cents(v.vat_amount) !== cents(invoiceHeaderVat(v.amount_net,v.vat_rate))) issue("IVA incoerente con aliquota e imponibile");
  if (v.installments.length && v.installments.reduce((n, i) => n + cents(i.amount), 0) !== cents(v.amount_total)) issue("Somma rate diversa dal totale fattura");
  if(v.installments.some(i=>Math.sign(i.amount)!==Math.sign(v.amount_total))) issue("Il segno delle rate deve coincidere con il totale fattura");
  for (const rows of [v.lines, v.installments]) {
    const ids = rows.flatMap(r => r.id ? [r.id] : []);
    if (new Set(ids).size !== ids.length) issue("Identificativi dettaglio duplicati");
  }
  if (new Set(v.project_ids).size !== v.project_ids.length) issue("Commesse duplicate");
  if (v.lines.some(l => l.project_id && !v.project_ids.includes(l.project_id))) issue("La commessa della riga deve essere collegata alla fattura");
});
export const loginSchema = z.object({ email: z.email().transform(v => v.trim().toLowerCase()), password: z.string().min(8) });
export const documentMetadataSchema = z.object({ id: uuidSchema, title: z.string().trim().max(500), expiry_date: optionalDate });
export const legalEntitySchema = z.object({
  code: z.string().trim().min(2).max(40), business_name: z.string().trim().min(2).max(250), country: optionalText,
  vat_number: optionalText, tax_code: optionalText, address: optionalText, city: optionalText, email: email.default(""), phone: optionalText,
});
