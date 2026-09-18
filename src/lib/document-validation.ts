import { z } from "zod";
const optionalId=z.union([z.uuid(),z.literal("")]).nullish().transform(v=>v||null);
const optionalDate=z.union([z.iso.date(),z.literal("")]).nullish().transform(v=>v||null);
export const documentFormSchema=z.object({
 title:z.string().trim().min(1).max(500),description:z.string().max(10000).default(""),reference:z.string().max(250).default(""),
 category_id:optionalId,document_date:optionalDate,expiry_date:optionalDate,legal_entity_id:z.uuid(),
 country:z.string().max(80).default(""),language:z.string().max(80).default(""),notes:z.string().max(10000).default(""),assigned_to:optionalId,
 access_scope:z.enum(["general","restricted","hr"]).default("general"),status:z.enum(["draft","valid","superseded"]).default("valid"),
 expected_updated_at:z.iso.datetime({offset:true}).optional(),
});
export const documentContextSchema=z.object({project:optionalId,company:optionalId,invoice:optionalId});
export const documentFilterSchema=z.object({
 q:z.string().max(200).default(""),category:optionalId,entity:optionalId,project:optionalId,company:optionalId,invoice:optionalId,
 country:z.string().max(80).default(""),status:z.enum(["","draft","valid","expiring","expired","superseded","archived"]).default(""),
 expiry:z.enum(["","none","overdue","30"]).default(""),from:optionalDate,to:optionalDate,
 sort:z.enum(["title","document_date","expiry_date","created_at","reference"]).default("created_at"),direction:z.enum(["asc","desc"]).default("desc"),
 page:z.coerce.number().int().min(1).max(100000).default(1),
});
export const documentStatusLabels:Record<string,string>={draft:"Bozza",valid:"Valido",expiring:"In scadenza",expired:"Scaduto",superseded:"Sostituito",archived:"Archiviato"};
