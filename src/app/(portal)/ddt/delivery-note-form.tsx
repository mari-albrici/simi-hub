import { CommercialForm } from "@/components/ui/commercial-form";
import type { CommercialOptions,CommercialRecord } from "@/lib/commercial";
export function DeliveryNoteForm({options,projectId,record,source}:{options:CommercialOptions;projectId?:string;record?:CommercialRecord;source?:CommercialRecord}){return <CommercialForm kind="delivery_note" options={options} projectId={projectId} record={record} source={source}/>;}
