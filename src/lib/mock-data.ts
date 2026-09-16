import type { DashboardCard, ProjectSummary } from "@/types";

export const dashboardCards: DashboardCard[] = [
  { value: 12, label: "Fatture da registrare", tone: "warning" },
  { value: 7, label: "Fatture da pagare", tone: "primary" },
  { value: 3, label: "Anomalie", tone: "danger" },
  { value: 8, label: "Scadenze < 30 giorni", tone: "secondary" },
];

export let customers = [
  {
    id: "cust-001",
    business_name: "Cliente Demo Milano",
    company_type: "customer",
    vat_number: "IT12345678901",
    country: "Italia",
    city: "Milano",
    address: "Via Roma 12",
    email: "info@clientedemo.it",
    phone: "+39 02 1234 5678",
    active: true,
    contact_name: "Giovanni Bianchi",
  },
  {
    id: "cust-002",
    business_name: "Riviera s.r.l.",
    company_type: "customer",
    vat_number: "IT98765432109",
    country: "Italia",
    city: "Genova",
    address: "Piazza Acquario 8",
    email: "amministrazione@riviera.it",
    phone: "+39 010 456 3344",
    active: true,
    contact_name: "Elena Costa",
  },
  {
    id: "cust-003",
    business_name: "Adriatica Group",
    company_type: "customer",
    vat_number: "IT44556677890",
    country: "Italia",
    city: "Bologna",
    address: "Via Emilia 45",
    email: "ufficio@adriaticagroup.it",
    phone: "+39 051 332 1155",
    active: true,
    contact_name: "Matteo Righi",
  },
];

export let suppliers = [
  {
    id: "supp-001",
    business_name: "Fornitore Demo S.r.l.",
    company_type: "supplier",
    vat_number: "IT98765432109",
    country: "Italia",
    city: "Roma",
    address: "Via Torino 45",
    email: "amministrazione@fornitore-demo.it",
    phone: "+39 06 9876 5432",
    active: true,
    contact_name: "Rosalba Moretti",
  },
  {
    id: "supp-002",
    business_name: "Nord Tech Components",
    company_type: "supplier",
    vat_number: "IT11223344556",
    country: "Italia",
    city: "Torino",
    address: "Corso Luigi Einaudi 7",
    email: "sales@nordtech.it",
    phone: "+39 011 341 7777",
    active: true,
    contact_name: "Luca Neri",
  },
  {
    id: "supp-003",
    business_name: "Green Build S.A.",
    company_type: "supplier",
    vat_number: "FR22334455667",
    country: "Francia",
    city: "Marsiglia",
    address: "Rue de la Mer 21",
    email: "contact@greenbuild.fr",
    phone: "+33 4 555 909 10",
    active: false,
    contact_name: "Celine Dubois",
  },
];

export let projects: ProjectSummary[] = [
  {
    id: "1",
    project_code: "C1071",
    name: "Cimolai - MilanoSesto",
    customer_name: "Cimolai",
    country: "Italia",
    city: "Milano",
    status: "active",
    opening_date: "2026-09-01",
    project_manager_name: "Marco Bianchi",
  },
  {
    id: "2",
    project_code: "C1080",
    name: "Riviera - Genova",
    customer_name: "Riviera s.r.l.",
    country: "Italia",
    city: "Genova",
    status: "draft",
    opening_date: "2026-09-10",
    project_manager_name: "Laura Verdi",
  },
  {
    id: "3",
    project_code: "C1092",
    name: "Adriatica - Bologna",
    customer_name: "Adriatica Group",
    country: "Italia",
    city: "Bologna",
    status: "completed",
    opening_date: "2026-08-20",
    project_manager_name: "Giulia Rossi",
  },
];

export const recentActivity = [
  "Fattura 921 aggiornata in stato ANOMALIA",
  "Documento contratto caricato per C1071",
  "Scadenza “Rendiconto tecnico” completata",
  "Nuova commessa C1080 creata dal team amministrazione",
];

export const upcomingDeadlines = [
  { title: "Rendiconto tecnico", dueDate: "2026-09-18", status: "open" },
  { title: "Pagamento fornitore", dueDate: "2026-09-20", status: "open" },
  { title: "Consegna documenti clienti", dueDate: "2026-09-25", status: "open" },
];

export let invoices = [
  {
    id: "inv-001",
    invoice_number: "921",
    invoice_type: "purchase",
    status: "to_register",
    amount_total: 2450,
    invoice_date: "2026-09-16",
    due_date: "2026-09-25",
    customer_name: "Fornitore Demo S.r.l.",
    project_code: "C1071",
    company_name: "SIMI Italia",
  },
  {
    id: "inv-002",
    invoice_number: "2202",
    invoice_type: "sale",
    status: "to_pay",
    amount_total: 8200,
    invoice_date: "2026-09-15",
    due_date: "2026-09-30",
    customer_name: "Cliente Demo Milano",
    project_code: "C1071",
    company_name: "SIMI Italia",
  },
];
