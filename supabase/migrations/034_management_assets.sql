BEGIN;

CREATE TABLE public.management_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE CHECK(length(btrim(asset_code)) BETWEEN 1 AND 100),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  description text,
  category text NOT NULL CHECK(category IN ('welding','generators','lifting','instrumentation','machinery','special_equipment','other')),
  purchase_date date,
  purchase_cost numeric(14,2) CHECK(purchase_cost>=0 AND purchase_cost<>'NaN'::numeric),
  management_value numeric(14,2) CHECK(management_value>=0 AND management_value<>'NaN'::numeric),
  currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),
  allocation_method text NOT NULL CHECK(allocation_method IN ('hourly','daily','monthly','manual')),
  hourly_rate numeric(14,6) CHECK(hourly_rate>=0 AND hourly_rate<>'NaN'::numeric),
  daily_rate numeric(14,6) CHECK(daily_rate>=0 AND daily_rate<>'NaN'::numeric),
  monthly_rate numeric(14,6) CHECK(monthly_rate>=0 AND monthly_rate<>'NaN'::numeric),
  status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','in_use','maintenance','retired')),
  current_project_id uuid REFERENCES public.projects(id),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((allocation_method='hourly' AND hourly_rate IS NOT NULL)
    OR (allocation_method='daily' AND daily_rate IS NOT NULL)
    OR (allocation_method='monthly' AND monthly_rate IS NOT NULL) OR allocation_method='manual')
);
COMMENT ON COLUMN public.management_assets.current_project_id IS 'physical location only; changing it never creates economic usage or allocations';

