import { authorizedClient, requirePermission } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { deadlineFilterSchema } from "@/lib/deadline-validation";

export type Deadline = {
  id: string;
  source: string;
  invoice_id: string | null;
  installment_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  kind: string;
  legal_entity_id: string;
  entity_name: string;
  entity_country: string;
  company_id: string | null;
  company_name: string | null;
  company_type: string | null;
  document_id: string | null;
  project_ids: string[];
  category_code: string;
  category_name: string;
  priority: string;
  assigned_to: string | null;
  notes: string | null;
  original_amount: number | null;
  settled_amount: number | null;
  residual: number | null;
  currency: string | null;
  completed: boolean;
  temporal_status: string;
  archived_at: string | null;
};

export function deadlineHref(d: Deadline) {
  return d.source === "document" && d.document_id
    ? `/documenti/${d.document_id}`
    : d.invoice_id
      ? `/fatture/${d.invoice_id}${
          d.installment_id ? `#rata-${d.installment_id}` : ""
        }`
      : `/scadenze/${d.id.replace("manual:", "")}`;
}

export async function getDeadlines(
  params: Record<string, string | undefined> = {},
  all = false,
) {
  const f = deadlineFilterSchema.parse(params);
  const user = await requirePermission("deadline.read");
  const db = await authorizedClient("deadline.read");

  const today = new Date().toISOString().slice(0, 10);

  let query = db
    .from("operational_deadlines")
    .select("*", { count: "exact" });

  query = f.archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);

  if (f.q) {
    query = query.ilike(
      "search_text",
      `%${f.q.replace(/[%_\\]/g, "\\$&")}%`,
    );
  }

  for (const [key, value] of [
    ["legal_entity_id", f.entity],
    ["company_id", f.company],
    ["assigned_to", f.mine ? user.id : f.assigned],
    ["kind", f.kind],
    ["category_code", f.category],
    ["priority", f.priority],
  ]) {
    if (key && value) {
      query = query.eq(key, value);
    }
  }

  if (f.project) {
    query = query.contains("project_ids", [f.project]);
  }

  if (f.status === "open") {
    query = query.eq("completed", false);
  } else if (f.status) {
    query = query.eq("temporal_status", f.status);
  }

  if (f.period === "overdue") {
    query = query.eq("temporal_status", "overdue");
  }

  if (["today", "7", "30"].includes(f.period)) {
    const end = new Date(`${today}T00:00:00Z`);

    end.setUTCDate(
      end.getUTCDate() +
        (f.period === "today" ? 0 : Number(f.period)),
    );

    query = query
      .gte("due_date", today)
      .lte("due_date", end.toISOString().slice(0, 10))
      .eq("completed", false);
  }

  if (f.from) {
    query = query.gte("due_date", f.from);
  }

  if (f.to) {
    query = query.lte("due_date", f.to);
  }

  const month = f.month ?? today.slice(0, 7);

  if (f.view === "calendar") {
    const end = new Date(`${month}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);

    query = query
      .gte("due_date", `${month}-01`)
      .lt("due_date", end.toISOString().slice(0, 10));
  }

  query = query
    .order("due_date", { nullsFirst: false })
    .order("id");

  if (f.view === "calendar" || all) {
    const rows = await readAll((a, b) =>
      query.range(a, b),
    );

    return {
      rows: rows as Deadline[],
      count: rows.length,
      filters: f,
      month,
    };
  }

  const result = await query.range(
    (f.page - 1) * 50,
    f.page * 50 - 1,
  );

  checkDatabase(
    result.error,
    "Lettura scadenziario",
  );

  return {
    rows: (result.data ?? []) as Deadline[],
    count: result.count ?? 0,
    filters: f,
    month,
  };
}

export async function deadlineOptions() {
  const db = await authorizedClient("deadline.read");

  const [
    entities,
    categories,
    companies,
    projects,
    documents,
    profiles,
  ] = await Promise.all([
    readAll((a, b) =>
      db
        .from("legal_entities")
        .select("id,business_name")
        .eq("active", true)
        .order("business_name")
        .range(a, b),
    ),

    readAll((a, b) =>
      db
        .from("deadline_categories")
        .select("code,name")
        .order("name")
        .range(a, b),
    ),

    readAll((a, b) =>
      db
        .from("companies")
        .select("id,business_name")
        .is("archived_at", null)
        .order("business_name")
        .range(a, b),
    ),

    readAll((a, b) =>
      db
        .from("projects")
        .select("id,project_code")
        .is("archived_at", null)
        .order("project_code")
        .range(a, b),
    ),

    readAll((a, b) =>
      db
        .from("documents")
        .select("id,title,original_filename")
        .is("archived_at", null)
        .order("id")
        .range(a, b),
    ),

    db.rpc("profile_directory"),
  ]);

  checkDatabase(profiles.error);

  return {
    entities,
    categories,
    companies,
    projects,
    documents,
    profiles: (profiles.data ?? []) as {
      id: string;
      first_name: string;
      last_name: string;
    }[],
  };
}

