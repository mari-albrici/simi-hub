BEGIN;

-- Extend the existing RBAC function, retaining all previous permissions.
ALTER FUNCTION public.app_has_permission(text)
  RENAME TO app_has_permission_before_management;
CREATE FUNCTION public.app_has_permission(permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.app_has_permission_before_management(permission)
    OR COALESCE(CASE
      WHEN permission = 'management.read'
        THEN public.app_role() IN ('administration', 'management')
      WHEN permission = 'management.update'
        THEN public.app_role() = 'administration'
      ELSE false
    END, false);
$$;
REVOKE ALL ON FUNCTION public.app_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_permission(text) TO authenticated;

CREATE TABLE public.management_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  allocated_amount numeric(14,2) NOT NULL
    CHECK (allocated_amount > 0 AND allocated_amount <> 'NaN'::numeric),
  allocation_method text NOT NULL DEFAULT 'manual'
    CHECK (allocation_method IN ('direct', 'manual')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, project_id)
);
-- The unique index above also indexes invoice_id as its leading column.
CREATE INDEX management_allocations_project_idx
  ON public.management_allocations(project_id);

ALTER TABLE public.management_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.management_allocations TO authenticated;
CREATE POLICY management_allocations_read ON public.management_allocations
  FOR SELECT TO authenticated USING (public.app_has_permission('management.read'));
CREATE POLICY management_allocations_insert ON public.management_allocations
  FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('management.update'));
CREATE POLICY management_allocations_update ON public.management_allocations
  FOR UPDATE TO authenticated USING (public.app_has_permission('management.update'))
  WITH CHECK (public.app_has_permission('management.update'));
CREATE POLICY management_allocations_delete ON public.management_allocations
  FOR DELETE TO authenticated USING (public.app_has_permission('management.update'));

-- Serialize every allocation mutation on its parent invoice, including DELETE.
-- NO KEY UPDATE remains compatible with foreign-key KEY SHARE locks.
-- At READ COMMITTED, the subsequent query in this volatile trigger sees commits
-- made while waiting. Reject snapshot isolation rather than validate a stale sum.
CREATE FUNCTION public.lock_management_allocation_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE old_invoice uuid; new_invoice uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Management allocations require READ COMMITTED isolation'
      USING ERRCODE = '40001';
  END IF;
  IF TG_OP <> 'INSERT' THEN old_invoice := OLD.invoice_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_invoice := NEW.invoice_id; END IF;
  PERFORM id FROM public.invoices
    WHERE id IN (old_invoice, new_invoice) ORDER BY id FOR NO KEY UPDATE;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE FUNCTION public.check_management_allocation_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE invoice_limit numeric; allocated numeric;
BEGIN
  SELECT abs(amount_total) INTO invoice_limit
    FROM public.invoices WHERE id = NEW.invoice_id;
  SELECT COALESCE(sum(allocated_amount), 0) INTO allocated
    FROM public.management_allocations WHERE invoice_id = NEW.invoice_id;
  IF invoice_limit = 'NaN'::numeric OR allocated > invoice_limit THEN
    RAISE EXCEPTION 'Il totale allocato supera il valore assoluto della fattura.'
      USING ERRCODE = '23514', CONSTRAINT = 'management_allocations_total_limit';
  END IF;
  RETURN NEW;
END;
$$;

-- Keep the invariant when an existing invoice's amount changes as well.
CREATE FUNCTION public.check_invoice_management_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE allocated numeric;
BEGIN
  IF NEW.amount_total IS NOT DISTINCT FROM OLD.amount_total THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Invoice allocation validation requires READ COMMITTED isolation'
      USING ERRCODE = '40001';
  END IF;
  SELECT COALESCE(sum(allocated_amount), 0) INTO allocated
    FROM public.management_allocations WHERE invoice_id = NEW.id;
  IF allocated > 0 AND (NEW.amount_total = 'NaN'::numeric OR allocated > abs(NEW.amount_total)) THEN
    RAISE EXCEPTION 'Il totale fattura non può essere inferiore alle allocazioni gestionali.'
      USING ERRCODE = '23514', CONSTRAINT = 'management_allocations_total_limit';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_management_allocation_invoice() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_management_allocation_total() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_invoice_management_limit() FROM PUBLIC;

CREATE TRIGGER management_allocations_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.management_allocations
  FOR EACH ROW EXECUTE FUNCTION public.lock_management_allocation_invoice();
CREATE TRIGGER management_allocations_total
  AFTER INSERT OR UPDATE ON public.management_allocations
  FOR EACH ROW EXECUTE FUNCTION public.check_management_allocation_total();
CREATE TRIGGER invoices_management_limit
  BEFORE UPDATE OF amount_total ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.check_invoice_management_limit();
CREATE TRIGGER management_allocations_updated_at
  BEFORE UPDATE ON public.management_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_management_allocations
  AFTER INSERT OR UPDATE OR DELETE ON public.management_allocations
  FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

COMMIT;
