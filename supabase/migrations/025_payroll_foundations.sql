BEGIN;

-- ============================================================
-- SIMI HUB — PAYROLL / PAGHE
-- P0.1 — Fondamenta
-- ============================================================

-- ------------------------------------------------------------
-- 1. RBAC
-- Estende il sistema esistente senza sostituirlo.
--
-- admin          -> tutto, grazie al wildcard già esistente
-- administration -> gestione completa operativa paghe
-- hr             -> lettura e gestione paghe
-- management     -> SOLO riepiloghi aggregati, non importi
--                   individuali dei dipendenti
-- ------------------------------------------------------------

ALTER FUNCTION public.app_has_permission(text)
RENAME TO app_has_permission_before_payroll;

CREATE FUNCTION public.app_has_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.app_has_permission_before_payroll(permission)
    OR COALESCE(
      CASE
        WHEN permission = 'payroll.summary.read'
          THEN public.app_role() IN ('administration', 'management', 'hr')

        WHEN permission IN (
          'payroll.employee.read',
          'payroll.read',
          'payroll.create',
          'payroll.update',
          'payroll.import',
          'payroll.review',
          'payroll.close',
          'payroll.reopen',
          'payroll.tfr.read',
          'payroll.tfr.manage',
          'payroll.loans.read',
          'payroll.loans.manage',
          'payroll.accounting.read',
          'payroll.accounting.export'
        )
          THEN public.app_role() IN ('administration', 'hr')

        ELSE false
      END,
      false
    );
$$;

REVOKE ALL ON FUNCTION public.app_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_permission(text) TO authenticated;


-- ------------------------------------------------------------
-- 2. ELABORAZIONI MENSILI
-- Una elaborazione per società / anno / mese.
-- ------------------------------------------------------------

CREATE TABLE public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  legal_entity_id uuid NOT NULL
    REFERENCES public.legal_entities(id)
    ON DELETE RESTRICT,

  year integer NOT NULL
    CHECK (year BETWEEN 2000 AND 2100),

  month integer NOT NULL
    CHECK (month BETWEEN 1 AND 12),

  country text NOT NULL,

  status text NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'imported',
        'review',
        'reconciled',
        'closed',
        'reopened'
      )
    ),

  source text,
  notes text,

  currency text NOT NULL DEFAULT 'EUR'
    CHECK (char_length(currency) = 3),

  total_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_net numeric(14,2) NOT NULL DEFAULT 0,

  total_employer_contributions numeric(14,2)
    NOT NULL DEFAULT 0,

  total_employee_cost numeric(14,2)
    NOT NULL DEFAULT 0,

  total_debit numeric(14,2)
    NOT NULL DEFAULT 0,

  total_credit numeric(14,2)
    NOT NULL DEFAULT 0,

  difference numeric(14,2)
    NOT NULL DEFAULT 0,

  created_by uuid NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE RESTRICT,

  reviewed_by uuid
    REFERENCES public.profiles(id)
    ON DELETE RESTRICT,

  closed_by uuid
    REFERENCES public.profiles(id)
    ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  reviewed_at timestamptz,
  closed_at timestamptz,

  UNIQUE (legal_entity_id, year, month),

  CHECK (
    (reviewed_at IS NULL AND reviewed_by IS NULL)
    OR
    (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  ),

  CHECK (
    (closed_at IS NULL AND closed_by IS NULL)
    OR
    (closed_at IS NOT NULL AND closed_by IS NOT NULL)
  )
);

COMMENT ON TABLE public.payroll_runs IS
  'Elaborazioni mensili delle paghe per società SIMI.';

COMMENT ON COLUMN public.payroll_runs.country IS
  'Paese dell''elaborazione, ad esempio IT, FR, LU.';

COMMENT ON COLUMN public.payroll_runs.difference IS
  'Differenza contabile tra totale Dare e totale Avere.';


