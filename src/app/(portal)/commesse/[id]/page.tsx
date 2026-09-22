import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { ContextWork } from "@/components/work/context";
import { ContextDocuments } from "@/components/documents/context-documents";
import { ProjectCycle } from "@/components/commercial/project-cycle";
import { ProjectOffersContracts } from "@/components/commercial/project-offers-contracts";

import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

import {
  formatDate,
  formatMoney,
} from "@/lib/formatters";

import {
  requirePagePermission,
  getAccessScope,
  authorizedClient,
} from "@/lib/permissions";

import {
  getProjectById,
  getProjectSummary,
  getInvoices,
} from "@/lib/data";

import { getDeadlines } from "@/lib/deadlines";
import { deleteProjectAction } from "@/lib/crud";
import { hasPermission } from "@/lib/auth";
import { checkDatabase } from "@/lib/errors";


// ============================================================
// TYPES
// ============================================================

type ProjectTab =
  | "overview"
  | "documents"
  | "offers"
  | "invoices"
  | "deadlines";


// ============================================================
// HELPERS
// ============================================================

function money(value: number, currency: string) {
  return formatMoney(value, currency);
}


// ============================================================
// PAGE
// ============================================================

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  // ----------------------------------------------------------
  // ACCESSO
  // ----------------------------------------------------------

  await requirePagePermission("project.read");

  const { id } = await params;
  const { tab } = await searchParams;

  const allowedTabs: ProjectTab[] = [
    "overview",
    "documents",
    "offers",
    "invoices",
    "deadlines",
  ];

  const activeTab: ProjectTab = allowedTabs.includes(
    tab as ProjectTab
  )
    ? (tab as ProjectTab)
    : "overview";


  // ----------------------------------------------------------
  // COMMESSA
  // ----------------------------------------------------------

  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const access = await getAccessScope("project");


  // ----------------------------------------------------------
  // DATI
  // ----------------------------------------------------------

  const [
    summary,
    invoices,
    deadlines,
  ] = await Promise.all([
    getProjectSummary(id),
    getInvoices({ project_id: id }),
    getDeadlines({ project: id }, false),
  ]);


  // ----------------------------------------------------------
  // DATABASE
  // ----------------------------------------------------------

  const db = await authorizedClient("project.read");


  // ----------------------------------------------------------
  // CATEGORIE DOCUMENTALI
  // ----------------------------------------------------------

  const categoryResult = await db.rpc(
    "project_document_categories",
    {
      project: id,
    }
  );

  checkDatabase(categoryResult.error);

  const categories = (categoryResult.data ?? []) as {
    id: string;
    code: string;
    name: string;
    items: number;
      parent_id: string | null;
  }[];


  // ----------------------------------------------------------
  // QUOTE FATTURE ATTRIBUITE ALLA COMMESSA
  // ----------------------------------------------------------

  const invoiceLineResult = invoices.length
    ? await db
        .from("invoice_lines")
        .select("invoice_id,amount_total")
        .eq("project_id", id)
        .in(
          "invoice_id",
          invoices.map((invoice) => invoice.id)
        )
    : {
        data: [],
        error: null,
      };

  checkDatabase(invoiceLineResult.error);

  const attributedAmounts = new Map<string, number>();

  for (const row of invoiceLineResult.data ?? []) {
    const invoiceId = String(row.invoice_id);

    attributedAmounts.set(
      invoiceId,
      (attributedAmounts.get(invoiceId) ?? 0) +
        Number(row.amount_total)
    );
  }


  // ----------------------------------------------------------
  // PERMESSI
  // ----------------------------------------------------------

  const canCreateDeadline = access.role
    ? hasPermission(access.role, "deadline.write")
    : false;


  // ----------------------------------------------------------
  // SCADENZE IMPORTANTI PER PANORAMICA
  // ----------------------------------------------------------

  const importantDeadlines = deadlines.rows
    .filter(
      (deadline) =>
        deadline.temporal_status !== "completed" &&
        deadline.temporal_status !== "paid"
    )
    .slice(0, 5);


  // ============================================================
  // UI
  // ============================================================

  return (
    <>
      {/* ======================================================
          HEADER
      ======================================================= */}

      <section className="mb-4">

        <Link
          href="/commesse"
          className="small text-decoration-none"
        >
          <i
            className="bi bi-arrow-left me-1"
            aria-hidden="true"
          />
          Commesse
        </Link>


        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mt-2">

          {/* IDENTITÀ COMMESSA */}

          <div>

            <div className="d-flex align-items-center gap-2 flex-wrap">

              <h1 className="h3 mb-0">
                {project.project_code}
              </h1>

              <StatusBadge
                domain="project"
                status={project.status}
              />

            </div>

            <div className="text-muted mt-1">
              {project.name}
            </div>

          </div>


          {/* AZIONI */}

          <div className="d-flex gap-2 flex-wrap">

            {access.canUpload && (
              <Link
                className="btn btn-primary"
                href={`/documenti/new?project=${id}`}
              >
                <i className="bi bi-upload me-2" />
                Carica documento
              </Link>
            )}

            {access.canCreate && (
              <Link
                className="btn btn-outline-primary"
                href={`/fatture/new?project=${id}`}
              >
                <i className="bi bi-receipt me-2" />
                Nuova fattura
              </Link>
            )}

            {canCreateDeadline && (
              <Link
                className="btn btn-outline-primary"
                href={`/scadenze/new?project=${id}&entity=${
                  project.legal_entity_id || ""
                }`}
              >
                <i className="bi bi-calendar-plus me-2" />
                Nuova scadenza
              </Link>
            )}

            {access.canUpdate && (
              <Link
                className="btn btn-outline-secondary"
                href={`/commesse/${id}/edit`}
              >
                <i className="bi bi-pencil me-2" />
                Modifica
              </Link>
            )}

            {access.canDelete && (
              <form
                action={async () => {
                  "use server";
                  await deleteProjectAction(id);
                }}
              >
                <ConfirmSubmitButton
                  confirmMessage={`Archiviare la commessa ${project.project_code}?`}
                >
                  Archivia
                </ConfirmSubmitButton>
              </form>
            )}

          </div>

        </div>

      </section>


      {/* ======================================================
          TABS
      ======================================================= */}

      <div className="border-bottom mb-4">

        <nav className="nav nav-tabs border-0">

          <ProjectTabLink
            id={id}
            tab="overview"
            activeTab={activeTab}
            icon="bi-grid"
          >
            Panoramica
          </ProjectTabLink>

          <ProjectTabLink
            id={id}
            tab="documents"
            activeTab={activeTab}
            icon="bi-folder2-open"
            count={summary.documents}
          >
            Documenti
          </ProjectTabLink>

          <ProjectTabLink
            id={id}
            tab="offers"
            activeTab={activeTab}
            icon="bi-file-earmark-text"
          >
            Offerte e contratti
          </ProjectTabLink>

          <ProjectTabLink
            id={id}
            tab="invoices"
            activeTab={activeTab}
            icon="bi-receipt"
            count={summary.invoices}
          >
            Fatture
          </ProjectTabLink>

          <ProjectTabLink
            id={id}
            tab="deadlines"
            activeTab={activeTab}
            icon="bi-calendar-event"
            count={summary.open_deadlines}
          >
            Scadenze
          </ProjectTabLink>

        </nav>

      </div>


      {/* ======================================================
          TAB: PANORAMICA
      ======================================================= */}

      {activeTab === "overview" && (
        <div>

          {/* --------------------------------------------------
              DATI PRINCIPALI + CICLO
          --------------------------------------------------- */}

          <div className="row g-3 mb-4">

            <div className="col-xl-8">

              <div className="app-card p-4 h-100">

                <div className="d-flex justify-content-between align-items-center mb-4">

                  <div>
                    <h2 className="h5 mb-1">
                      Informazioni commessa
                    </h2>

                    <div className="small text-muted">
                      Dati principali e riferimenti operativi
                    </div>
                  </div>

                  {access.canUpdate && (
                    <Link
                      href={`/commesse/${id}/edit`}
                      className="btn btn-sm btn-outline-secondary"
                    >
                      <i className="bi bi-pencil me-1" />
                      Modifica
                    </Link>
                  )}

                </div>


                <div className="row g-4">

                  <ProjectInfo
                    icon="bi-building"
                    label="Società SIMI"
                    value={project.entity_name}
                  />

                  <ProjectInfo
                    icon="bi-person"
                    label="Responsabile"
                    value={project.project_manager_name}
                  />


                  <div className="col-md-6">

                    <InfoLabel
                      icon="bi-briefcase"
                      label="Cliente"
                    />

                    <div className="fw-medium">

                      {project.customer_id ? (
                        <Link
                          href={`/clienti/${project.customer_id}`}
                        >
                          {project.customer_name}
                        </Link>
                      ) : (
                        "—"
                      )}

                    </div>

                  </div>


                  <ProjectInfo
                    icon="bi-geo-alt"
                    label="Luogo"
                    value={
                      [project.city, project.country]
                        .filter(Boolean)
                        .join(", ") || "—"
                    }
                  />

                  <ProjectInfo
                    icon="bi-calendar-check"
                    label="Apertura"
                    value={formatDate(project.opening_date)}
                  />

                  <ProjectInfo
                    icon="bi-play-circle"
                    label="Inizio previsto"
                    value={formatDate(
                      project.planned_start_date
                    )}
                  />

                  <ProjectInfo
                    icon="bi-flag"
                    label="Fine prevista"
                    value={formatDate(
                      project.expected_closing_date
                    )}
                  />

                </div>


                {(project.description || project.notes) && (
                  <hr className="my-4" />
                )}


                {project.description && (
                  <div className="mb-4">

                    <div className="small text-muted mb-2">
                      Descrizione
                    </div>

                    <div>
                      {project.description}
                    </div>

                  </div>
                )}


                {project.notes && (
                  <div>

                    <div className="small text-muted mb-2">
                      Note operative
                    </div>

                    <div>
                      {project.notes}
                    </div>

                  </div>
                )}

              </div>

            </div>


            {/* CICLO COMMESSA */}

            <div className="col-xl-4">

              <ProjectCycle id={id} />

            </div>

          </div>


          {/* --------------------------------------------------
              SITUAZIONE ECONOMICA
          --------------------------------------------------- */}

          <div className="app-card p-4 mb-4">

            <div className="d-flex justify-content-between align-items-center mb-3">

              <div>
                <h2 className="h5 mb-1">
                  Situazione economica
                </h2>

                <div className="small text-muted">
                  Importi attribuiti alla commessa
                </div>
              </div>

              <Link
                href={`/commesse/${id}?tab=invoices`}
                className="small text-decoration-none"
              >
                Vedi fatture
                <i className="bi bi-arrow-right ms-1" />
              </Link>

            </div>


            {(summary.unattributed_invoices ?? 0) > 0 && (
              <p className="alert alert-warning">
                {summary.unattributed_invoices} fatture con attribuzione parziale o a più commesse sono escluse da questi saldi:
                i pagamenti non sono ripartiti per commessa. Le fatture restano consultabili nella relativa sezione.
              </p>
            )}

            {summary.financial.length > 0 ? (

              <div className="row g-3">

                {summary.financial.map(
                  (item, index) => (

                    <div
                      className="col-md-6 col-xl-4"
                      key={`${item.kind}-${item.currency}-${index}`}
                    >

                      <div className="border rounded p-3 h-100">

                        <div className="d-flex justify-content-between align-items-center mb-3">

                          <span className="small text-muted">
                            {item.kind === "payment"
                              ? "Da pagare"
                              : "Da incassare"}
                          </span>

                          <span className="badge text-bg-light">
                            {item.currency}
                          </span>

                        </div>


                        <div className="mb-3">

                          <div className="small text-muted">
                            Residuo
                          </div>

                          <div className="fs-4 fw-semibold">
                            {money(
                              item.residual,
                              item.currency
                            )}
                          </div>

                        </div>


                        <div className="row g-2 small">

                          <div className="col-6">

                            <div className="text-muted">
                              Totale
                            </div>

                            <div>
                              {money(
                                item.original,
                                item.currency
                              )}
                            </div>

                          </div>

                          <div className="col-6">

                            <div className="text-muted">
                              Saldato
                            </div>

                            <div>
                              {money(
                                item.settled,
                                item.currency
                              )}
                            </div>

                          </div>

                        </div>

                      </div>

                    </div>

                  )
                )}

              </div>

            ) : (

              <EmptyState
                icon="bi-cash-stack"
                title={(summary.unattributed_invoices ?? 0) > 0 ? "Saldi non attribuibili" : "Nessun dato economico"}
              >
                {(summary.unattributed_invoices ?? 0) > 0
                  ? "Consulta le fatture per gli importi e i pagamenti complessivi."
                  : "Non risultano ancora importi attribuiti alla commessa."}
              </EmptyState>

            )}

          </div>


          {/* --------------------------------------------------
              SCADENZE IMPORTANTI
          --------------------------------------------------- */}

          <div className="row g-3 mb-4">

            <div className="col-xl-7">

              <div className="app-card p-4 h-100">

                <div className="d-flex justify-content-between align-items-center mb-3">

                  <div>
                    <h2 className="h5 mb-1">
                      Prossime scadenze
                    </h2>

                    <div className="small text-muted">
                      Cosa richiede attenzione
                    </div>
                  </div>

                  <Link
                    href={`/commesse/${id}?tab=deadlines`}
                    className="small text-decoration-none"
                  >
                    Vedi tutte
                  </Link>

                </div>


                {importantDeadlines.length > 0 ? (

                  importantDeadlines.map((deadline) => (

                    <div
                      key={deadline.id}
                      className="d-flex justify-content-between align-items-center gap-3 py-3 border-bottom"
                    >

                      <div>

                        <Link
                          href={
                            deadline.invoice_id
                              ? `/fatture/${deadline.invoice_id}`
                              : `/scadenze/${deadline.id.replace(
                                  "manual:",
                                  ""
                                )}`
                          }
                          className="fw-medium text-decoration-none"
                        >
                          {deadline.title}
                        </Link>

                        <div className="small text-muted mt-1">
                          {formatDate(deadline.due_date)}
                        </div>

                      </div>

                      <StatusBadge
                        domain="deadline"
                        status={deadline.temporal_status}
                      />

                    </div>

                  ))

                ) : (

                  <EmptyState
                    icon="bi-calendar-check"
                    title="Nessuna scadenza"
                  >
                    Non ci sono scadenze aperte da gestire.
                  </EmptyState>

                )}

              </div>

            </div>


            {/* -----------------------------------------------
                RIEPILOGO OPERATIVO
            ------------------------------------------------ */}

            <div className="col-xl-5">

              <div className="app-card p-4 h-100">

                <h2 className="h5 mb-1">
                  Riepilogo operativo
                </h2>

                <div className="small text-muted mb-4">
                  Situazione documentale e amministrativa
                </div>


                <OverviewRow
                  icon="bi-folder2-open"
                  label="Documenti"
                  value={summary.documents}
                  href={`/commesse/${id}?tab=documents`}
                />

                <OverviewRow
                  icon="bi-receipt"
                  label="Fatture fornitori"
                  value={summary.supplier_invoices}
                  href={`/commesse/${id}?tab=invoices`}
                />

                <OverviewRow
                  icon="bi-receipt-cutoff"
                  label="Fatture clienti"
                  value={summary.customer_invoices}
                  href={`/commesse/${id}?tab=invoices`}
                />

                <OverviewRow
                  icon="bi-calendar-event"
                  label="Scadenze aperte"
                  value={summary.open_deadlines}
                  href={`/commesse/${id}?tab=deadlines`}
                />

                <OverviewRow
                  icon="bi-exclamation-triangle"
                  label="Scadenze scadute"
                  value={summary.overdue_deadlines}
                  href={`/commesse/${id}?tab=deadlines`}
                  important={summary.overdue_deadlines > 0}
                />

              </div>

            </div>

          </div>


          {/* --------------------------------------------------
              CONTESTO LAVORO
          --------------------------------------------------- */}

          <ContextWork
            kind="project"
            id={id}
          />

        </div>
      )}


{/* ======================================================
    TAB: DOCUMENTI
======================================================= */}

{activeTab === "documents" && (
  <div className="row g-4">

    {/* ==================================================
        CATEGORIE
    =================================================== */}

    <div className="col-xl-4 col-xxl-3">
      <div className="app-card overflow-hidden">

        {/* HEADER CATEGORIE */}

        <div className="p-4 border-bottom">
          <h2 className="h5 mb-1">
            Categorie
          </h2>

          <div className="small text-muted">
            Organizzazione documentale della commessa
          </div>
        </div>


        {/* ELENCO CATEGORIE */}

        {categories.length > 0 ? (
          <div className="list-group list-group-flush">

            {categories
              .filter((category) => !category.parent_id)
              .map((category) => {

                const children = categories.filter(
                  (child) => child.parent_id === category.id
                );

                const totalItems =
                  category.items +
                  children.reduce(
                    (total, child) => total + child.items,
                    0
                  );

                return (
                  <div
                    key={category.id}
                    className="border-bottom"
                  >

                    {/* CATEGORIA PRINCIPALE */}

                    <Link
                      href={`/documenti?project=${id}&category=${category.id}`}
                      className="d-flex align-items-center justify-content-between gap-3 px-4 py-3 text-decoration-none"
                    >
                      <div className="d-flex align-items-center gap-3">

                        <i
                          className="bi bi-folder2 text-muted"
                          aria-hidden="true"
                        />

                        <span className="fw-medium text-body">
                          {category.name}
                        </span>

                      </div>

                      <span className="badge rounded-pill text-bg-light">
                        {totalItems}
                      </span>
                    </Link>


                    {/* SOTTOCATEGORIE */}

                    {children.length > 0 && (
                      <div className="pb-2">

                        {children.map((child) => (
                          <Link
                            key={child.id}
                            href={`/documenti?project=${id}&category=${child.id}`}
                            className="d-flex align-items-center justify-content-between gap-3 py-2 pe-4 ps-5 text-decoration-none"
                          >
                            <div className="d-flex align-items-center gap-2">

                              <i
                                className="bi bi-file-earmark text-muted small"
                                aria-hidden="true"
                              />

                              <span className="small text-body">
                                {child.name}
                              </span>

                            </div>

                            <span className="small text-muted">
                              {child.items}
                            </span>
                          </Link>
                        ))}

                      </div>
                    )}

                  </div>
                );
              })}

          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              icon="bi-folder"
              title="Nessuna categoria"
            >
              Non risultano categorie documentali.
            </EmptyState>
          </div>
        )}

      </div>
    </div>


    {/* ==================================================
        DOCUMENTI DELLA COMMESSA
    =================================================== */}

    <div className="col-xl-8 col-xxl-9">
      <ContextDocuments
        project={id}
        entity={project.legal_entity_id}
      />
    </div>

  </div>
)}


      {/* ======================================================
          TAB: OFFERTE E CONTRATTI
      ======================================================= */}

      {activeTab === "offers" && (

        <ProjectOffersContracts id={id} />

      )}


      {/* ======================================================
          TAB: FATTURE
      ======================================================= */}

      {activeTab === "invoices" && (

        <div className="app-card p-4">

          <div className="d-flex justify-content-between align-items-center gap-3 mb-4">

            <div>

              <h2 className="h5 mb-1">
                Fatture collegate
              </h2>

              <div className="small text-muted">
                Fatture clienti e fornitori attribuite alla commessa
              </div>

            </div>


            {access.canCreate && (

              <Link
                className="btn btn-sm btn-primary"
                href={`/fatture/new?project=${id}`}
              >
                <i className="bi bi-plus-lg me-1" />
                Nuova fattura
              </Link>

            )}

          </div>


          {invoices.length > 0 ? (

            <div className="table-responsive">

              <table className="table align-middle mb-0">

                <thead>

                  <tr>
                    <th>Tipo</th>
                    <th>Numero</th>
                    <th>Data</th>
                    <th>Controparte</th>
                    <th className="text-end">
                      Totale
                    </th>
                    <th className="text-end">
                      Quota commessa
                    </th>
                    <th>Stato</th>
                  </tr>

                </thead>


                <tbody>

                  {invoices.map((invoice) => (

                    <tr key={invoice.id}>

                      <td>
                        {invoice.invoice_type === "purchase"
                          ? "Fornitore"
                          : "Cliente"}
                      </td>

                      <td>

                        <Link
                          href={`/fatture/${invoice.id}`}
                          className="fw-medium"
                        >
                          {invoice.invoice_number}
                        </Link>

                      </td>

                      <td>
                        {formatDate(invoice.invoice_date)}
                      </td>

                      <td>
                        {invoice.customer_name || "—"}
                      </td>

                      <td className="text-end">
                        {money(
                          invoice.amount_total,
                          invoice.currency
                        )}
                      </td>

                      <td className="text-end">

                        {attributedAmounts.has(invoice.id)
                          ? money(
                              attributedAmounts.get(
                                invoice.id
                              )!,
                              invoice.currency
                            )
                          : "—"}

                      </td>

                      <td>

                        <StatusBadge
                          domain="invoice"
                          status={invoice.status}
                        />

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          ) : (

            <EmptyState
              icon="bi-receipt"
              title="Nessuna fattura"
            >
              Non risultano fatture collegate alla commessa.
            </EmptyState>

          )}

        </div>

      )}


      {/* ======================================================
          TAB: SCADENZE
      ======================================================= */}

      {activeTab === "deadlines" && (

        <div className="app-card p-4">

          <div className="d-flex justify-content-between align-items-center gap-3 mb-4">

            <div>

              <h2 className="h5 mb-1">
                Scadenze
              </h2>

              <div className="small text-muted">
                Scadenze amministrative e operative della commessa
              </div>

            </div>


            {canCreateDeadline && (

              <Link
                className="btn btn-sm btn-primary"
                href={`/scadenze/new?project=${id}&entity=${
                  project.legal_entity_id || ""
                }`}
              >
                <i className="bi bi-plus-lg me-1" />
                Nuova scadenza
              </Link>

            )}

          </div>


          {deadlines.rows.length > 0 ? (

            <div className="table-responsive">

              <table className="table align-middle mb-0">

                <thead>

                  <tr>
                    <th>Scadenza</th>
                    <th>Data</th>
                    <th>Stato</th>
                    <th />
                  </tr>

                </thead>


                <tbody>

                  {deadlines.rows.map((deadline) => {

                    const href = deadline.invoice_id
                      ? `/fatture/${deadline.invoice_id}`
                      : `/scadenze/${deadline.id.replace(
                          "manual:",
                          ""
                        )}`;

                    return (
                      <tr key={deadline.id}>

                        <td className="fw-medium">
                          {deadline.title}
                        </td>

                        <td>
                          {formatDate(deadline.due_date)}
                        </td>

                        <td>
                          <StatusBadge
                            domain="deadline"
                            status={deadline.temporal_status}
                          />
                        </td>

                        <td className="text-end">

                          <Link
                            href={href}
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Apri
                          </Link>

                        </td>

                      </tr>
                    );

                  })}

                </tbody>

              </table>

            </div>

          ) : (

            <EmptyState
              icon="bi-calendar-check"
              title="Nessuna scadenza"
            >
              Non risultano scadenze collegate alla commessa.
            </EmptyState>

          )}

        </div>

      )}

    </>
  );
}


// ============================================================
// TAB LINK
// ============================================================

function ProjectTabLink({
  id,
  tab,
  activeTab,
  icon,
  count,
  children,
}: {
  id: string;
  tab: ProjectTab;
  activeTab: ProjectTab;
  icon: string;
  count?: number;
  children: React.ReactNode;
}) {
  const active = tab === activeTab;

  return (
    <Link
      href={`/commesse/${id}?tab=${tab}`}
      className={`nav-link ${
        active ? "active" : ""
      }`}
      aria-current={active ? "page" : undefined}
    >

      <i
        className={`bi ${icon} me-2`}
        aria-hidden="true"
      />

      {children}

      {count !== undefined && (
        <span className="badge text-bg-secondary ms-2">
          {count}
        </span>
      )}

    </Link>
  );
}


// ============================================================
// PROJECT INFO
// ============================================================

function ProjectInfo({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="col-md-6">

      <InfoLabel
        icon={icon}
        label={label}
      />

      <div className="fw-medium">
        {value || "—"}
      </div>

    </div>
  );
}


function InfoLabel({
  icon,
  label,
}: {
  icon: string;
  label: string;
}) {
  return (
    <div className="small text-muted mb-1">

      <i
        className={`bi ${icon} me-2`}
        aria-hidden="true"
      />

      {label}

    </div>
  );
}


// ============================================================
// OVERVIEW ROW
// ============================================================

function OverviewRow({
  icon,
  label,
  value,
  href,
  important = false,
}: {
  icon: string;
  label: string;
  value: number;
  href: string;
  important?: boolean;
}) {
  return (
    <Link
      href={href}
      className="d-flex justify-content-between align-items-center gap-3 py-3 border-bottom text-decoration-none"
    >

      <div className="d-flex align-items-center gap-3">

        <i
          className={`bi ${icon} ${
            important ? "text-danger" : "text-muted"
          }`}
          aria-hidden="true"
        />

        <span className="text-body">
          {label}
        </span>

      </div>

      <span
        className={
          important
            ? "fw-semibold text-danger"
            : "fw-semibold text-body"
        }
      >
        {value}
      </span>

    </Link>
  );
}


// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center py-5">

      <i
        className={`bi ${icon} fs-3 text-muted`}
        aria-hidden="true"
      />

      <div className="fw-medium mt-2">
        {title}
      </div>

      <div className="small text-muted mt-1">
        {children}
      </div>

    </div>
  );
}