CREATE TABLE public.management_asset_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.management_assets(id) ON DELETE CASCADE,
  from_project_id uuid REFERENCES public.projects(id),
  to_project_id uuid REFERENCES public.projects(id),
  movement_date date NOT NULL,
  notes text CHECK(length(notes)<=2000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX management_asset_movements_asset_idx ON public.management_asset_movements(asset_id,movement_date DESC);

CREATE TABLE public.management_asset_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.management_assets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  start_date date NOT NULL,
  end_date date CHECK(end_date>=start_date),
  usage_quantity numeric(14,2) CHECK(usage_quantity>=0 AND usage_quantity<>'NaN'::numeric),
  usage_unit text NOT NULL CHECK(usage_unit IN ('hours','days','months','manual')),
  rate numeric(14,6) NOT NULL CHECK(rate>=0 AND rate<>'NaN'::numeric),
  amount numeric(14,2) NOT NULL CHECK(amount>=0 AND amount<>'NaN'::numeric),
  -- Snapshot currency, like rate: later asset edits must not reinterpret past usage.
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','cancelled')),
  notes text CHECK(length(notes)<=2000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(usage_unit='manual' OR usage_quantity IS NOT NULL)
);
CREATE INDEX management_asset_usage_asset_idx ON public.management_asset_usage(asset_id,start_date DESC);
CREATE INDEX management_asset_usage_project_idx ON public.management_asset_usage(project_id);

ALTER TABLE public.management_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_asset_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_asset_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_assets,public.management_asset_movements,public.management_asset_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.management_assets,public.management_asset_movements,public.management_asset_usage TO authenticated;
-- Position can only be changed by move_management_asset, never by a generic update.
GRANT INSERT(asset_code,name,description,category,purchase_date,purchase_cost,management_value,currency,
  allocation_method,hourly_rate,daily_rate,monthly_rate,status,notes),
  UPDATE(asset_code,name,description,category,purchase_date,purchase_cost,management_value,currency,
  allocation_method,hourly_rate,daily_rate,monthly_rate,status,notes) ON public.management_assets TO authenticated;
CREATE POLICY management_assets_read ON public.management_assets FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY management_assets_insert ON public.management_assets FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY management_assets_update ON public.management_assets FOR UPDATE TO authenticated USING(public.app_has_permission('management.update')) WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY management_asset_movements_read ON public.management_asset_movements FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY management_asset_movements_insert ON public.management_asset_movements FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY management_asset_usage_read ON public.management_asset_usage FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY management_asset_usage_insert ON public.management_asset_usage FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY management_asset_usage_update ON public.management_asset_usage FOR UPDATE TO authenticated USING(public.app_has_permission('management.update')) WITH CHECK(public.app_has_permission('management.update'));
-- Usage and movement writes are restricted to the permission-checked atomic RPCs below.

CREATE FUNCTION public.management_asset_created_fields() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW.created_by:=auth.uid();
  ELSE NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.management_asset_created_fields() FROM PUBLIC;
CREATE TRIGGER management_assets_created_fields BEFORE INSERT OR UPDATE ON public.management_assets FOR EACH ROW EXECUTE FUNCTION public.management_asset_created_fields();
CREATE TRIGGER management_assets_updated_at BEFORE UPDATE ON public.management_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER management_asset_usage_updated_at BEFORE UPDATE ON public.management_asset_usage FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_management_assets AFTER INSERT OR UPDATE ON public.management_assets FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_management_asset_movements AFTER INSERT ON public.management_asset_movements FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_management_asset_usage AFTER INSERT OR UPDATE ON public.management_asset_usage FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

CREATE FUNCTION public.move_management_asset(p_asset_id uuid,p_to_project_id uuid,p_movement_date date,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_project uuid; movement_id uuid;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
  IF p_movement_date IS NULL OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Dati movimento non validi.' USING ERRCODE='22023'; END IF;
  SELECT current_project_id INTO previous_project FROM public.management_assets WHERE id=p_asset_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attrezzatura non trovata.' USING ERRCODE='22023'; END IF;
  IF p_to_project_id IS NOT NULL THEN
    PERFORM 1 FROM public.projects WHERE id=p_to_project_id AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.management_asset_movements(asset_id,from_project_id,to_project_id,movement_date,notes,created_by)
    VALUES(p_asset_id,previous_project,p_to_project_id,p_movement_date,NULLIF(btrim(p_notes),''),auth.uid()) RETURNING id INTO movement_id;
  UPDATE public.management_assets SET current_project_id=p_to_project_id WHERE id=p_asset_id;
  RETURN movement_id;
END;
$$;
REVOKE ALL ON FUNCTION public.move_management_asset(uuid,uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_management_asset(uuid,uuid,date,text) TO authenticated;

CREATE FUNCTION public.save_management_asset_usage(p_id uuid,p_asset_id uuid,p_project_id uuid,
  p_start_date date,p_end_date date,p_usage_quantity numeric,p_manual_amount numeric,p_status text,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset public.management_assets; previous public.management_asset_usage;
  applied_rate numeric(14,6); applied_amount numeric(14,2); unit text; usage_id uuid;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
  -- Serialize rate reads, moves, edits and cancellation on the asset.
  SELECT * INTO asset FROM public.management_assets WHERE id=p_asset_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attrezzatura non trovata.' USING ERRCODE='22023'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO previous FROM public.management_asset_usage WHERE id=p_id AND asset_id=p_asset_id FOR UPDATE;
    IF NOT FOUND OR previous.status='cancelled' THEN RAISE EXCEPTION 'Utilizzo non trovato o annullato.' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_start_date IS NULL OR (p_end_date IS NOT NULL AND p_end_date<p_start_date)
    OR p_status IS NULL OR p_status NOT IN ('active','closed') OR length(p_notes)>2000 THEN
    RAISE EXCEPTION 'Date o stato utilizzo non validi.' USING ERRCODE='22023';
  END IF;
  -- Economic destination is intentionally independent of current_project_id.
  IF p_id IS NULL OR p_project_id IS DISTINCT FROM previous.project_id THEN
    PERFORM 1 FROM public.projects WHERE id=p_project_id AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='22023'; END IF;
  END IF;
  IF asset.allocation_method='manual' THEN
    IF p_manual_amount IS NULL OR p_manual_amount='NaN'::numeric OR p_manual_amount<0
      OR p_manual_amount>=1e12 OR p_manual_amount<>round(p_manual_amount,2) THEN
      RAISE EXCEPTION 'Importo manuale non valido.' USING ERRCODE='22023';
    END IF;
    applied_rate:=1; applied_amount:=p_manual_amount; unit:='manual'; p_usage_quantity:=NULL;
  ELSE
    IF p_usage_quantity IS NULL OR p_usage_quantity='NaN'::numeric OR p_usage_quantity<0
      OR p_usage_quantity>=1e12 OR p_usage_quantity<>round(p_usage_quantity,2) THEN
      RAISE EXCEPTION 'Quantità utilizzo non valida.' USING ERRCODE='22023';
    END IF;
    CASE asset.allocation_method
      WHEN 'hourly' THEN applied_rate:=asset.hourly_rate; unit:='hours';
      WHEN 'daily' THEN applied_rate:=asset.daily_rate; unit:='days';
      WHEN 'monthly' THEN applied_rate:=asset.monthly_rate; unit:='months';
    END CASE;
    IF applied_rate IS NULL THEN RAISE EXCEPTION 'Tariffa attrezzatura non disponibile.' USING ERRCODE='22023'; END IF;
    applied_amount:=round(p_usage_quantity*applied_rate,2);
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.management_asset_usage(asset_id,project_id,start_date,end_date,usage_quantity,usage_unit,rate,amount,currency,status,notes,created_by)
      VALUES(p_asset_id,p_project_id,p_start_date,p_end_date,p_usage_quantity,unit,applied_rate,applied_amount,asset.currency,p_status,NULLIF(btrim(p_notes),''),auth.uid()) RETURNING id INTO usage_id;
  ELSE
    UPDATE public.management_asset_usage SET project_id=p_project_id,start_date=p_start_date,end_date=p_end_date,
      usage_quantity=p_usage_quantity,usage_unit=unit,rate=applied_rate,amount=applied_amount,currency=asset.currency,status=p_status,notes=NULLIF(btrim(p_notes),'')
      WHERE id=p_id RETURNING id INTO usage_id;
  END IF;
  RETURN usage_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_management_asset_usage(uuid,uuid,uuid,date,date,numeric,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_management_asset_usage(uuid,uuid,uuid,date,date,numeric,numeric,text,text) TO authenticated;

CREATE FUNCTION public.cancel_management_asset_usage(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset uuid; result uuid;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
  SELECT asset_id INTO asset FROM public.management_asset_usage WHERE id=p_id;
  PERFORM 1 FROM public.management_assets WHERE id=asset FOR NO KEY UPDATE;
  UPDATE public.management_asset_usage SET status='cancelled' WHERE id=p_id AND status<>'cancelled' RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Utilizzo non trovato o annullato.' USING ERRCODE='22023'; END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_management_asset_usage(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_management_asset_usage(uuid) TO authenticated;

CREATE VIEW public.management_asset_usage_totals WITH(security_invoker=true) AS
 SELECT asset_id,currency,sum(amount) AS total_usage FROM public.management_asset_usage
 WHERE status IN ('active','closed') GROUP BY asset_id,currency;
REVOKE ALL ON public.management_asset_usage_totals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.management_asset_usage_totals TO authenticated;
CREATE FUNCTION public.management_asset_usage_summary()
RETURNS TABLE(currency text,total_usage numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT currency,sum(total_usage) FROM public.management_asset_usage_totals GROUP BY currency ORDER BY currency;
$$;
REVOKE ALL ON FUNCTION public.management_asset_usage_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.management_asset_usage_summary() TO authenticated;

-- Extend the existing projection; direct allocations and pool logic are unchanged.
CREATE OR REPLACE VIEW public.project_management_allocations WITH(security_invoker=true) AS
 SELECT a.id,a.project_id,a.cost_entry_id,c.cost_date,c.description,c.source_type,c.source_id,
   COALESCE(a.invoice_id,CASE WHEN c.source_type='invoice' THEN c.source_id END) AS invoice_id,
   COALESCE(a.cost_category_id,c.cost_category_id) AS cost_category_id,
   COALESCE(category.name,'Non classificato') AS category_name,c.supplier_id,supplier.business_name AS supplier_name,c.currency,
   CASE WHEN c.amount<0 THEN -a.allocated_amount ELSE a.allocated_amount END AS economic_amount
 FROM public.management_allocations a
 JOIN public.cost_entries c ON c.id=a.cost_entry_id AND c.status='active'
 JOIN public.projects p ON p.id=a.project_id AND p.archived_at IS NULL
 LEFT JOIN public.management_cost_categories category ON category.id=COALESCE(a.cost_category_id,c.cost_category_id)
 LEFT JOIN public.companies supplier ON supplier.id=c.supplier_id
 WHERE public.app_has_permission('management.read') AND public.app_has_permission('project.read')
 UNION ALL
 SELECT a.id,a.project_id,NULL::uuid,pool.period_end,pool.name,'pool'::text,pool.id,
   NULL::uuid,category.id,COALESCE(category.name,center.name,pool.name),NULL::uuid,NULL::text,a.currency,a.allocated_amount
 FROM public.management_pool_allocations a
 JOIN public.management_cost_pools pool ON pool.id=a.pool_id
 JOIN public.management_cost_centers center ON center.id=pool.cost_center_id
 LEFT JOIN public.management_cost_categories category ON category.code=center.code
 JOIN public.projects p ON p.id=a.project_id AND p.archived_at IS NULL
 WHERE public.app_has_permission('management.read') AND public.app_has_permission('project.read')
 UNION ALL
 SELECT u.id,u.project_id,NULL::uuid,u.start_date,asset.asset_code || ' — ' || asset.name,'asset'::text,asset.id,
   NULL::uuid,NULL::uuid,'Attrezzature'::text,NULL::uuid,NULL::text,u.currency,u.amount
 FROM public.management_asset_usage u
 JOIN public.management_assets asset ON asset.id=u.asset_id
 JOIN public.projects p ON p.id=u.project_id AND p.archived_at IS NULL
 WHERE u.status IN ('active','closed') AND public.app_has_permission('management.read') AND public.app_has_permission('project.read');
-- Purchase cost, management value and physical movements never enter this projection.
COMMIT;