-- ------------------------------------------------------------
-- 3. DETTAGLIO MENSILE PER DIPENDENTE
-- Contiene i valori riepilogativi.
-- Le voci variabili saranno gestite successivamente tramite
-- payroll_entry_items.
-- ------------------------------------------------------------

CREATE TABLE public.payroll_employee_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  payroll_run_id uuid NOT NULL
    REFERENCES public.payroll_runs(id)
    ON DELETE RESTRICT,

  employee_id uuid NOT NULL
    REFERENCES public.employees(id)
    ON DELETE RESTRICT,

  gross_salary numeric(14,2) NOT NULL DEFAULT 0,
  other_salary_items numeric(14,2) NOT NULL DEFAULT 0,

  social_security_base numeric(14,2) NOT NULL DEFAULT 0,

  net_salary numeric(14,2) NOT NULL DEFAULT 0,

  employer_contributions numeric(14,2)
    NOT NULL DEFAULT 0,

  employee_contributions numeric(14,2)
    NOT NULL DEFAULT 0,

  tfr_accrual numeric(14,2)
    NOT NULL DEFAULT 0,

  tfr_inps numeric(14,2)
    NOT NULL DEFAULT 0,

  tfr_recovery numeric(14,2)
    NOT NULL DEFAULT 0,

  reimbursements numeric(14,2)
    NOT NULL DEFAULT 0,

  sickness numeric(14,2)
    NOT NULL DEFAULT 0,

  accident numeric(14,2)
    NOT NULL DEFAULT 0,

  holidays numeric(14,2)
    NOT NULL DEFAULT 0,

  leave_amount numeric(14,2)
    NOT NULL DEFAULT 0,

  income_tax numeric(14,2)
    NOT NULL DEFAULT 0,

  tax_adjustments numeric(14,2)
    NOT NULL DEFAULT 0,

  tax_refund_730 numeric(14,2)
    NOT NULL DEFAULT 0,

  supplementary_treatment numeric(14,2)
    NOT NULL DEFAULT 0,

  pension_fund_employee numeric(14,2)
    NOT NULL DEFAULT 0,

  pension_fund_employer numeric(14,2)
    NOT NULL DEFAULT 0,

  loan_deductions numeric(14,2)
    NOT NULL DEFAULT 0,

  fifth_assignment_deductions numeric(14,2)
    NOT NULL DEFAULT 0,

  other_earnings numeric(14,2)
    NOT NULL DEFAULT 0,

  other_deductions numeric(14,2)
    NOT NULL DEFAULT 0,

  company_cost numeric(14,2)
    NOT NULL DEFAULT 0,

  worked_hours numeric(10,2)
    NOT NULL DEFAULT 0
    CHECK (worked_hours >= 0),

  allocation_hours numeric(10,2)
    NOT NULL DEFAULT 0
    CHECK (allocation_hours >= 0),

  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'complete',
        'warning',
        'verified'
      )
    ),

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (payroll_run_id, employee_id)
);

COMMENT ON TABLE public.payroll_employee_entries IS
  'Riepilogo mensile delle voci paga per singolo dipendente.';


-- ------------------------------------------------------------
-- 4. TIPI DI VOCE PAGA
--
-- Non hardcodiamo tutte le possibili voci nelle colonne:
-- questa tabella permetterà IT / FR / LU e nuove voci future.
-- ------------------------------------------------------------

CREATE TABLE public.payroll_item_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  code text NOT NULL,
  name text NOT NULL,

  country text,

  description text,

  affects_company_cost boolean NOT NULL DEFAULT false,
  affects_net boolean NOT NULL DEFAULT false,

  allocatable_to_project boolean NOT NULL DEFAULT false,

  default_debit_account text,
  default_credit_account text,

  active boolean NOT NULL DEFAULT true,

  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (code, country)
);

COMMENT ON TABLE public.payroll_item_types IS
  'Catalogo configurabile delle voci paga per paese.';


-- ------------------------------------------------------------
-- 5. VOCI PAGA DEL SINGOLO DIPENDENTE
-- ------------------------------------------------------------

