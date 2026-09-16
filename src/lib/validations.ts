import { z } from "zod";
import { ALLOWED_EMAIL_DOMAINS } from "@/lib/constants";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Inserire un indirizzo email valido")
    .refine((value) => {
      const normalized = value.toLowerCase();
      return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
    }, "Email non autorizzata. Usare un indirizzo aziendale SIMI."),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
});

export const passwordResetSchema = z.object({
  email: z.string().trim().email("Inserire un indirizzo email valido"),
});

export const projectFormSchema = z.object({
  project_code: z.string().min(3, "Inserire un codice commessa valido"),
  name: z.string().min(2, "Inserire un nome commessa valido"),
  customer_id: z.string().optional(),
  status: z.string().optional(),
});

export const companyFormSchema = z.object({
  business_name: z.string().min(2, "Inserire una ragione sociale valida"),
  company_type: z.enum(["customer", "supplier", "both"]),
  vat_number: z.string().optional().or(z.literal("")),
});
