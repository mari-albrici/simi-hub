export const APP_NAME = "SIMI Hub";

export const ALLOWED_EMAIL_DOMAINS = ["simisrl.eu"];

export const DEFAULT_ROLES = ["admin", "administration", "management", "project_manager", "technical", "viewer", "hr"] as const;

// Mirrored by app_has_permission() in migration 004; parity is tested.
export const PERMISSION_MATRIX: Record<string, string[]> = {
  admin: ["project.read", "project.create", "project.update", "project.delete", "document.read", "document.upload", "document.update", "document.delete", "invoice.read", "invoice.create", "invoice.update", "invoice.delete", "company.read", "company.create", "company.update", "company.delete", "employee.read", "employee.update", "admin.users", "admin.settings", "legal_entity.read", "legal_entity.create", "deadline.read", "deadline.write", "dashboard.read", "report.read", "profile.directory"],
  administration: ["project.read", "project.create", "project.update", "document.read", "document.upload", "document.update", "invoice.read", "invoice.create", "invoice.update", "company.read", "company.create", "company.update", "legal_entity.read", "deadline.read", "deadline.write", "dashboard.read", "report.read", "profile.directory", "legal_entity.create", "order.read", "order.create", "order.update", "delivery_note.read", "delivery_note.create", "delivery_note.update", "offer.read", "offer.create", "offer.update", "offer.archive", "contract.read", "contract.create", "contract.update", "contract.archive"],
  management: ["project.read", "document.read", "invoice.read", "company.read", "legal_entity.read", "deadline.read", "dashboard.read", "report.read", "profile.directory", "order.read", "delivery_note.read", "offer.read", "contract.read"],
  project_manager: ["project.read", "project.create", "project.update", "document.read", "document.upload", "document.update", "invoice.read", "company.read", "legal_entity.read", "deadline.read", "dashboard.read", "profile.directory", "deadline.write", "order.read", "order.create", "order.update", "delivery_note.read", "delivery_note.create", "delivery_note.update", "offer.read", "offer.create", "offer.update", "offer.archive", "contract.read", "contract.create", "contract.update", "contract.archive"],
  technical: ["project.read", "project.update", "document.read", "document.upload", "document.update", "company.read", "legal_entity.read", "deadline.read", "profile.directory", "order.read", "delivery_note.read", "offer.read", "contract.read"],
  viewer: ["project.read", "document.read", "invoice.read", "company.read", "legal_entity.read", "deadline.read", "dashboard.read", "report.read", "profile.directory", "offer.read", "contract.read"],
  hr: ["project.read", "document.read", "document.upload", "document.update", "employee.read", "employee.update", "legal_entity.read", "deadline.read", "deadline.write", "profile.directory"],
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
  { code: "SIMI-IT", business_name: "SIMI S.r.l." },
  { code: "SIMI-FR", business_name: "SIMI Francia" },
  { code: "SIMI-LU", business_name: "SIMI Luxembourg" },
];

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },

  { label: "Commesse", href: "/commesse" },

  { label: "Ordini", href: "/ordini" },

  { label: "DDT", href: "/ddt" },

  { label: "Documenti", href: "/documenti" },

  { label: "Fatture", href: "/fatture" },
  
  { label: "Paghe", href: "/paghe" },

  { label: "Pagamenti / Incassi", href: "/pagamenti" },

  { label: "Clienti", href: "/clienti" },

  { label: "Fornitori", href: "/fornitori" },

  { label: "Attività", href: "/attivita" },

  { label: "Scadenze", href: "/scadenze" },

  { label: "Anomalie", href: "/anomalie" },

  { label: "Personale", href: "/personale" },

  { label: "Guide e Procedure", href: "/guide" },

  { label: "Società SIMI", href: "/aziende" },
  
  { label: "Guide e Procedure", href: "/guide" },

  { label: "Report", href: "/report" },

  { label: "Impostazioni", href: "/impostazioni" },
];