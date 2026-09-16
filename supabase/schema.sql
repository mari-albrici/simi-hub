CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text,
  last_name text,
  role text NOT NULL DEFAULT 'viewer',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  country text,
  city text,
  address text,
  customer_id uuid,
  status text NOT NULL DEFAULT 'draft',
  opening_date date,
  expected_closing_date date,
  closing_date date,
  project_manager_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  business_name text NOT NULL,
  country text,
  vat_number text,
  tax_code text,
  address text,
  city text,
  postal_code text,
  email text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_type text NOT NULL CHECK (company_type IN ('customer','supplier','both')),
  business_name text NOT NULL,
  short_name text,
  vat_number text,
  tax_code text,
  country text,
  address text,
  postal_code text,
  city text,
  province text,
  email text,
  pec text,
  phone text,
  website text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  role text,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename text NOT NULL,
  stored_filename text NOT NULL,
  storage_path text NOT NULL,
  title text,
  description text,
  category_id uuid REFERENCES public.document_categories(id),
  document_date date,
  expiry_date date,
  project_id uuid REFERENCES public.projects(id),
  company_id uuid REFERENCES public.companies(id),
  customer_id uuid REFERENCES public.companies(id),
  supplier_id uuid REFERENCES public.companies(id),
  employee_id uuid,
  status text NOT NULL DEFAULT 'draft',
  mime_type text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_type text NOT NULL CHECK (invoice_type IN ('purchase','sale')),
  invoice_number text NOT NULL,
  invoice_date date,
  received_date date,
  supplier_id uuid REFERENCES public.companies(id),
  customer_id uuid REFERENCES public.companies(id),
  legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id),
  project_id uuid REFERENCES public.projects(id),
  amount_net numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount_total numeric(14,2) NOT NULL DEFAULT 0,
  due_date date,
  payment_date date,
  status text NOT NULL DEFAULT 'to_register',
  document_id uuid REFERENCES public.documents(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  due_date date NOT NULL,
  due_time time,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  project_id uuid REFERENCES public.projects(id),
  document_id uuid REFERENCES public.documents(id),
  invoice_id uuid REFERENCES public.invoices(id),
  company_id uuid REFERENCES public.companies(id),
  employee_id uuid,
  legal_entity_id uuid REFERENCES public.legal_entities(id),
  assigned_to uuid REFERENCES auth.users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  employee_code text,
  role_title text,
  legal_entity_id uuid REFERENCES public.legal_entities(id),
  email text,
  phone text,
  hire_date date,
  termination_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_document_categories_updated_at
BEFORE UPDATE ON public.document_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_legal_entities_updated_at
BEFORE UPDATE ON public.legal_entities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_company_contacts_updated_at
BEFORE UPDATE ON public.company_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_deadlines_updated_at
BEFORE UPDATE ON public.deadlines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_projects_project_code ON public.projects(project_code);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON public.projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON public.projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_opening_date ON public.projects(opening_date);
CREATE INDEX IF NOT EXISTS idx_document_categories_code ON public.document_categories(code);
CREATE INDEX IF NOT EXISTS idx_documents_document_date ON public.documents(document_date);
CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON public.documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON public.documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_company_id ON public.documents(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON public.invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON public.deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_status ON public.deadlines(status);
CREATE INDEX IF NOT EXISTS idx_companies_business_name ON public.companies(business_name);
CREATE INDEX IF NOT EXISTS idx_legal_entities_business_name ON public.legal_entities(business_name);
CREATE INDEX IF NOT EXISTS idx_employees_last_name ON public.employees(last_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role, active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'last_name',
    'viewer',
    TRUE
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
      last_name = EXCLUDED.last_name,
      updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'administration')
  )
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "all_authenticated_read" ON public.projects
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_modify" ON public.projects
FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_read_companies" ON public.companies
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_modify_companies" ON public.companies
FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_read_documents" ON public.documents
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_modify_documents" ON public.documents
FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_read_invoices" ON public.invoices
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_modify_invoices" ON public.invoices
FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_read_deadlines" ON public.deadlines
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_modify_deadlines" ON public.deadlines
FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_read_activity_logs" ON public.activity_logs
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "all_authenticated_insert_activity_logs" ON public.activity_logs
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

INSERT INTO public.legal_entities (code, business_name, country, email, phone, active)
VALUES
  ('SIMI-IT', 'SIMI Italia', 'Italia', 'info@simi.it', '+39 02 5555 1234', true),
  ('SIMI-FR', 'SIMI Francia', 'Francia', 'info@fr.simi.it', '+33 1 5555 9876', true),
  ('SIMI-LU', 'SIMI Luxembourg', 'Luxembourg', 'info@lu.simi.it', '+352 5555 4321', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.document_categories (code, name, description, sort_order, active)
VALUES
  ('00', 'Anagrafica commessa', 'Informazioni generali della commessa', 1, true),
  ('01', 'Contratti e Ordini', 'Contratti, ordini e documenti di riferimento', 2, true),
  ('02', 'Offerte e Preventivi', 'Offerte e preventivi commerciali', 3, true),
  ('03', 'Corrispondenza', 'Mail, lettere e scambi documentali', 4, true),
  ('04', 'Documentazione Tecnica', 'Disegni, schemi e documentazione tecnica', 5, true),
  ('05', 'Fornitori e Acquisti', 'Documenti relativi ai fornitori e agli acquisti', 6, true),
  ('06', 'DDT e Logistica', 'DDT, consegne e documenti logistici', 7, true),
  ('07', 'Fatture e Contabilità', 'Fatture, ricevute e documenti contabili', 8, true),
  ('08', 'Certificati e Dichiarazioni', 'Certificati e dichiarazioni', 9, true)
ON CONFLICT (code) DO NOTHING;
