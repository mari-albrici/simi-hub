"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { uploadDocumentFile } from "@/lib/document-upload-workflow";
import { findDocumentDuplicates } from "@/lib/documents";
import { AppError, checkDatabase, publicError } from "@/lib/errors";
import { documentHash, validateDocumentFile } from "@/lib/files";
import {
  authorizedClient,
  requirePermission,
} from "@/lib/permissions";
import {
  companyFormSchema,
  guideFormSchema,
  invoiceSchema,
  legalEntitySchema,
  projectFormSchema,
  uuidSchema,
} from "@/lib/validations";

import type { PermissionName } from "@/types";

/* ============================================================
   MUTATION HELPER
============================================================ */

async function mutation(
  path: string,
  message: string,
  work: () => Promise<void>,
) {
  try {
    await work();
  } catch (error) {
    const failure = publicError(error);

    redirect(
      `${path}?error=${encodeURIComponent(
        failure.message,
      )}&error_kind=${failure.kind}`,
    );
  }

  revalidatePath(path);
  revalidatePath("/dashboard");

  revalidatePath("/fatture", "layout");
  revalidatePath("/scadenze", "layout");
  revalidatePath("/pagamenti");

  redirect(
    `${path}?success=${encodeURIComponent(message)}`,
  );
}

/* ============================================================
   JSON ARRAY HELPER
============================================================ */

function jsonArray(
  data: FormData,
  key: string,
): unknown[] {
  try {
    const value: unknown = JSON.parse(
      String(data.get(key) ?? "[]"),
    );

    if (Array.isArray(value)) {
      return value;
    }
  } catch {
    // Gestito sotto.
  }

  throw new AppError(
    "validation",
    `Formato non valido: ${key}`,
  );
}

/* ============================================================
   FATTURE
============================================================ */

async function saveInvoice(
  form: FormData,
  edit: boolean,
) {
  const supabase = await authorizedClient(
    edit
      ? "invoice.update"
      : "invoice.create",
  );

  let uploadedDocumentId: string | null = null;

  const pdf = form.get("pdf_file");

  if (
    pdf instanceof File &&
    pdf.size > 0
  ) {
    if (
      pdf.type !== "application/pdf" ||
      pdf.size > 10 * 1024 * 1024
    ) {
      throw new AppError(
        "validation",
        "Il PDF deve essere valido e non superare 10 MB.",
      );
    }

    await validateDocumentFile(pdf);

    const duplicates =
      await findDocumentDuplicates(
        await documentHash(pdf),
      );

    if (
      duplicates.length &&
      form.get(
        "acknowledge_pdf_duplicate",
      ) !== "1"
    ) {
      throw new AppError(
        "validation",
        `Questo file risulta già presente nell'archivio: ${duplicates
          .map(
            (document) =>
              `${
                document.title ||
                document.original_filename
              } (/documenti/${document.id})`,
          )
          .join(
            ", ",
          )}. Collega il documento esistente dalla sua scheda o conferma il duplicato nel modulo fattura.`,
      );
    }

    const category = await supabase
      .from("document_categories")
      .select("id")
      .eq("code", "07")
      .maybeSingle();

    checkDatabase(
      category.error,
      "Lettura categoria fatture",
    );

    const uploaded =
      await uploadDocumentFile(
        supabase,
        pdf,
        {
          title: `Fattura ${String(
            form.get(
              "invoice_number",
            ) || pdf.name,
          )}`,

          legal_entity_id:
            String(
              form.get(
                "legal_entity_id",
              ),
            ),

          category_id:
            category.data?.id ??
            null,

          document_date:
            form.get(
              "invoice_date",
            ) || null,

          status: "valid",

          access_scope:
            "general",
        },
        {
          typeName:
            "Fattura",

          acknowledgeDuplicate:
            form.get(
              "acknowledge_pdf_duplicate",
            ) === "1",
        },
      );

    uploadedDocumentId =
      uploaded.documentId;
  }

  const type = String(
    form.get("invoice_type"),
  );

  const counterpartyId =
    String(
      form.get(
        "counterparty_id",
      ) ?? "",
    );

  const newName =
    String(
      form.get(
        "counterparty_new_name",
      ) ?? "",
    ).trim();

  const payload =
    invoiceSchema.parse({
      id:
        edit
          ? form.get("id")
          : undefined,

      expected_updated_at:
        edit
          ? form.get(
              "expected_updated_at",
            )
          : undefined,

      invoice_type:
        type,

      invoice_number:
        form.get(
          "invoice_number",
        ),

      legal_entity_id:
        form.get(
          "legal_entity_id",
        ),

      esolver_registration_number:
        form.get(
          "esolver_registration_number",
        ) || "",

      counterparty_id:
        counterpartyId,

      new_counterparty:
        !counterpartyId &&
        newName
          ? {
              company_type:
                type ===
                "purchase"
                  ? "supplier"
                  : "customer",

              business_name:
                newName,

              esolver_code:
                String(
                  form.get(
                    "counterparty_new_esolver_code",
                  ) ?? "",
                ).trim() ||
                null,

              vat_number:
                form.get(
                  "counterparty_new_vat",
                ),

              address:
                form.get(
                  "counterparty_new_address",
                ),

              iban:
                form.get(
                  "counterparty_new_iban",
                ),

              country: "",

              email: "",
            }
          : null,

      invoice_date:
        form.get(
          "invoice_date",
        ),

      received_date:
        form.get(
          "received_date",
        ),

      registration_date:
        form.get(
          "registration_date",
        ),

      due_date:
        form.get(
          "due_date",
        ),

      status:
        form.get("status"),

      currency:
        String(
          form.get(
            "currency",
          ) || "EUR",
        ).toUpperCase(),

      vat_treatment:
        form.get(
          "vat_treatment",
        ),

      amount_net:
        Number(
          form.get(
            "amount_net",
          ),
        ),

      vat_amount:
        Number(
          form.get(
            "vat_amount",
          ),
        ),

      amount_total:
        Number(
          form.get(
            "amount_total",
          ),
        ),

      vat_rate:
        form.get(
          "vat_rate",
        )
          ? Number(
              form.get(
                "vat_rate",
              ),
            )
          : null,

      vat_exempt_reason:
        String(
          form.get(
            "vat_exempt_reason",
          ) ?? "",
        ).trim() ||
        null,

      payment_method:
        form.get(
          "payment_method",
        ) || null,

      notes:
        String(
          form.get(
            "notes",
          ) ?? "",
        ),

      lines:
        jsonArray(
          form,
          "lines_json",
        ),

      installments:
        jsonArray(
          form,
          "installments_json",
        ),

      project_ids:
        form.getAll(
          "project_ids",
        ),

      document_id:
        uploadedDocumentId ??
        form.get(
          "document_id",
        ),
    });

  const result =
    await supabase.rpc(
      "save_invoice_phase1",
      {
        payload,
      },
    );

  checkDatabase(
    result.error,
    "Salvataggio fattura",
  );

  if (!result.data) {
    throw new AppError(
      "database",
      "Salvataggio non confermato.",
    );
  }
}

