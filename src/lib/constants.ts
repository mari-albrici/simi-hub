export const APP_NAME = "SIMI Hub";

export const ALLOWED_EMAIL_DOMAINS = ["simisrl.eu"];

export const DEFAULT_ROLES = [
  "admin",
  "administration",
  "management",
  "project_manager",
  "technical",
  "viewer",
] as const;

export const PERMISSION_MATRIX: Record<string, string[]> = {
  admin: [
    "project.read",
    "project.create",
    "project.update",
    "project.delete",
    "document.read",
    "document.upload",
    "document.update",
    "document.delete",
    "invoice.read",
    "invoice.create",
    "invoice.update",
    "invoice.delete",
    "company.read",
    "company.update",
    "employee.read",
    "employee.update",
    "admin.users",
    "admin.settings",
  ],
  administration: [
    "project.read",
    "project.create",
    "project.update",
    "document.read",
    "document.upload",
    "document.update",
    "invoice.read",
    "invoice.create",
    "invoice.update",
    "company.read",
    "company.update",
    "employee.read",
  ],
  management: [
    "project.read",
    "document.read",
    "invoice.read",
    "company.read",
    "employee.read",
  ],
  project_manager: [
    "project.read",
    "project.create",
    "project.update",
    "document.read",
    "document.upload",
    "document.update",
    "invoice.read",
    "company.read",
  ],
  technical: [
    "project.read",
    "project.update",
    "document.read",
    "document.upload",
    "document.update",
    "document.delete",
    "company.read",
  ],
  viewer: ["project.read", "document.read", "invoice.read", "company.read", "employee.read"],
};

export const DOCUMENT_CATEGORIES = [
  { code: "00", name: "Anagrafica commessa" },
  { code: "01", name: "Contratti e Ordini" },
  { code: "02", name: "Offerte e Preventivi" },
  { code: "03", name: "Corrispondenza" },
  { code: "04", name: "Documentazione Tecnica" },
  { code: "05", name: "Fornitori e Acquisti" },
  { code: "06", name: "DDT e Logistica" },
  { code: "07", name: "Fatture e Contabilità" },
  { code: "08", name: "Certificati e Dichiarazioni" },
];

export const LEGAL_ENTITIES = [
  { code: "SIMI-IT", business_name: "SIMI Italia" },
  { code: "SIMI-FR", business_name: "SIMI Francia" },
  { code: "SIMI-LU", business_name: "SIMI Luxembourg" },
];

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Commesse", href: "/commesse" },
  { label: "Documenti", href: "/documenti" },
  { label: "Fatture", href: "/fatture" },
  { label: "Clienti", href: "/clienti" },
  { label: "Fornitori", href: "/fornitori" },
  { label: "Scadenze", href: "/scadenze" },
  { label: "Personale", href: "/personale" },
  { label: "Aziende SIMI", href: "/aziende" },
  { label: "Report", href: "/report" },
  { label: "Impostazioni", href: "/impostazioni" },
];