CREATE TABLE public.payroll_entry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  employee_entry_id uuid NOT NULL
    REFERENCES public.payroll_employee_entries(id)
    ON DELETE RESTRICT,

  item_type_id uuid NOT NULL
    REFERENCES public.payroll_item_types(id)
    ON DELETE RESTRICT,

  amount numeric(14,2) NOT NULL DEFAULT 0,

  quantity numeric(14,4),

  rate numeric(14,4),

  source text,
  source_reference text,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ------------------------------------------------------------
-- 6. INDICI
-- ------------------------------------------------------------

CREATE INDEX payroll_runs_period_idx
  ON public.payroll_runs(year, month);

CREATE INDEX payroll_runs_entity_idx
  ON public.payroll_runs(legal_entity_id, year DESC, month DESC);

CREATE INDEX payroll_runs_status_idx
  ON public.payroll_runs(status);

CREATE INDEX payroll_employee_entries_run_idx
  ON public.payroll_employee_entries(payroll_run_id);

CREATE INDEX payroll_employee_entries_employee_idx
  ON public.payroll_employee_entries(employee_id);

CREATE INDEX payroll_entry_items_entry_idx
  ON public.payroll_entry_items(employee_entry_id);

CREATE INDEX payroll_entry_items_type_idx
  ON public.payroll_entry_items(item_type_id);


-- ------------------------------------------------------------
-- 7. updated_at
-- Riutilizziamo la funzione già esistente in SIMI Hub.
-- ------------------------------------------------------------

CREATE TRIGGER payroll_runs_updated_at
BEFORE UPDATE ON public.payroll_runs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER payroll_employee_entries_updated_at
BEFORE UPDATE ON public.payroll_employee_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER payroll_item_types_updated_at
BEFORE UPDATE ON public.payroll_item_types
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER payroll_entry_items_updated_at
BEFORE UPDATE ON public.payroll_entry_items
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- ------------------------------------------------------------
-- 8. RLS
--
-- In questa fase consentiamo SOLO SELECT diretto.
-- Le scritture arriveranno successivamente tramite RPC
-- SECURITY DEFINER, seguendo lo stesso principio già utilizzato
-- dal modulo finanziario di SIMI Hub.
-- ------------------------------------------------------------

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_employee_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_item_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entry_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON public.payroll_runs,
   public.payroll_employee_entries,
   public.payroll_item_types,
   public.payroll_entry_items
FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- Payroll run:
-- contiene totali aggregati ma non il dettaglio individuale.
-- ------------------------------------------------------------

GRANT SELECT
ON public.payroll_runs
TO authenticated;

CREATE POLICY payroll_runs_read
ON public.payroll_runs
FOR SELECT
TO authenticated
USING (
  public.app_has_permission('payroll.summary.read')
);


-- ------------------------------------------------------------
-- Dettaglio individuale:
-- più restrittivo.
-- ------------------------------------------------------------

GRANT SELECT
ON public.payroll_employee_entries
TO authenticated;

CREATE POLICY payroll_employee_entries_read
ON public.payroll_employee_entries
FOR SELECT
TO authenticated
USING (
  public.app_has_permission('payroll.employee.read')
);


GRANT SELECT
ON public.payroll_entry_items
TO authenticated;

CREATE POLICY payroll_entry_items_read
ON public.payroll_entry_items
FOR SELECT
TO authenticated
USING (
  public.app_has_permission('payroll.employee.read')
);


-- ------------------------------------------------------------
-- Catalogo voci:
-- leggibile da chi può lavorare sulle paghe.
-- ------------------------------------------------------------

GRANT SELECT
ON public.payroll_item_types
TO authenticated;

CREATE POLICY payroll_item_types_read
ON public.payroll_item_types
FOR SELECT
TO authenticated
USING (
  public.app_has_permission('payroll.read')
);


-- ------------------------------------------------------------
-- 9. AUDIT
--
-- Riutilizziamo audit_mutation() già presente.
-- ------------------------------------------------------------