export async function createInvoiceAction(
  form: FormData,
) {
  return mutation(
    "/fatture",
    "Fattura creata.",
    () =>
      saveInvoice(
        form,
        false,
      ),
  );
}

export async function updateInvoiceAction(
  form: FormData,
) {
  return mutation(
    "/fatture",
    "Modifiche salvate.",
    () =>
      saveInvoice(
        form,
        true,
      ),
  );
}

/* ============================================================
   ARCHIVIAZIONE GENERALE
============================================================ */

async function archive(
  kind:
    | "project"
    | "invoice"
    | "company",
  id: string,
  permission: PermissionName,
) {
  const supabase =
    await authorizedClient(
      permission,
    );

  const result =
    await supabase.rpc(
      "archive_record",
      {
        kind,

        record_id:
          uuidSchema.parse(
            id,
          ),
      },
    );

  checkDatabase(
    result.error,
    "Archiviazione",
  );
}

export async function deleteInvoiceAction(
  id: string,
) {
  return mutation(
    "/fatture",
    "Fattura archiviata.",
    () =>
      archive(
        "invoice",
        id,
        "invoice.delete",
      ),
  );
}

/* ============================================================
   PAGAMENTI / MOVIMENTI FINANZIARI
============================================================ */

export async function saveFinancialMovementAction(
  form: FormData,
) {
  const invoiceId =
    uuidSchema.safeParse(
      form.get(
        "primary_invoice_id",
      ),
    );

  const destination =
    invoiceId.success
      ? `/fatture/${invoiceId.data}`
      : "/pagamenti";

  return mutation(
    destination,
    "Movimento registrato.",
    async () => {
      const supabase =
        await authorizedClient(
          "invoice.update",
        );

      let allocations: unknown[];

      try {
        allocations =
          JSON.parse(
            String(
              form.get(
                "allocations_json",
              ) ?? "[]",
            ),
          );
      } catch {
        throw new AppError(
          "validation",
          "Allocazioni non valide.",
        );
      }

      const primaryInvoice =
        String(
          form.get(
            "primary_invoice_id",
          ) || "",
        );

      if (primaryInvoice) {
        allocations = [
          {
            invoice_id:
              primaryInvoice,

            installment_id:
              form.get(
                "installment_id",
              ) || null,

            amount:
              Number(
                form.get(
                  "amount",
                ),
              ),
          },
        ];
      }

      const payload = {
        id:
          form.get("id") ||
          null,

        direction:
          form.get(
            "direction",
          ),

        legal_entity_id:
          form.get(
            "legal_entity_id",
          ),

        counterparty_id:
          form.get(
            "counterparty_id",
          ) || null,

        movement_date:
          form.get(
            "movement_date",
          ),

        amount:
          Number(
            form.get(
              "amount",
            ),
          ),

        currency:
          String(
            form.get(
              "currency",
            ) || "EUR",
          ).toUpperCase(),

        payment_method:
          form.get(
            "payment_method",
          ) || null,

        reference:
          form.get(
            "reference",
          ) || null,

        account_id:
          form.get(
            "account_id",
          ) || null,

        notes:
          form.get(
            "notes",
          ) || null,

        allocations,
      };

      const result =
        await supabase.rpc(
          "save_financial_movement",
          {
            payload,
          },
        );

      checkDatabase(
        result.error,
        "Salvataggio movimento",
      );

      if (!result.data) {
        throw new AppError(
          "database",
          "Movimento non confermato.",
        );
      }
    },
  );
}

