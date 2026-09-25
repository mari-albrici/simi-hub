BEGIN;

CREATE TABLE public.management_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_code text NOT NULL UNIQUE CHECK(length(btrim(container_code)) BETWEEN 1 AND 100),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
  description text CHECK(length(description)<=2000),
  ownership_type text NOT NULL DEFAULT 'owned' CHECK(ownership_type IN ('owned','rented','third_party')),
  purchase_date date,
  purchase_cost numeric(14,2) CHECK(purchase_cost>=0 AND purchase_cost<>'NaN'::numeric),
  currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','in_use','maintenance','retired')),
  current_project_id uuid REFERENCES public.projects(id),
  notes text CHECK(length(notes)<=2000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.management_containers.current_project_id IS 'physical location only; never generates economic costs';

CREATE TABLE public.management_container_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES public.management_containers(id) ON DELETE CASCADE,
  from_project_id uuid REFERENCES public.projects(id),
  to_project_id uuid REFERENCES public.projects(id),
  movement_date date NOT NULL,
  transport_cost numeric(14,2) CHECK(transport_cost>=0 AND transport_cost<>'NaN'::numeric),
  currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),
  notes text CHECK(length(notes)<=2000),
  -- Aggregate audit identifies precisely which assets moved with the container.
  synced_asset_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.management_container_movements.transport_cost IS 'Logistics information only; never creates cost_entries or allocations';
CREATE INDEX management_container_movements_parent_idx ON public.management_container_movements(container_id,movement_date DESC);

