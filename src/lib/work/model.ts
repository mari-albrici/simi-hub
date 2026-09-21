import { z } from "zod";
import { dateSchema } from "@/lib/validations";

export const sourceKinds = ["project","invoice","movement","document","order","delivery_note","offer","contract","company","employee","deadline","installment"] as const;
export type SourceKind = typeof sourceKinds[number];
export const sourceLabels: Record<SourceKind,string> = {project:"Commessa",invoice:"Fattura",movement:"Pagamento / Incasso",document:"Documento",order:"Ordine",delivery_note:"DDT",offer:"Offerta",contract:"Contratto",company:"Cliente / Fornitore",employee:"Dipendente (HR)",deadline:"Scadenza manuale",installment:"Rata / Scadenza fattura"};
export const taskStates = ["todo","in_progress","completed","cancelled"] as const;
export const priorities = ["low","medium","high","urgent"] as const;
export type LinkedRecord = {kind:SourceKind;id:string;label:string;href:string;entityId:string|null};
export type Registry = {id:string} & Partial<Record<`${SourceKind}_id`,string|null>>;
export type Task = {id:string;legal_entity_id:string;title:string;description:string|null;notes:string|null;status:typeof taskStates[number];priority:typeof priorities[number];assigned_to:string|null;created_by:string;created_at:string;updated_at:string;due_date:string|null;completed_at:string|null;archived_at:string|null;origin:string;anomaly_id:string|null;revision:number;task_records:{work_records:Registry}[];links:LinkedRecord[]};
export type Anomaly = {id:string;record_id:string;code:string;title:string;description:string|null;severity:"info"|"warning"|"critical";status:"open"|"resolved"|"ignored";assigned_to:string|null;reason:string|null;detected_at:string;last_detected_at:string;resolved_at:string|null;due_date:string|null;work_records:Registry;link:LinkedRecord|null};
const nullableId=z.preprocess(v=>v===""?null:v,z.string().uuid().nullable());
export const taskSchema=z.object({id:nullableId,revision:z.coerce.number().int().nonnegative(),legal_entity_id:z.string().uuid(),title:z.string().trim().min(1).max(240),description:z.string().max(10000),notes:z.string().max(10000),status:z.enum(taskStates),priority:z.enum(priorities),assigned_to:nullableId,due_date:z.preprocess(v=>v===""?null:v,dateSchema.nullable()),anomaly_id:nullableId,records:z.array(z.object({kind:z.enum(sourceKinds),id:z.string().uuid()})).max(50)});
export function anomalyPriority(severity:Anomaly["severity"]){return severity==="critical"?"urgent":severity==="warning"?"high":"medium";}
export function registrySource(record:Registry){for(const kind of sourceKinds){const id=record[`${kind}_id`];if(id)return {kind,id};}return null;}
export type WorkFilters=Record<string,string|undefined>;
export function pageNumber(value?:string){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:1;}
