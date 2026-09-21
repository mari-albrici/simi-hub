import { authorizedClient } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { projectRequirementAction } from "@/lib/work/actions";
import { SubmitButton } from "@/components/ui/submit-button";
export async function InvoiceProjectRequirement({id,canUpdate}:{id:string;canUpdate:boolean}){
 const db=await authorizedClient("invoice.read"),r=await db.from("invoices").select("project_required").eq("id",id).single();checkDatabase(r.error);
 return canUpdate?<form action={projectRequirementAction} className="d-flex gap-3 align-items-center mb-3"><input type="hidden" name="id" value={id}/><label className="form-check mb-0"><input type="checkbox" className="form-check-input" name="required" value="1" defaultChecked={r.data?.project_required}/>Commessa richiesta per questa fattura</label><SubmitButton className="btn btn-sm btn-outline-secondary" pendingLabel="Salvataggio…">Salva requisito</SubmitButton></form>:null;
}
