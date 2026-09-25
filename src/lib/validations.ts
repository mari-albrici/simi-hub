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
  project_code: z
    .string()
    .trim()
    .min(3)
    .max(80),

  name: z
    .string()
    .trim()
    .min(2)
    .max(250),

  description: optionalText,
  notes: optionalText,

  customer_id: nullableUuid,
  customer_contact_id: nullableUuid,
  project_manager_id: nullableUuid,
  legal_entity_id: nullableUuid,

  country: optionalText,
  city: optionalText,

  // Dati P.A.
  cig: optionalText,
  cup: optionalText,

  status: projectStatusSchema,

  opening_date: optionalDate,
  planned_start_date: optionalDate,
  actual_start_date: optionalDate,
  expected_closing_date: optionalDate,
  closing_date: optionalDate,
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

export const guideChecklistItemSchema = z.object({
  label: z.string().trim().min(1).max(500),
  description: z.preprocess(
    (v) => (v === undefined || v === null ? "" : v),
    z.string().trim().max(2000),
  ),
});

export const guideFormSchema = z.object({
  title: z.string().trim().min(2).max(250),

  summary: z.preprocess(
    (v) => (v === undefined || v === null ? "" : v),
    z.string().trim().max(1000),
  ),

  content: z.preprocess(
    (v) => (v === undefined || v === null ? "" : v),
    z.string().trim().max(50000),
  ),

  category_id: nullableUuid,

  status: z.enum([
    "draft",
    "published",
  ]),

  is_important: z.boolean(),

  checklist: z
    .array(guideChecklistItemSchema)
    .max(200),
});
export const managementAllocationSchema = z.object({
  id: uuidSchema.optional(),
  invoice_id: uuidSchema,
  project_id: uuidSchema,
  cost_category_id: nullableUuid,
  allocated_amount: amount.refine(value => value > 0, "L'importo deve essere positivo"),
  allocation_method: z.enum(["direct", "manual"]),
  notes: z.string().trim().max(2000).nullable(),
});

export const costEntryAllocationSchema = managementAllocationSchema.omit({ id: true, invoice_id: true });

export const manualCostEntrySchema = z.object({
  cost_date: dateSchema,
  description: z.string().trim().min(1).max(2000),
  amount: amount.refine(value => value !== 0, "L'importo deve essere diverso da zero"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Valuta non valida"),
  cost_category_id: nullableUuid,
  cost_center_id: nullableUuid,
  cost_pool_id: nullableUuid,
  legal_entity_id: nullableUuid,
  supplier_id: nullableUuid,
  notes: optionalText,
});

export const costEntryClassificationSchema = z.object({
  cost_category_id: nullableUuid,
  cost_center_id: nullableUuid,
  cost_pool_id: nullableUuid,
  notes: optionalText,
});

export const managementCostPoolSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  cost_center_id: uuidSchema,
  period_start: dateSchema,
  period_end: dateSchema,
  driver_type: z.enum(["labor_hours", "worker_days"]),
  planned_driver_quantity: amount.refine(value => value >= 0, "La quantità non può essere negativa").nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  status: z.enum(["draft", "active", "closed"]),
  notes: optionalText,
}).refine(value => value.period_end >= value.period_start, { path: ["period_end"], message: "La fine del periodo deve seguire l'inizio" });

export const managementPoolDriverSchema = z.object({
  pool_id: uuidSchema,
  project_id: uuidSchema,
  driver_quantity: amount.refine(value => value >= 0, "La quantità non può essere negativa"),
  notes: optionalText,
});

const assetValue = amount.refine(value => value >= 0, "Il valore non può essere negativo").nullable();
const assetRate = z.number().finite().min(0).max(99999999.999999)
  .refine(value => Number(value.toFixed(6)) === value, "Massimo sei decimali").nullable();
