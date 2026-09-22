"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizedClient } from "@/lib/permissions";
import { AppError,checkDatabase,publicError } from "@/lib/errors";
import { documentFormSchema,documentContextSchema } from "@/lib/document-validation";
import {
  documentHash,
  validateDocumentFile,
  normalizedDocumentName,
} from "@/lib/files";
import { findDocumentDuplicates,getArchiveDocument } from "@/lib/documents";
import { uploadDocumentFile } from "@/lib/document-upload-workflow";
import { z } from "zod";
export type UploadState={error?:string;duplicates?:{id:string;title:string;where:string;archived:boolean}[]};
function refreshDocuments(){revalidatePath("/ordini","layout");revalidatePath("/ddt","layout");revalidatePath("/documenti","layout");revalidatePath("/scadenze","layout");revalidatePath("/dashboard");revalidatePath("/commesse","layout");revalidatePath("/clienti","layout");revalidatePath("/fornitori","layout");revalidatePath("/fatture","layout");}
export async function reserveDocumentUploadAction(input: {
  form: Record<string, string>;
  file: {
    name: string;
    type: string;
    size: number;
    hash: string;
  };
}) {
  try {
    const db = await authorizedClient("document.upload");

    const form = new FormData();

    for (const [key, value] of Object.entries(input.form)) {
      form.set(key, value);
    }

    const context = documentContextSchema.parse(Object.fromEntries(form));

    const cycle = {
      order: form.get("order")
        ? z.uuid().parse(form.get("order"))
        : null,
      delivery_note: form.get("delivery_note")
        ? z.uuid().parse(form.get("delivery_note"))
        : null,
      employee: form.get("employee")
        ? z.uuid().parse(form.get("employee"))
        : null,
    };

    const pipeline = {
      offer: form.get("offer")
        ? z.uuid().parse(form.get("offer"))
        : null,
      contract: form.get("contract")
        ? z.uuid().parse(form.get("contract"))
        : null,
    };

    const docId = form.get("document_id")
      ? z.uuid().parse(form.get("document_id"))
      : undefined;

    const metadata = docId
      ? await getArchiveDocument(docId)
      : documentFormSchema.parse(Object.fromEntries(form));

    if (!metadata) {
      throw new AppError("validation", "Documento non disponibile.");
    }

    /*
     * Il browser ci passa l'hash SHA-256.
     * Il file vero e proprio NON arriva a questa Server Action.
     */
    const duplicates = await findDocumentDuplicates(input.file.hash);

    if (
      duplicates.length &&
      form.get("acknowledge_duplicate") !== "1"
    ) {
      return {
        ok: false as const,
        duplicates: duplicates.map((d) => ({
          id: d.id,
          title: d.title || d.original_filename,
          where: [
            d.entity_name,
            ...d.projects.map((x) => x.label),
            ...d.companies.map((x) => x.label),
            ...d.invoices.map((x) => x.label),
          ]
            .filter(Boolean)
            .join(" · "),
          archived: !!d.archived_at,
        })),
      };
    }

    let typeName = "Documento";

    if (metadata.category_id) {
      const category = await db
        .from("document_categories")
        .select("name")
        .eq("id", metadata.category_id)
        .single();

      checkDatabase(category.error);

      typeName = category.data?.name || typeName;
    }

    const normalized = normalizedDocumentName(
      String(
        metadata.document_date ||
          new Date().toISOString().slice(0, 10),
      ),
      typeName,
      String(metadata.title || input.file.name),
      input.file.name,
    );

    /*
     * Prenotiamo documento/versione nello stesso modo del workflow
     * precedente, ma senza caricare il file attraverso Vercel.
     */
    const reserve = await db.rpc("reserve_document_upload", {
      filename: input.file.name,
      mime: input.file.type,
      bytes: input.file.size,
      hash: input.file.hash,
      normalized,
      payload: metadata,
      doc: docId || null,
      version_label: String(form.get("version_label") || "") || null,
      version_notes: String(form.get("version_notes") || "") || null,
    });

    checkDatabase(reserve.error, "Prenotazione documento");

    const row = reserve.data?.[0];

    if (!row) {
      throw new AppError(
        "database",
        "Prenotazione non confermata.",
      );
    }

    /*
     * Manteniamo gli stessi collegamenti che prima venivano creati
     * dentro uploadDocumentFile().
     */
    if (
      !docId &&
      (context.project || context.company || context.invoice)
    ) {
      const linked = await db.rpc("link_document_context", {
        doc: row.document_id,
        project: context.project || null,
        company: context.company || null,
        invoice: context.invoice || null,
      });

      if (linked.error) {
        await db.rpc("fail_document_version", {
          version: row.version_id,
        });

        checkDatabase(
          linked.error,
          "Collegamenti documento",
        );
      }
    }

    if (!docId) {
      for (const kind of ["order", "delivery_note"] as const) {
        const recordId = cycle[kind];

        if (recordId) {
          const linked = await db.rpc(
            "link_commercial_document",
            {
              doc: row.document_id,
              kind,
              record_id: recordId,
            },
          );

          if (linked.error) {
            await db.rpc("fail_document_version", {
              version: row.version_id,
            });

            checkDatabase(
              linked.error,
              "Collegamento ordine/DDT",
            );
          }
        }
      }
    }

    if (!docId && pipeline.offer) {
      const linked = await db.rpc("link_offer_document", {
        doc: row.document_id,
        offer: pipeline.offer,
      });

      checkDatabase(linked.error, "Collegamento offerta");
    }

    if (!docId && pipeline.contract) {
      const linked = await db.rpc("link_contract_document", {
        doc: row.document_id,
        contract: pipeline.contract,
      });

      checkDatabase(linked.error, "Collegamento contratto");
    }

    if (!docId && cycle.employee) {
      const linked = await db.rpc("link_employee_document", {
        doc: row.document_id,
        employee: cycle.employee,
      });

      checkDatabase(linked.error, "Collegamento dipendente");
    }

    return {
      ok: true as const,
      documentId: String(row.document_id),
      versionId: String(row.version_id),
      storagePath: String(row.storage_path),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: publicError(error).message,
    };
  }
}

