-- Righe fattura, rate di pagamento, collegamento con più commesse, metodo di pagamento e IBAN.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_exempt_reason text;

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2),
  vat_exempt_reason text,
  amount_net numeric(14,2) NOT NULL DEFAULT 0,
  amount_vat numeric(14,2) NOT NULL DEFAULT 0,
  amount_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Una fattura può riferirsi a più commesse (molti-a-molti); projects.id resta anche come FK
-- singola legacy su invoices.project_id per compatibilità con il codice esistente.
CREATE TABLE IF NOT EXISTS public.invoice_projects (
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (invoice_id, project_id)
);

CREATE TABLE IF NOT EXISTS public.invoice_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_invoice_lines_updated_at BEFORE UPDATE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_invoice_installments_updated_at BEFORE UPDATE ON public.invoice_installments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_invoice_lines" ON public.invoice_lines FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_all_invoice_lines" ON public.invoice_lines FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_invoice_projects" ON public.invoice_projects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_all_invoice_projects" ON public.invoice_projects FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_invoice_installments" ON public.invoice_installments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_all_invoice_installments" ON public.invoice_installments FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