export const managementAssetSchema = z.object({
  asset_code: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200),
  description: optionalText,
  category: z.enum(["welding", "generators", "lifting", "instrumentation", "machinery", "special_equipment", "other"]),
  purchase_date: optionalDate, purchase_cost: assetValue, management_value: assetValue,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  allocation_method: z.enum(["hourly", "daily", "monthly", "manual"]),
  hourly_rate: assetRate, daily_rate: assetRate, monthly_rate: assetRate,
  status: z.enum(["available", "in_use", "maintenance", "retired"]), notes: optionalText,
}).superRefine((value, ctx) => {
  if (value.allocation_method !== "manual" && value[`${value.allocation_method}_rate`] === null) {
    ctx.addIssue({ code: "custom", path: [`${value.allocation_method}_rate`], message: "Indicare la tariffa del metodo scelto" });
  }
});
export const managementAssetMovementSchema = z.object({
  asset_id: uuidSchema, to_project_id: nullableUuid, movement_date: dateSchema, notes: optionalText,
});
export const managementAssetUsageSchema = z.object({
  asset_id: uuidSchema, project_id: uuidSchema, start_date: dateSchema, end_date: optionalDate,
  usage_quantity: assetValue, manual_amount: assetValue,
  status: z.enum(["active", "closed"]), notes: optionalText,
}).refine(value => !value.end_date || value.end_date >= value.start_date,
  { path: ["end_date"], message: "La fine deve seguire l'inizio" });

export const managementContainerSchema = z.object({
  container_code: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200),
  description: optionalText, ownership_type: z.enum(["owned", "rented", "third_party"]),
  purchase_date: optionalDate, purchase_cost: assetValue,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  status: z.enum(["available", "in_use", "maintenance", "retired"]), notes: optionalText,
});
export const managementContainerMovementSchema = z.object({
  container_id: uuidSchema, to_project_id: nullableUuid, movement_date: dateSchema,
  transport_cost: assetValue, currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), notes: optionalText,
});
export const managementContainerAssetSchema = z.object({
  container_id: uuidSchema, asset_id: uuidSchema, date_in: dateSchema, notes: optionalText,
});
export const managementContainerAssetRemovalSchema = z.object({ id: uuidSchema, date_out: dateSchema });

export const projectManagementBudgetSchema = z.object({
  name: z.string().trim().min(1).max(200), valid_from: optionalDate,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), notes: optionalText,
});
export const projectManagementBudgetLineSchema = z.object({
  budget_id: uuidSchema, cost_category_id: uuidSchema, description: optionalText,
  amount: amount.refine(value => value >= 0, "Il budget non può essere negativo"), notes: optionalText,
});
export const projectManagementForecastSchema = projectManagementBudgetSchema.omit({ valid_from: true }).extend({ forecast_date: dateSchema });
export const projectManagementForecastLineSchema = z.object({
  forecast_id: uuidSchema, cost_category_id: uuidSchema,
  cost_to_complete: amount.refine(value => value >= 0, "Il costo a finire non può essere negativo"), notes: optionalText,
});

export const employeeManagementRateSchema = z.object({
  employee_id: uuidSchema, valid_from: dateSchema, valid_to: optionalDate,
  hourly_cost: assetRate.unwrap(), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), notes: optionalText,
}).refine(value => !value.valid_to || value.valid_to >= value.valid_from, { path: ["valid_to"], message: "La fine deve seguire l'inizio" });
export const projectLaborEntrySchema = z.object({
  employee_id: uuidSchema, project_id: uuidSchema, work_date: dateSchema,
  hours: amount.refine(value => value > 0 && value <= 999999.99, "Ore non valide"),
  hour_type: z.enum(["ordinary", "overtime", "travel", "other"]), notes: optionalText,
});

export const managementConsumableItemSchema = z.object({
  item_code: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(200), description: optionalText,
  category: optionalText, unit: z.enum(["pcs", "kg", "m", "l", "box", "pack", "other"]),
  default_unit_cost: assetRate, currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), is_active: z.boolean(), notes: optionalText,
});
export const managementConsumableMovementSchema = z.object({
  item_id: uuidSchema, movement_type: z.enum(["load", "transfer", "consumption", "adjustment"]),
  from_container_id: nullableUuid, to_container_id: nullableUuid, project_id: nullableUuid,
  quantity: z.number().finite().positive().max(99999999999.999).refine(value => Number(value.toFixed(3)) === value, "Massimo tre decimali"),
  unit_cost: assetRate, movement_date: dateSchema, notes: optionalText,
}).superRefine((v, ctx) => {
  const valid = v.movement_type === "load" ? !v.from_container_id && !!v.to_container_id && !v.project_id && v.unit_cost !== null
    : v.movement_type === "transfer" ? !!v.from_container_id && !!v.to_container_id && v.from_container_id !== v.to_container_id && !v.project_id
    : v.movement_type === "consumption" ? !!v.from_container_id && !v.to_container_id && !!v.project_id
    : Boolean(v.from_container_id) !== Boolean(v.to_container_id) && !v.project_id && !!v.notes.trim();
  if (!valid) ctx.addIssue({ code: "custom", message: "Specificare destinazioni, costo o motivazione coerenti con il movimento" });
});