export async function finalizeDirectDocumentUploadAction(input: {
  documentId: string;
  versionId: string;
  acknowledgeDuplicate: boolean;
}) {
  try {
    const db = await authorizedClient("document.upload");

    const documentId = z.uuid().parse(input.documentId);
    const versionId = z.uuid().parse(input.versionId);

    /*
     * Importantissimo: non ci fidiamo semplicemente del versionId
     * ricevuto dal browser.
     */
    const version = await db
      .from("document_versions")
      .select("id, document_id")
      .eq("id", versionId)
      .eq("document_id", documentId)
      .single();

    checkDatabase(
      version.error,
      "Verifica versione documento",
    );

    const finalized = await db.rpc(
      "finalize_document_version",
      {
        version: versionId,
        acknowledge_duplicate:
          input.acknowledgeDuplicate,
      },
    );

    checkDatabase(
      finalized.error,
      "Finalizzazione documento",
    );

    refreshDocuments();

    return {
      ok: true as const,
      documentId,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: publicError(error).message,
    };
  }
}

export async function uploadDocumentAction(_previous:UploadState,form:FormData):Promise<UploadState>{
 let target="";
 try{
 const db=await authorizedClient("document.upload"),context=documentContextSchema.parse(Object.fromEntries(form));
 const cycle={order:form.get("order")?z.uuid().parse(form.get("order")):null,delivery_note:form.get("delivery_note")?z.uuid().parse(form.get("delivery_note")):null,employee:form.get("employee")?z.uuid().parse(form.get("employee")):null};
 const pipeline={offer:form.get("offer")?z.uuid().parse(form.get("offer")):null,contract:form.get("contract")?z.uuid().parse(form.get("contract")):null};
 const docId=form.get("document_id")?z.uuid().parse(form.get("document_id")):undefined;
 const metadata=docId?await getArchiveDocument(docId):documentFormSchema.parse(Object.fromEntries(form));
 if(!metadata)throw new AppError("validation","Documento non disponibile.");
 if(form.get("intent")?.toString().startsWith("reuse:")){
 if(docId)throw new AppError("validation","Per una versione usa il caricamento con conferma.");
 target=z.uuid().parse(String(form.get("intent")).slice(6));
 const result=await db.rpc("link_document_context",{doc:target,...context});checkDatabase(result.error,"Collegamento documento esistente");
 for(const kind of ["order","delivery_note"] as const){if(cycle[kind]){const linked=await db.rpc("link_commercial_document",{doc:target,kind,record_id:cycle[kind]});checkDatabase(linked.error);}}
 for(const kind of ["offer","contract"] as const){if(pipeline[kind]){const linked=await db.rpc(kind==="offer"?"link_offer_document":"link_contract_document",{doc:target,[kind]:pipeline[kind]});checkDatabase(linked.error);}}
 if(cycle.employee){const linked=await db.rpc("link_employee_document",{doc:target,employee:cycle.employee});checkDatabase(linked.error,"Collegamento dipendente");}
 }else{
 const file=form.get("file");if(!(file instanceof File))throw new AppError("validation","Seleziona un file.");await validateDocumentFile(file);
 const duplicates=await findDocumentDuplicates(await documentHash(file));
 if(duplicates.length&&form.get("acknowledge_duplicate")!=="1")return {duplicates:duplicates.map(d=>({id:d.id,title:d.title||d.original_filename,where:[d.entity_name,...d.projects.map(x=>x.label),...d.companies.map(x=>x.label),...d.invoices.map(x=>x.label)].filter(Boolean).join(" · "),archived:!!d.archived_at}))};
 let typeName="Documento";if(metadata.category_id){const c=await db.from("document_categories").select("name").eq("id",metadata.category_id).single();checkDatabase(c.error);typeName=c.data?.name||typeName;}
 const result=await uploadDocumentFile(db,file,{...metadata},{documentId:docId,label:String(form.get("version_label")||""),notes:String(form.get("version_notes")||""),acknowledgeDuplicate:form.get("acknowledge_duplicate")==="1",typeName,...context,...cycle,...pipeline});target=result.documentId;
 }
 }catch(e){return {error:publicError(e).message};}
 refreshDocuments();redirect(`/documenti/${target}?success=Documento%20salvato`);
}
async function mutateDocument(form:FormData,work:(id:string)=>Promise<void>){
 let id="";try{id=z.uuid().parse(form.get("id"));await work(id);}catch(e){redirect(`/documenti?error=${encodeURIComponent(publicError(e).message)}`);}
 refreshDocuments();redirect(`/documenti/${id}?success=Operazione%20completata`);
}
export async function updateDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.update");const schema=form.get("intent")==="notes"?documentFormSchema.pick({notes:true,expected_updated_at:true}):documentFormSchema;const payload=schema.parse(Object.fromEntries(form));const r=await db.rpc("save_document_metadata",{doc:id,payload});checkDatabase(r.error,"Aggiornamento metadata");});}
export async function deleteDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.delete");const r=await db.rpc("set_document_archive",{doc:id,archived:true});checkDatabase(r.error);});}
export async function restoreDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.delete");const r=await db.rpc("set_document_archive",{doc:id,archived:false});checkDatabase(r.error);});}
export async function linkDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.update");const r=await db.rpc("link_document_context",{doc:id,...documentContextSchema.parse(Object.fromEntries(form))});checkDatabase(r.error);});}
export async function finalizeDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.upload"),version=z.uuid().parse(form.get("version"));const r=await db.from("document_versions").select("id").eq("id",version).eq("document_id",id).single();checkDatabase(r.error);const result=await db.rpc("finalize_document_version",{version,acknowledge_duplicate:form.get("acknowledge_duplicate")==="1"});checkDatabase(result.error,"Finalizzazione versione");});}