export async function archiveFinancialMovementAction(
  id: string,
) {
  return mutation(
    "/pagamenti",
    "Movimento archiviato.",
    async () => {
      const supabase =
        await authorizedClient(
          "invoice.delete",
        );

      const result =
        await supabase.rpc(
          "archive_financial_movement",
          {
            movement:
              uuidSchema.parse(
                id,
              ),
          },
        );

      checkDatabase(
        result.error,
        "Archiviazione movimento",
      );
    },
  );
}

/* ============================================================
   COMMESSE
============================================================ */

export async function deleteProjectAction(
  id: string,
) {
  return mutation(
    "/commesse",
    "Commessa archiviata.",
    () =>
      archive(
        "project",
        id,
        "project.delete",
      ),
  );
}

export async function restoreProjectAction(
  id: string,
) {
  return mutation(
    "/commesse",
    "Commessa ripristinata.",
    async () => {
      const db =
        await authorizedClient(
          "project.delete",
        );

      const result =
        await db.rpc(
          "restore_project",
          {
            project_id:
              uuidSchema.parse(
                id,
              ),
          },
        );

      checkDatabase(
        result.error,
        "Ripristino commessa",
      );
    },
  );
}

async function saveProject(
  form: FormData,
  edit: boolean,
) {
  const supabase =
    await authorizedClient(
      edit
        ? "project.update"
        : "project.create",
    );

  const payload =
    projectFormSchema.parse(
      Object.fromEntries(
        form,
      ),
    );

  const result =
    edit
      ? await supabase
          .from("projects")
          .update(payload)
          .eq(
            "id",
            uuidSchema.parse(
              form.get("id"),
            ),
          )
          .is(
            "archived_at",
            null,
          )
          .select("id")
          .single()
      : await supabase
          .from("projects")
          .insert(payload)
          .select("id")
          .single();

  checkDatabase(
    result.error,
    "Salvataggio commessa",
  );
}

export async function createProjectAction(
  form: FormData,
) {
  return mutation(
    "/commesse",
    "Commessa creata.",
    () =>
      saveProject(
        form,
        false,
      ),
  );
}

export async function updateProjectAction(
  form: FormData,
) {
  return mutation(
    "/commesse",
    "Modifiche salvate.",
    () =>
      saveProject(
        form,
        true,
      ),
  );
}

/* ============================================================
   CLIENTI / FORNITORI
============================================================ */

export async function deleteCompanyAction(
  id: string,
  type:
    | "customer"
    | "supplier",
) {
  return mutation(
    type === "supplier"
      ? "/fornitori"
      : "/clienti",

    "Anagrafica archiviata.",

    () =>
      archive(
        "company",
        id,
        "company.delete",
      ),
  );
}

async function saveCompany(
  form: FormData,
  edit: boolean,
) {
  const supabase =
    await authorizedClient(
      edit
        ? "company.update"
        : "company.create",
    );

  const payload =
    companyFormSchema.parse(
      Object.fromEntries(
        form,
      ),
    );

  const result =
    edit
      ? await supabase
          .from("companies")
          .update(payload)
          .eq(
            "id",
            uuidSchema.parse(
              form.get("id"),
            ),
          )
          .is(
            "archived_at",
            null,
          )
          .select("id")
          .single()
      : await supabase
          .from("companies")
          .insert(payload)
          .select("id")
          .single();

  checkDatabase(
    result.error,
    "Salvataggio anagrafica",
  );
}

