import { hasPermission } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PermissionName } from "@/types";

export type GlobalSearchResultType =
  | "project"
  | "company"
  | "invoice"
  | "document"
  | "employee";

export type GlobalSearchResult = {
  id: string;
  type: GlobalSearchResultType;
  section: string;
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
};

const RESULT_LIMIT = 6;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function ilikePattern(value: string) {
  return JSON.stringify(`%${escapeLike(value)}%`);
}

function allowed(
  role: string,
  permission: PermissionName,
) {
  return hasPermission(
    role as Parameters<typeof hasPermission>[0],
    permission,
  );
}

export async function globalSearch(
  rawQuery: string,
): Promise<GlobalSearchResult[]> {
  const query = rawQuery.trim();

  if (query.length < 2) {
    return [];
  }

  const user = await getSessionUser();

  if (!user) {
    return [];
  }

  const supabase =
    await createServerSupabaseClient();

  if (!supabase) {
    return [];
  }

  const pattern =
    ilikePattern(query);

  const canReadProjects =
    allowed(
      user.role,
      "project.read",
    );

  const canReadCompanies =
    allowed(
      user.role,
      "company.read",
    );

  const canReadInvoices =
    allowed(
      user.role,
      "invoice.read",
    );

  const canReadDocuments =
    allowed(
      user.role,
      "document.read",
    );

  const canReadEmployees =
    allowed(
      user.role,
      "employee.read",
    );

  /*
   * Prima cerchiamo le anagrafiche.
   * I relativi ID possono essere
   * riutilizzati per trovare fatture
   * tramite cliente/fornitore.
   */
  let matchingCompanies: Array<{
    id: string;
    business_name: string;
    esolver_code: string | null;
    vat_number: string | null;
    company_type:
      | "customer"
      | "supplier"
      | "both";
  }> = [];

  if (
    canReadCompanies ||
    canReadInvoices
  ) {
    const companyResult =
      await supabase
        .from("companies")
        .select(
          "id,business_name,esolver_code,vat_number,company_type",
        )
        .is(
          "archived_at",
          null,
        )
        .or(
          [
            `business_name.ilike.${pattern}`,
            `esolver_code.ilike.${pattern}`,
            `vat_number.ilike.${pattern}`,
          ].join(","),
        )
        .limit(
          RESULT_LIMIT,
        );

    if (!companyResult.error) {
      matchingCompanies =
        (
          companyResult.data ??
          []
        ) as typeof matchingCompanies;
    }
  }

  const tasks: Array<
    Promise<GlobalSearchResult[]>
  > = [];

  /*
   * COMMESSE
   */
  if (canReadProjects) {
    tasks.push(
      (async () => {
        const result =
          await supabase
            .from("projects")
            .select(
              "id,project_code,name,city,country",
            )
            .is(
              "archived_at",
              null,
            )
            .or(
              [
                `project_code.ilike.${pattern}`,
                `name.ilike.${pattern}`,
                `city.ilike.${pattern}`,
                `country.ilike.${pattern}`,
              ].join(","),
            )
            .limit(
              RESULT_LIMIT,
            );

        if (result.error) {
          console.error(
            "Ricerca globale commesse:",
            result.error,
          );

          return [];
        }

        return (
          result.data ?? []
        ).map(
          (row) => ({
            id: String(
              row.id,
            ),
            type:
              "project" as const,
            section:
              "Commesse",
            title: `${row.project_code} — ${row.name}`,
            subtitle:
              [
                row.city,
                row.country,
              ]
                .filter(
                  Boolean,
                )
                .join(
                  " · ",
                ) ||
              undefined,
            href: `/commesse/${row.id}`,
            badge:
              String(
                row.project_code ??
                  "",
              ),
          }),
        );
      })(),
    );
  }

  /*
   * CLIENTI / FORNITORI
   */
  if (canReadCompanies) {
    tasks.push(
      Promise.resolve(
        matchingCompanies.map(
          (company) => {
            const isSupplier =
              company.company_type ===
              "supplier";

            const isBoth =
              company.company_type ===
              "both";

            const href =
              isSupplier
                ? `/fornitori/${company.id}`
                : `/clienti/${company.id}`;

            let kind =
              "Cliente";

            if (
              isSupplier
            ) {
              kind =
                "Fornitore";
            }

            if (isBoth) {
              kind =
                "Cliente / Fornitore";
            }

            return {
              id:
                company.id,
              type:
                "company" as const,
              section:
                "Clienti e fornitori",
              title:
                company.business_name,
              subtitle: [
                kind,
                company.vat_number
                  ? `P.IVA ${company.vat_number}`
                  : null,
              ]
                .filter(
                  Boolean,
                )
                .join(
                  " · ",
                ),
              href,
              badge:
                company.esolver_code ??
                undefined,
            };
          },
        ),
      ),
    );
  }

  /*
   * FATTURE
   */
  if (canReadInvoices) {
    tasks.push(
      (async () => {
        const companyIds =
          matchingCompanies.map(
            (company) =>
              company.id,
          );

        const filters = [
          `invoice_number.ilike.${pattern}`,
          `esolver_registration_number.ilike.${pattern}`,
        ];

        if (
          companyIds.length >
          0
        ) {
          const ids =
            companyIds.join(
              ",",
            );

          filters.push(
            `supplier_id.in.(${ids})`,
          );

          filters.push(
            `customer_id.in.(${ids})`,
          );
        }

        const result =
          await supabase
            .from("invoices")
            .select(
              `
                id,
                invoice_number,
                esolver_registration_number,
                invoice_type,
                invoice_date,
                supplier:companies!invoices_supplier_id_fkey(
                  business_name
                ),
                customer:companies!invoices_customer_id_fkey(
                  business_name
                )
              `,
            )
            .is(
              "archived_at",
              null,
            )
            .or(
              filters.join(
                ",",
              ),
            )
            .limit(
              RESULT_LIMIT,
            );

        if (result.error) {
          console.error(
            "Ricerca globale fatture:",
            result.error,
          );

          return [];
        }

        return (
          result.data ?? []
        ).map(
          (row) => {
            const supplier =
              row.supplier as
                | {
                    business_name?: string;
                  }
                | null;

            const customer =
              row.customer as
                | {
                    business_name?: string;
                  }
                | null;

            const counterparty =
              row.invoice_type ===
              "purchase"
                ? supplier?.business_name
                : customer?.business_name;

            return {
              id: String(
                row.id,
              ),
              type:
                "invoice" as const,
              section:
                "Fatture",
              title: `Fattura ${row.invoice_number}`,
              subtitle: [
                row.invoice_type ===
                "purchase"
                  ? "Acquisto"
                  : "Vendita",
                counterparty,
                row.invoice_date,
              ]
                .filter(
                  Boolean,
                )
                .join(
                  " · ",
                ),
              href: `/fatture/${row.id}`,
              badge:
                row.esolver_registration_number ??
                undefined,
            };
          },
        );
      })(),
    );
  }

  /*
   * DOCUMENTI
   */
  if (canReadDocuments) {
    tasks.push(
      (async () => {
        const result =
          await supabase
            .from("documents")
            .select(
              `
                id,
                title,
                original_filename,
                normalized_filename,
                reference,
                document_date
              `,
            )
            .is(
              "archived_at",
              null,
            )
            .or(
              [
                `title.ilike.${pattern}`,
                `original_filename.ilike.${pattern}`,
                `normalized_filename.ilike.${pattern}`,
                `reference.ilike.${pattern}`,
              ].join(","),
            )
            .limit(
              RESULT_LIMIT,
            );

        if (result.error) {
          console.error(
            "Ricerca globale documenti:",
            result.error,
          );

          return [];
        }

        return (
          result.data ?? []
        ).map(
          (row) => ({
            id: String(
              row.id,
            ),
            type:
              "document" as const,
            section:
              "Documenti",
            title:
              row.title ||
              row.original_filename ||
              "Documento",
            subtitle: [
              row.reference
                ? `Rif. ${row.reference}`
                : null,
              row.document_date,
              row.original_filename !==
              row.title
                ? row.original_filename
                : null,
            ]
              .filter(
                Boolean,
              )
              .join(
                " · ",
              ),
            href: `/documenti/${row.id}`,
          }),
        );
      })(),
    );
  }

  /*
   * PERSONALE
   */
  if (canReadEmployees) {
    tasks.push(
      (async () => {
        const result =
          await supabase
            .from("employees")
            .select(
              `
                id,
                first_name,
                last_name,
                employee_code,
                email,
                role_title,
                status
              `,
            )
            .or(
              [
                `first_name.ilike.${pattern}`,
                `last_name.ilike.${pattern}`,
                `employee_code.ilike.${pattern}`,
                `email.ilike.${pattern}`,
                `role_title.ilike.${pattern}`,
              ].join(","),
            )
            .limit(
              RESULT_LIMIT,
            );

        if (result.error) {
          console.error(
            "Ricerca globale personale:",
            result.error,
          );

          return [];
        }

        return (
          result.data ?? []
        ).map(
          (row) => ({
            id: String(
              row.id,
            ),
            type:
              "employee" as const,
            section:
              "Personale",
            title: [
              row.first_name,
              row.last_name,
            ]
              .filter(
                Boolean,
              )
              .join(
                " ",
              ),
            subtitle: [
              row.role_title,
              row.email,
            ]
              .filter(
                Boolean,
              )
              .join(
                " · ",
              ),
            href: `/personale/${row.id}`,
            badge:
              row.employee_code ??
              undefined,
          }),
        );
      })(),
    );
  }

  const settled =
    await Promise.allSettled(
      tasks,
    );

  return settled.flatMap(
    (result) =>
      result.status ===
      "fulfilled"
        ? result.value
        : [],
  );
}