CREATE TABLE public.management_container_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES public.management_containers(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.management_assets(id) ON DELETE CASCADE,
  date_in date NOT NULL,
  date_out date CHECK(date_out>=date_in),
  notes text CHECK(length(notes)<=2000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX management_container_assets_one_active ON public.management_container_assets(asset_id) WHERE date_out IS NULL;
CREATE INDEX management_container_assets_parent_idx ON public.management_container_assets(container_id,date_in DESC);

ALTER TABLE public.management_containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_container_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_container_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_containers,public.management_container_movements,public.management_container_assets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.management_containers,public.management_container_movements,public.management_container_assets TO authenticated;
GRANT INSERT(container_code,name,description,ownership_type,purchase_date,purchase_cost,currency,status,notes),
  UPDATE(container_code,name,description,ownership_type,purchase_date,purchase_cost,currency,status,notes)
  ON public.management_containers TO authenticated;
CREATE POLICY containers_read ON public.management_containers FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY containers_insert ON public.management_containers FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY containers_update ON public.management_containers FOR UPDATE TO authenticated USING(public.app_has_permission('management.update')) WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY container_movements_read ON public.management_container_movements FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY container_movements_insert ON public.management_container_movements FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY container_assets_read ON public.management_container_assets FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY container_assets_insert ON public.management_container_assets FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY container_assets_update ON public.management_container_assets FOR UPDATE TO authenticated USING(public.app_has_permission('management.update')) WITH CHECK(public.app_has_permission('management.update'));
-- Position, history and membership writes only through checked atomic RPCs. No DELETE grants.
CREATE TRIGGER containers_created_fields BEFORE INSERT OR UPDATE ON public.management_containers FOR EACH ROW EXECUTE FUNCTION public.management_asset_created_fields();
CREATE TRIGGER containers_updated_at BEFORE UPDATE ON public.management_containers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_containers AFTER INSERT OR UPDATE ON public.management_containers FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_container_movements AFTER INSERT ON public.management_container_movements FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_container_assets AFTER INSERT OR UPDATE ON public.management_container_assets FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

-- Physical changes are audited by asset movements or container membership/movement
-- events. Preserve metadata audit without one duplicate log per synchronized asset.
DROP TRIGGER audit_management_assets ON public.management_assets;
CREATE TRIGGER audit_management_assets AFTER INSERT ON public.management_assets FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_management_assets_update AFTER UPDATE ON public.management_assets FOR EACH ROW
  WHEN ((to_jsonb(NEW)-'current_project_id'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'current_project_id'-'updated_at'))
  EXECUTE FUNCTION public.audit_mutation();

CREATE FUNCTION public.add_asset_to_container(p_container_id uuid,p_asset_id uuid,p_date_in date,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE container public.management_containers; asset_status text; relation_id uuid;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Container operations require READ COMMITTED' USING ERRCODE='40001'; END IF;
  IF p_date_in IS NULL OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Dati ingresso non validi.' USING ERRCODE='22023'; END IF;
  -- Global order: container, then assets ordered by id. Membership writes share this lock.
  SELECT * INTO container FROM public.management_containers WHERE id=p_container_id FOR NO KEY UPDATE;
  IF NOT FOUND OR container.status='retired' THEN RAISE EXCEPTION 'Container non trovato o dismesso.' USING ERRCODE='22023'; END IF;
  SELECT status INTO asset_status FROM public.management_assets WHERE id=p_asset_id FOR NO KEY UPDATE;
  IF NOT FOUND OR asset_status='retired' THEN RAISE EXCEPTION 'Attrezzatura non trovata o dismessa.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.management_container_assets WHERE asset_id=p_asset_id AND date_out IS NULL) THEN
    RAISE EXCEPTION 'Attrezzatura già contenuta in un container.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.management_container_assets(container_id,asset_id,date_in,notes,created_by)
    VALUES(p_container_id,p_asset_id,p_date_in,NULLIF(btrim(p_notes),''),auth.uid()) RETURNING id INTO relation_id;
  UPDATE public.management_assets SET current_project_id=container.current_project_id WHERE id=p_asset_id;
  RETURN relation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.add_asset_to_container(uuid,uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_asset_to_container(uuid,uuid,date,text) TO authenticated;

CREATE FUNCTION public.remove_asset_from_container(p_id uuid,p_date_out date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE membership public.management_container_assets; result uuid;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Container operations require READ COMMITTED' USING ERRCODE='40001'; END IF;
  SELECT * INTO membership FROM public.management_container_assets WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Relazione container non trovata o già chiusa.' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.management_containers WHERE id=membership.container_id FOR NO KEY UPDATE;
  PERFORM 1 FROM public.management_assets WHERE id=membership.asset_id FOR NO KEY UPDATE;
  IF p_date_out IS NULL OR p_date_out<membership.date_in THEN RAISE EXCEPTION 'La data di uscita deve seguire l’ingresso.' USING ERRCODE='22023'; END IF;
  UPDATE public.management_container_assets SET date_out=p_date_out WHERE id=p_id AND date_out IS NULL RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Relazione container non trovata o già chiusa.' USING ERRCODE='22023'; END IF;
  -- Conservative removal: keep the asset's last physical location. No economic changes.
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_asset_from_container(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_asset_from_container(uuid,date) TO authenticated;

CREATE FUNCTION public.move_management_container(p_container_id uuid,p_to_project_id uuid,p_movement_date date,
  p_transport_cost numeric,p_currency text,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_project uuid; movement_id uuid; asset_ids uuid[];
BEGIN
  IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Container operations require READ COMMITTED' USING ERRCODE='40001'; END IF;
  IF p_movement_date IS NULL OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR length(p_notes)>2000
    OR (p_transport_cost IS NOT NULL AND (p_transport_cost<0 OR p_transport_cost>=1e12 OR p_transport_cost='NaN'::numeric OR p_transport_cost<>round(p_transport_cost,2))) THEN
    RAISE EXCEPTION 'Dati movimento container non validi.' USING ERRCODE='22023';
  END IF;
  SELECT current_project_id INTO previous_project FROM public.management_containers WHERE id=p_container_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Container non trovato.' USING ERRCODE='22023'; END IF;
  IF p_to_project_id IS NOT NULL THEN
    PERFORM 1 FROM public.projects WHERE id=p_to_project_id AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='22023'; END IF;
  END IF;
  PERFORM a.id FROM public.management_assets a JOIN public.management_container_assets ca ON ca.asset_id=a.id
    WHERE ca.container_id=p_container_id AND ca.date_out IS NULL ORDER BY a.id FOR NO KEY UPDATE OF a;
  SELECT COALESCE(array_agg(asset_id ORDER BY asset_id),'{}'::uuid[]) INTO asset_ids
    FROM public.management_container_assets WHERE container_id=p_container_id AND date_out IS NULL;
  INSERT INTO public.management_container_movements(container_id,from_project_id,to_project_id,movement_date,transport_cost,currency,notes,synced_asset_ids,created_by)
    VALUES(p_container_id,previous_project,p_to_project_id,p_movement_date,p_transport_cost,p_currency,NULLIF(btrim(p_notes),''),asset_ids,auth.uid()) RETURNING id INTO movement_id;
  UPDATE public.management_containers SET current_project_id=p_to_project_id WHERE id=p_container_id;
  -- Container is the source of physical position, even after an independent manual move.
  UPDATE public.management_assets SET current_project_id=p_to_project_id WHERE id=ANY(asset_ids);
  RETURN movement_id;
END;
$$;
REVOKE ALL ON FUNCTION public.move_management_container(uuid,uuid,date,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_management_container(uuid,uuid,date,numeric,text,text) TO authenticated;

CREATE VIEW public.management_container_summaries WITH(security_invoker=true) AS
 SELECT c.*,p.project_code AS current_project_code,p.name AS current_project_name,
   (SELECT count(*) FROM public.management_container_assets ca WHERE ca.container_id=c.id AND ca.date_out IS NULL) AS asset_count
 FROM public.management_containers c LEFT JOIN public.projects p ON p.id=c.current_project_id;
CREATE VIEW public.management_available_container_assets WITH(security_invoker=true) AS
 SELECT a.id,a.asset_code,a.name FROM public.management_assets a WHERE a.status<>'retired'
   AND NOT EXISTS(SELECT 1 FROM public.management_container_assets ca WHERE ca.asset_id=a.id AND ca.date_out IS NULL);
REVOKE ALL ON public.management_container_summaries,public.management_available_container_assets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.management_container_summaries,public.management_available_container_assets TO authenticated;
-- No changes to cost entries, usage, allocation sources, project totals or reconciliation.
COMMIT;
