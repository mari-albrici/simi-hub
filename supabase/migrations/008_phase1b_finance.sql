-- Fase 1B: movimenti finanziari, allocazioni e conti. Additivo.
BEGIN;
CREATE TABLE IF NOT EXISTS public.financial_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id), name text NOT NULL,
 iban text, currency text NOT NULL DEFAULT 'EUR', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.financial_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), direction text NOT NULL CHECK(direction IN ('payment','receipt')),
 legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id), counterparty_id uuid REFERENCES public.companies(id), movement_date date NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount<1000000000000), currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),
 payment_method text, reference text, account_id uuid REFERENCES public.financial_accounts(id), notes text, created_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.financial_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), movement_id uuid NOT NULL REFERENCES public.financial_movements(id) ON DELETE CASCADE,
 invoice_id uuid NOT NULL REFERENCES public.invoices(id), installment_id uuid REFERENCES public.invoice_installments(id), amount numeric(14,2) NOT NULL CHECK(amount>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_movements_date ON public.financial_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_financial_movements_entity ON public.financial_movements(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_financial_movements_counterparty ON public.financial_movements(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_financial_allocations_invoice ON public.financial_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_financial_allocations_installment ON public.financial_allocations(installment_id);
CREATE INDEX IF NOT EXISTS idx_financial_allocations_movement ON public.financial_allocations(movement_id);
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY; ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY; ALTER TABLE public.financial_allocations ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.financial_accounts,public.financial_movements,public.financial_allocations TO authenticated;
CREATE POLICY finance_accounts_read ON public.financial_accounts FOR SELECT TO authenticated USING(public.app_has_permission('invoice.read'));
CREATE POLICY finance_accounts_write ON public.financial_accounts FOR ALL TO authenticated USING(public.app_has_permission('invoice.update')) WITH CHECK(public.app_has_permission('invoice.update'));
CREATE POLICY finance_movements_read ON public.financial_movements FOR SELECT TO authenticated USING(public.app_has_permission('invoice.read'));
CREATE POLICY finance_allocations_read ON public.financial_allocations FOR SELECT TO authenticated USING(public.app_has_permission('invoice.read'));
CREATE OR REPLACE FUNCTION public.validate_financial_allocation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.financial_movements; i public.invoices; inst public.invoice_installments; used numeric;
BEGIN
 SELECT * INTO m FROM public.financial_movements WHERE id=NEW.movement_id AND archived_at IS NULL;
 SELECT * INTO i FROM public.invoices WHERE id=NEW.invoice_id AND archived_at IS NULL;
 IF m.id IS NULL OR i.id IS NULL OR m.legal_entity_id<>i.legal_entity_id OR NEW.amount<=0 THEN RAISE EXCEPTION 'Invalid financial allocation' USING ERRCODE='23514'; END IF;
 IF (m.direction='payment' AND i.invoice_type<>'purchase') OR (m.direction='receipt' AND i.invoice_type<>'sale') THEN RAISE EXCEPTION 'Direction incompatible with invoice' USING ERRCODE='23514'; END IF;
 IF m.counterparty_id IS NOT NULL AND m.counterparty_id IS DISTINCT FROM (CASE WHEN i.invoice_type='purchase' THEN i.supplier_id ELSE i.customer_id END) THEN RAISE EXCEPTION 'Counterparty incompatible' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(sum(amount),0) INTO used FROM public.financial_allocations WHERE movement_id=NEW.movement_id AND id<>NEW.id;
 IF used+NEW.amount>m.amount THEN RAISE EXCEPTION 'Allocation exceeds movement' USING ERRCODE='23514'; END IF;
 IF NEW.installment_id IS NOT NULL THEN SELECT * INTO inst FROM public.invoice_installments WHERE id=NEW.installment_id; IF inst.id IS NULL OR inst.invoice_id<>NEW.invoice_id THEN RAISE EXCEPTION 'Installment incompatible' USING ERRCODE='23514'; END IF; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.validate_financial_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.id=NEW.account_id AND a.legal_entity_id=NEW.legal_entity_id AND a.active) THEN RAISE EXCEPTION 'Account incompatible' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_financial_allocations_validate BEFORE INSERT OR UPDATE ON public.financial_allocations FOR EACH ROW EXECUTE FUNCTION public.validate_financial_allocation();
CREATE TRIGGER trg_financial_movement_validate BEFORE INSERT OR UPDATE ON public.financial_movements FOR EACH ROW EXECUTE FUNCTION public.validate_financial_movement();
CREATE TRIGGER trg_financial_accounts_updated BEFORE UPDATE ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_financial_movements_updated BEFORE UPDATE ON public.financial_movements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_financial_allocations_updated BEFORE UPDATE ON public.financial_allocations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE VIEW public.invoice_financial_summary AS
SELECT i.id AS invoice_id,i.amount_total AS invoice_total,COALESCE(sum(CASE WHEN m.archived_at IS NULL THEN a.amount ELSE 0 END),0) AS allocated_total,
 GREATEST(i.amount_total-COALESCE(sum(CASE WHEN m.archived_at IS NULL THEN a.amount ELSE 0 END),0),0) AS residual
FROM public.invoices i LEFT JOIN public.financial_allocations a ON a.invoice_id=i.id LEFT JOIN public.financial_movements m ON m.id=a.movement_id GROUP BY i.id,i.amount_total;
GRANT SELECT ON public.invoice_financial_summary TO authenticated;
CREATE OR REPLACE FUNCTION public.save_financial_movement(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE movement_id uuid:=NULLIF(payload->>'id','')::uuid; m public.financial_movements; item jsonb; alloc_id uuid; allocated numeric:=0;
BEGIN
 IF NOT public.app_has_permission('invoice.update') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF movement_id IS NULL THEN INSERT INTO public.financial_movements(direction,legal_entity_id,counterparty_id,movement_date,amount,currency,payment_method,reference,account_id,notes,created_by)
 VALUES(payload->>'direction',(payload->>'legal_entity_id')::uuid,NULLIF(payload->>'counterparty_id','')::uuid,(payload->>'movement_date')::date,(payload->>'amount')::numeric,upper(payload->>'currency'),NULLIF(payload->>'payment_method',''),NULLIF(payload->>'reference',''),NULLIF(payload->>'account_id','')::uuid,NULLIF(payload->>'notes',''),auth.uid()) RETURNING id INTO movement_id;
 ELSE SELECT * INTO m FROM public.financial_movements WHERE id=movement_id AND archived_at IS NULL FOR UPDATE; IF m.id IS NULL THEN RAISE EXCEPTION 'Movement unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.financial_movements SET direction=payload->>'direction',legal_entity_id=(payload->>'legal_entity_id')::uuid,counterparty_id=NULLIF(payload->>'counterparty_id','')::uuid,movement_date=(payload->>'movement_date')::date,amount=(payload->>'amount')::numeric,currency=upper(payload->>'currency'),payment_method=NULLIF(payload->>'payment_method',''),reference=NULLIF(payload->>'reference',''),account_id=NULLIF(payload->>'account_id','')::uuid,notes=NULLIF(payload->>'notes','') WHERE id=movement_id; END IF;
 DELETE FROM public.financial_allocations WHERE movement_id=save_financial_movement.movement_id;
 FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'allocations','[]'::jsonb)) LOOP
   INSERT INTO public.financial_allocations(movement_id,invoice_id,installment_id,amount) VALUES(movement_id,(item->>'invoice_id')::uuid,NULLIF(item->>'installment_id','')::uuid,(item->>'amount')::numeric) RETURNING amount INTO allocated; END LOOP;
 RETURN movement_id;
END $$;
REVOKE ALL ON FUNCTION public.save_financial_movement(jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.save_financial_movement(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.archive_financial_movement(movement uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT public.app_has_permission('invoice.delete') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; UPDATE public.financial_movements SET archived_at=now() WHERE id=movement AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Movement unavailable' USING ERRCODE='42501'; END IF; END $$;
REVOKE ALL ON FUNCTION public.archive_financial_movement(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.archive_financial_movement(uuid) TO authenticated;
CREATE TRIGGER audit_financial_movements AFTER INSERT OR UPDATE OR DELETE ON public.financial_movements FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_financial_allocations AFTER INSERT OR UPDATE OR DELETE ON public.financial_allocations FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
COMMIT;
