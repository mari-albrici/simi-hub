-- Migration replay entry point for psql on an EMPTY Supabase database.
-- Authoritative definitions: supabase/migrations/*.sql. Prefer supabase db push.
-- Existing installations: apply only pending migrations, never replay this file.
\set ON_ERROR_STOP on
\ir migrations/001_init_schema.sql
\ir migrations/002_storage_documents_policies.sql
\ir migrations/003_invoice_details.sql
\ir migrations/004_phase0_foundations.sql
\ir migrations/005_phase0_invoice_transaction.sql
\ir migrations/006_phase0_document_storage.sql
\ir migrations/007_phase1a_invoice_fields.sql
\ir migrations/008_phase1b_finance.sql
\ir migrations/009_phase1c_deadlines.sql
\ir migrations/010_phase1d_documents.sql
\ir migrations/011_admin_role_wildcard.sql
\ir migrations/012_phase1e_projects.sql
\ir migrations/013_phase1f_orders_delivery_notes.sql
\ir migrations/014_phase1f_rbac.sql
\ir migrations/015_phase1f_completion.sql
\ir migrations/016_invoice_hotfix.sql
\ir migrations/017_phase1f2_offers_contracts.sql
\ir migrations/018_phase1g_relation_actions.sql
\ir migrations/019_phase2a_employees_hr.sql
\ir migrations/020_phase2a1_status_documents_entities.sql
\ir migrations/021_phase2a5_company_esolver.sql
\ir migrations/022_phase2b_work.sql