export async function createCompanyAction(
  form: FormData,
) {
  return mutation(
    form.get(
      "company_type",
    ) === "supplier"
      ? "/fornitori"
      : "/clienti",

    "Anagrafica creata.",

    () =>
      saveCompany(
        form,
        false,
      ),
  );
}

export async function updateCompanyAction(
  form: FormData,
) {
  return mutation(
    form.get(
      "company_type",
    ) === "supplier"
      ? "/fornitori"
      : "/clienti",

    "Modifiche salvate.",

    () =>
      saveCompany(
        form,
        true,
      ),
  );
}

/* ============================================================
   SOCIETÀ SIMI
============================================================ */

export async function createLegalEntityAction(
  form: FormData,
) {
  return mutation(
    "/aziende",
    "Società creata.",
    async () => {
      const supabase =
        await authorizedClient(
          "legal_entity.create",
        );

      const result =
        await supabase
          .from(
            "legal_entities",
          )
          .insert(
            legalEntitySchema.parse(
              Object.fromEntries(
                form,
              ),
            ),
          )
          .select("id")
          .single();

      checkDatabase(
        result.error,
        "Salvataggio società",
      );
    },
  );
}

export async function updateLegalEntityAction(
  form: FormData,
) {
  return mutation(
    "/aziende",
    "Modifiche salvate.",
    async () => {
      const supabase =
        await authorizedClient(
          "legal_entity.update",
        );

      const id =
        uuidSchema.parse(
          form.get("id"),
        );

      const payload =
        legalEntitySchema.parse(
          Object.fromEntries(
            form,
          ),
        );

      const result =
        await supabase
          .from(
            "legal_entities",
          )
          .update(payload)
          .eq("id", id)
          .select("id")
          .single();

      checkDatabase(
        result.error,
        "Aggiornamento società",
      );
    },
  );
}

/* ============================================================
   GUIDE E PROCEDURE
============================================================ */

function createGuideSlug(
  title: string,
) {
  return title
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /^-+|-+$/g,
      "",
    );
}

export async function createGuideAction(
  form: FormData,
) {
  /*
   * Otteniamo anche l'utente perché dobbiamo
   * salvare created_by / updated_by.
   */
  const user =
    await requirePermission(
      "document.update",
    );

  const db =
    await authorizedClient(
      "document.update",
    );

  let checklist: unknown[];

  try {
    const raw = String(
      form.get(
        "checklist_json",
      ) ?? "[]",
    );

    const parsed: unknown =
      JSON.parse(raw);

    if (
      !Array.isArray(
        parsed,
      )
    ) {
      throw new Error(
        "Checklist non array",
      );
    }

    checklist =
      parsed;
  } catch {
    throw new AppError(
      "validation",
      "Checklist non valida.",
    );
  }

  const payload =
    guideFormSchema.parse({
      title:
        form.get("title"),

      summary:
        form.get(
          "summary",
        ),

      content:
        form.get(
          "content",
        ),

      category_id:
        form.get(
          "category_id",
        ),

      status:
        form.get("status"),

      is_important:
        form.get(
          "is_important",
        ) === "1",

      checklist,
    });

  /*
   * Generazione slug.
   */
  const baseSlug =
    createGuideSlug(
      payload.title,
    ) || "guida";

  let slug =
    baseSlug;

  let availableSlugFound =
    false;

  for (
    let index = 1;
    index <= 1000;
    index++
  ) {
    const existing =
      await db
        .from("guides")
        .select("id")
        .eq(
          "slug",
          slug,
        )
        .maybeSingle();

    checkDatabase(
      existing.error,
      "Verifica slug guida",
    );

    if (
      !existing.data
    ) {
      availableSlugFound =
        true;

      break;
    }

    slug =
      `${baseSlug}-${index + 1}`;
  }

  if (
    !availableSlugFound
  ) {
    throw new AppError(
      "conflict",
      "Impossibile generare un identificativo univoco per la guida.",
    );
  }

  /*
   * Creazione guida.
   */
  const guideResult =
    await db
      .from("guides")
      .insert({
        title:
          payload.title,

        slug,

        summary:
          payload.summary ||
          null,

        content:
          payload.content,

        category_id:
          payload.category_id,

        status:
          payload.status,

        is_important:
          payload.is_important,

        created_by:
          user.id,

        updated_by:
          user.id,
      })
      .select("id")
      .single();

  checkDatabase(
    guideResult.error,
    "Creazione guida",
  );

  if (
    !guideResult.data?.id
  ) {
    throw new AppError(
      "database",
      "Creazione della guida non confermata.",
    );
  }

  const guideId =
    String(
      guideResult.data.id,
    );

  /*
   * Salvataggio checklist.
   */
  if (
    payload.checklist.length >
    0
  ) {
    const checklistResult =
      await db
        .from(
          "guide_checklist_items",
        )
        .insert(
          payload.checklist.map(
            (
              item,
              index,
            ) => ({
              guide_id:
                guideId,

              label:
                item.label,

              description:
                item.description ||
                null,

              sort_order:
                index,
            }),
          ),
        );

    checkDatabase(
      checklistResult.error,
      "Salvataggio checklist guida",
    );
  }

  revalidatePath(
    "/guide",
  );

  revalidatePath(
    `/guide/${guideId}`,
  );

  redirect(
    `/guide/${guideId}?success=${encodeURIComponent(
      "Guida creata correttamente.",
    )}`,
  );
}