CREATE TRIGGER audit_payroll_runs
AFTER INSERT OR UPDATE OR DELETE
ON public.payroll_runs
FOR EACH ROW
EXECUTE FUNCTION public.audit_mutation();

CREATE TRIGGER audit_payroll_employee_entries
AFTER INSERT OR UPDATE OR DELETE
ON public.payroll_employee_entries
FOR EACH ROW
EXECUTE FUNCTION public.audit_mutation();

CREATE TRIGGER audit_payroll_item_types
AFTER INSERT OR UPDATE OR DELETE
ON public.payroll_item_types
FOR EACH ROW
EXECUTE FUNCTION public.audit_mutation();

CREATE TRIGGER audit_payroll_entry_items
AFTER INSERT OR UPDATE OR DELETE
ON public.payroll_entry_items
FOR EACH ROW
EXECUTE FUNCTION public.audit_mutation();


-- ------------------------------------------------------------
-- 10. VOCI BASE
-- NULL country = voce comune a tutti i paesi.
-- Le specifiche FR / LU verranno aggiunte quando avremo
-- confermato le regole con la collega.
-- ------------------------------------------------------------

INSERT INTO public.payroll_item_types
(
  code,
  name,
  country,
  affects_company_cost,
  affects_net,
  allocatable_to_project,
  sort_order
)
VALUES

('GROSS_SALARY',
 'Retribuzione lorda',
 NULL,
 true,
 false,
 true,
 10),

('OTHER_SALARY',
 'Altre voci retributive',
 NULL,
 true,
 false,
 true,
 20),

('NET_PAY',
 'Netto dipendente',
 NULL,
 false,
 true,
 false,
 30),

('EMPLOYER_CONTRIBUTIONS',
 'Contributi a carico azienda',
 NULL,
 true,
 false,
 true,
 40),

('EMPLOYEE_CONTRIBUTIONS',
 'Contributi a carico dipendente',
 NULL,
 false,
 true,
 false,
 50),

('TFR_ACCRUAL',
 'Accantonamento TFR',
 NULL,
 true,
 false,
 true,
 60),

('TFR_INPS',
 'TFR Fondo Tesoreria INPS',
 'IT',
 false,
 false,
 false,
 70),

('TFR_RECOVERY',
 'Recupero TFR',
 'IT',
 false,
 false,
 false,
 80),

('MILEAGE_REIMBURSEMENT',
 'Rimborso chilometrico',
 NULL,
 true,
 true,
 true,
 90),

('SICKNESS',
 'Malattia',
 NULL,
 false,
 false,
 true,
 100),

('ACCIDENT',
 'Infortunio',
 NULL,
 false,
 false,
 true,
 110),

('HOLIDAY',
 'Ferie',
 NULL,
 false,
 false,
 true,
 120),

('LEAVE',
 'Permessi',
 NULL,
 false,
 false,
 true,
 130),

('INCOME_TAX',
 'Imposta sul reddito',
 NULL,
 false,
 true,
 false,
 140),

('TAX_REFUND_730',
 'Rimborso 730',
 'IT',
 false,
 true,
 false,
 150),

('SUPPLEMENTARY_TREATMENT',
 'Trattamento integrativo',
 'IT',
 false,
 true,
 false,
 160),

('PENSION_FUND_EMPLOYEE',
 'Fondo pensione - quota dipendente',
 NULL,
 false,
 true,
 false,
 170),

('PENSION_FUND_EMPLOYER',
 'Fondo pensione - quota azienda',
 NULL,
 true,
 false,
 true,
 180),

('LOAN',
 'Prestito dipendente',
 NULL,
 false,
 true,
 false,
 190),

('FIFTH_ASSIGNMENT',
 'Cessione del quinto',
 'IT',
 false,
 true,
 false,
 200),

('OTHER_EARNING',
 'Altra competenza',
 NULL,
 false,
 true,
 false,
 900),

('OTHER_DEDUCTION',
 'Altra trattenuta',
 NULL,
 false,
 true,
 false,
 910);

COMMIT;