export type InvoiceDeadlineExportRow = {
  invoice_id: string;
  installment_id: string | null;

  supplier_name: string;
  supplier_esolver_code: string | null;

  invoice_number: string;
  invoice_esolver_number: string | null;

  amount_total: number;
  currency: string;

  installment_amount: number | null;
  installment_position: number | null;
  installment_count: number | null;

  payment_method: string | null;

  due_date: string;
  days_overdue: number | null;
};

export async function getInvoiceDeadlineExportRows(
  days: 7 | 30 | 60 | 90,
): Promise<InvoiceDeadlineExportRow[]> {
  await requirePermission("deadline.read");

  const db = await authorizedClient("deadline.read");

  const today = new Date();
  const todayString = today.toISOString().slice(0, 10);

  const end = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + days,
    ),
  );

  const endString = end.toISOString().slice(0, 10);

  /*
   * Prendiamo:
   * - tutte le scadenze fattura fornitori già scadute
   * - quelle in scadenza da oggi ai prossimi 7/30 giorni
   */
  const deadlines = await readAll((from, to) =>
    db
      .from("operational_deadlines")
      .select("invoice_id,installment_id,due_date")
      .eq("kind", "payment")
      .not("invoice_id", "is", null)
      .eq("completed", false)
      .is("archived_at", null)
      .not("due_date", "is", null)
      .lte("due_date", endString)
      .order("due_date")
      .range(from, to),
  );

  const invoiceIds = [
    ...new Set(
      deadlines
        .map((row) => row.invoice_id)
        .filter(
          (id): id is string =>
            typeof id === "string",
        ),
    ),
  ];

  if (!invoiceIds.length) {
    return [];
  }

  const invoices = await readAll((from, to) =>
    db
      .from("invoices")
      .select(`
        id,
        invoice_number,
        esolver_registration_number,
        amount_total,
        currency,
        payment_method,
        supplier:companies!invoices_supplier_id_fkey(
          business_name,
          esolver_code
        )
      `)
      .in("id", invoiceIds)
      .is("archived_at", null)
      .range(from, to),
  );

  /*
   * Recuperiamo tutte le rate delle fatture coinvolte.
   *
   * Ci servono per sapere:
   * - importo rata
   * - posizione (es. 2)
   * - totale rate (es. 4)
   */
  const installments = await readAll((from, to) =>
    db
      .from("invoice_installments")
      .select(
        "id,invoice_id,position,amount",
      )
      .in("invoice_id", invoiceIds)
      .order("invoice_id")
      .order("position")
      .range(from, to),
  );

  const invoiceMap = new Map(
    invoices.map((invoice) => [
      String(invoice.id),
      invoice,
    ]),
  );

  const installmentsByInvoice = new Map<
    string,
    Array<{
      id: string;
      position: number;
      amount: number;
    }>
  >();

  for (const installment of installments) {
    const invoiceId = String(
      installment.invoice_id,
    );

    const current =
      installmentsByInvoice.get(invoiceId) ?? [];

    current.push({
      id: String(installment.id),
      position: Number(installment.position),
      amount: Number(installment.amount),
    });

    installmentsByInvoice.set(
      invoiceId,
      current,
    );
  }

  return deadlines.flatMap((deadline) => {
    if (
      !deadline.invoice_id ||
      !deadline.due_date
    ) {
      return [];
    }

    const invoice = invoiceMap.get(
      String(deadline.invoice_id),
    );

    if (!invoice) {
      return [];
    }

    const supplier = invoice.supplier as {
      business_name?: string;
      esolver_code?: string | null;
    } | null;

    const invoiceInstallments =
      installmentsByInvoice.get(
        String(deadline.invoice_id),
      ) ?? [];

    const installment = deadline.installment_id
      ? invoiceInstallments.find(
          (item) =>
            item.id ===
            String(deadline.installment_id),
        )
      : null;

    const due = new Date(
      `${deadline.due_date}T00:00:00Z`,
    );

    const current = new Date(
      `${todayString}T00:00:00Z`,
    );

    const difference = Math.floor(
      (current.getTime() - due.getTime()) /
        86_400_000,
    );

    return [
      {
        invoice_id: String(
          deadline.invoice_id,
        ),

        installment_id:
          deadline.installment_id
            ? String(deadline.installment_id)
            : null,

        supplier_name:
          supplier?.business_name ?? "—",

        supplier_esolver_code:
          supplier?.esolver_code ?? null,

        invoice_number: String(
          invoice.invoice_number ?? "—",
        ),

        invoice_esolver_number:
          typeof invoice.esolver_registration_number ===
          "string"
            ? invoice.esolver_registration_number
            : null,

        amount_total: Number(
          invoice.amount_total ?? 0,
        ),

        currency: String(
          invoice.currency ?? "EUR",
        ),

        installment_amount:
          installment?.amount ?? null,

        installment_position:
          installment?.position ?? null,

        installment_count: installment
          ? invoiceInstallments.length
          : null,

        payment_method:
          typeof invoice.payment_method ===
          "string"
            ? invoice.payment_method
            : null,

        due_date: String(
          deadline.due_date,
        ),

        days_overdue:
          difference > 0
            ? difference
            : null,
      },
    ];
  });
}