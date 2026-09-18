import { CommercialForm } from "@/components/ui/commercial-form";
import type { CommercialOptions,CommercialRecord } from "@/lib/commercial";
export function OrderForm({options,projectId,record}:{options:CommercialOptions;projectId?:string;record?:CommercialRecord}){return <CommercialForm kind="order" options={options} projectId={projectId} record={record}/>;}
