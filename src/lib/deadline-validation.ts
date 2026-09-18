import { z } from "zod";
const optionalId = z.union([z.uuid(), z.literal("")]).nullable().transform(v => v || null);
export const manualDeadlineSchema = z.object({
 title: z.string().trim().min(1).max(300), description: z.string().max(10000),
 due_date: z.iso.date(), due_time: z.union([z.iso.time(),z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),z.literal("")]).transform(v=>v||null),
 legal_entity_id: z.uuid(), category_code: z.string().min(1).max(80), priority: z.enum(["critical","high","medium","low"]),
 project_id: optionalId,company_id: optionalId,document_id: optionalId,assigned_to: optionalId,
 notes:z.string().max(10000),status:z.enum(["open","completed"]),
});
export const deadlineFilterSchema=z.object({
 q:z.string().max(200).default(""),period:z.enum(["all","today","7","30","overdue"]).default("all"),
 from:z.union([z.iso.date(),z.literal("")]).default(""),to:z.union([z.iso.date(),z.literal("")]).default(""),
 entity:optionalId.optional(),company:optionalId.optional(),project:optionalId.optional(),assigned:optionalId.optional(),
 kind:z.enum(["","payment","receipt","manual","document"]).default(""),category:z.string().max(80).default(""),
 status:z.enum(["","open","future","soon","today","overdue","completed"]).default(""),priority:z.enum(["","critical","high","medium","low"]).default(""),
 mine:z.enum(["","1"]).default(""), archived:z.enum(["","1"]).default(""),page:z.coerce.number().int().min(1).max(100000).default(1),
 view:z.enum(["list","calendar"]).default("list"),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});
export const temporalLabels: Record<string,string>={future:"Futura",soon:"Prossima",today:"Oggi",overdue:"Scaduta",completed:"Completata"};
export const priorityLabels: Record<string,string>={critical:"Critica",high:"Alta",medium:"Media",low:"Bassa"};