export async function updateGuideAction(
  form: FormData,
) {
  const id =
    uuidSchema.parse(
      form.get("id"),
    );

  const editPath =
    `/guide/${id}/edit`;

  try {
    const user =
      await requirePermission(
        "document.update",
      );

    const db =
      await authorizedClient(
        "document.update",
      );

    let checklist: unknown[];

    try {
      const raw =
        String(
          form.get(
            "checklist_json",
          ) ?? "[]",
        );

      const parsed: unknown =
        JSON.parse(raw);

      if (
        !Array.isArray(
          parsed,
        )
      ) {
        throw new Error(
          "Checklist non valida",
        );
      }

      checklist =
        parsed;
    } catch {
      throw new AppError(
        "validation",
        "Checklist non valida.",
      );
    }

    const payload =
      guideFormSchema.parse({
        title:
          form.get(
            "title",
          ),

        summary:
          form.get(
            "summary",
          ),

        content:
          form.get(
            "content",
          ),

        category_id:
          form.get(
            "category_id",
          ),

        status:
          form.get(
            "status",
          ),

        is_important:
          form.get(
            "is_important",
          ) === "1",

        checklist,
      });

    /*
     * Aggiornamento dati principali.
     *
     * Lo slug NON viene cambiato quando cambia
     * il titolo: in questo modo l'identificativo
     * rimane stabile.
     */
    const guideResult =
      await db
        .from("guides")
        .update({
          title:
            payload.title,

          summary:
            payload.summary ||
            null,

          content:
            payload.content,

          category_id:
            payload.category_id,

          status:
            payload.status,

          is_important:
            payload.is_important,

          updated_by:
            user.id,
        })
        .eq(
          "id",
          id,
        )
        .is(
          "archived_at",
          null,
        )
        .select("id")
        .maybeSingle();

    checkDatabase(
      guideResult.error,
      "Aggiornamento guida",
    );

    if (
      !guideResult.data
    ) {
      throw new AppError(
        "database",
        "Guida non trovata o non modificabile.",
      );
    }

    /*
     * Ricreiamo la checklist nello stesso ordine
     * inviato dal form.
     */
    const deleteChecklistResult =
      await db
        .from(
          "guide_checklist_items",
        )
        .delete()
        .eq(
          "guide_id",
          id,
        );

    checkDatabase(
      deleteChecklistResult.error,
      "Aggiornamento checklist guida",
    );

    if (
      payload.checklist.length >
      0
    ) {
      const insertChecklistResult =
        await db
          .from(
            "guide_checklist_items",
          )
          .insert(
            payload.checklist.map(
              (
                item,
                index,
              ) => ({
                guide_id:
                  id,

                label:
                  item.label,

                description:
                  item.description ||
                  null,

                sort_order:
                  index,
              }),
            ),
          );

      checkDatabase(
        insertChecklistResult.error,
        "Salvataggio checklist guida",
      );
    }
  } catch (error) {
    const failure =
      publicError(error);

    redirect(
      `${editPath}?error=${encodeURIComponent(
        failure.message,
      )}&error_kind=${failure.kind}`,
    );
  }

  revalidatePath(
    "/guide",
  );

  revalidatePath(
    `/guide/${id}`,
  );

  revalidatePath(
    editPath,
  );

  redirect(
    `/guide/${id}?success=${encodeURIComponent(
      "Guida aggiornata correttamente.",
    )}`,
  );
}