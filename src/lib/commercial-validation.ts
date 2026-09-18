import { z } from "zod";
const optionalId=z.union([z.uuid(),z.literal("")]).nullish().transform(v=>v||null);
const text=z.string().max(10000).nullish().transform(v=>v||"");
const quantity=z.coerce.number().finite().positive().max(99999999999).refine(v=>Math.abs(v*1000-Math.round(v*1000))<0.00001,"Massimo tre decimali");
const line=z.object({id:optionalId,position:z.number().int().nonnegative(),description:z.string().trim().min(1).max(2000),quantity,unit:text,project_id:optionalId,notes:text});
const base={id:optionalId,expected_updated_at:z.string().nullish(),legal_entity_id:z.uuid(),counterparty_id:optionalId,notes:text};
export const orderFormSchema=z.object({...base,counterparty_id:z.uuid(),order_number:z.string().trim().min(1).max(150),order_type:z.enum(["purchase","sale"]),order_date:z.iso.date(),counterparty_reference:text,currency:z.string().regex(/^[A-Z]{3}$/),status:z.enum(["draft","confirmed","cancelled","partially_fulfilled","fulfilled"]),subject:text,description:text,project_ids:z.array(z.uuid()),lines:z.array(line.extend({unit_price:z.coerce.number().finite().nonnegative(),discount:z.coerce.number().finite().nonnegative(),vat_rate:z.coerce.number().min(0).max(100)}).refine(l=>l.discount<=l.quantity*l.unit_price,"Sconto superiore all'importo riga")).min(1).max(500)});
export const deliveryFormSchema=z.object({...base,note_number:z.string().trim().min(1).max(150),note_date:z.iso.date(),direction:z.enum(["inbound","outbound"]),sender_id:optionalId,recipient_id:optionalId,departure_place:text,destination_place:text,transport_reason:text,carrier:text,order_ids:z.array(z.uuid()),lines:z.array(line.extend({order_line_id:optionalId})).min(1).max(500)});
export type CommercialKind="order"|"delivery_note";
export const commercialKind=z.enum(["order","delivery_note"]);
export const commercialLabels:Record<string,string>={draft:"Bozza",confirmed:"Confermato / non evaso",partially_fulfilled:"Parzialmente evaso",fulfilled:"Evaso",overdelivered:"Sovraconsegna",cancelled:"Annullato",purchase:"Acquisto",sale:"Vendita",inbound:"Entrata",outbound:"Uscita"};
export function commercialPath(kind:CommercialKind){return kind==="order"?"/ordini":"/ddt";}
