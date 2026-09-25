BEGIN;
CREATE TABLE public.management_consumable_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 item_code text NOT NULL UNIQUE CHECK(length(btrim(item_code)) BETWEEN 1 AND 100),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),description text,category text,
 unit text NOT NULL CHECK(unit IN ('pcs','kg','m','l','box','pack','other')),
 default_unit_cost numeric(14,6) CHECK(default_unit_cost>=0 AND default_unit_cost<>'NaN'::numeric),
 currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),is_active boolean NOT NULL DEFAULT true,
 notes text,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.management_container_consumables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 container_id uuid NOT NULL REFERENCES public.management_containers(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.management_consumable_items(id),
 quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(quantity>=0 AND quantity<>'NaN'::numeric),
 unit_cost numeric(14,6) CHECK(unit_cost>=0 AND unit_cost<>'NaN'::numeric),
 updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(container_id,item_id),
 CHECK(quantity=0 OR unit_cost IS NOT NULL)
);
CREATE TABLE public.management_consumable_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES public.management_consumable_items(id),
 movement_type text NOT NULL CHECK(movement_type IN ('load','transfer','consumption','adjustment')),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0 AND quantity<>'NaN'::numeric),
 unit_cost numeric(14,6) NOT NULL CHECK(unit_cost>=0 AND unit_cost<>'NaN'::numeric),
 amount numeric(14,2) NOT NULL CHECK(amount>=0 AND amount<>'NaN'::numeric),
 from_container_id uuid REFERENCES public.management_containers(id),to_container_id uuid REFERENCES public.management_containers(id),
 project_id uuid REFERENCES public.projects(id),movement_date date NOT NULL,notes text CHECK(length(notes)<=2000),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((movement_type='load' AND from_container_id IS NULL AND to_container_id IS NOT NULL AND project_id IS NULL)
 OR (movement_type='transfer' AND from_container_id IS NOT NULL AND to_container_id IS NOT NULL AND from_container_id<>to_container_id AND project_id IS NULL)
 OR (movement_type='consumption' AND from_container_id IS NOT NULL AND to_container_id IS NULL AND project_id IS NOT NULL)
 OR (movement_type='adjustment' AND (from_container_id IS NULL)<>(to_container_id IS NULL) AND project_id IS NULL AND notes IS NOT NULL AND length(btrim(notes))>0))
);
COMMENT ON TABLE public.management_consumable_movements IS 'Only consumption distributes economic cost to projects; load, transfer and adjustment never create cost_entries';
CREATE INDEX consumable_movements_item_idx ON public.management_consumable_movements(item_id,movement_date DESC);
CREATE INDEX consumable_movements_from_idx ON public.management_consumable_movements(from_container_id);
CREATE INDEX consumable_movements_to_idx ON public.management_consumable_movements(to_container_id);
CREATE INDEX consumable_movements_project_idx ON public.management_consumable_movements(project_id) WHERE movement_type='consumption';

ALTER TABLE public.management_consumable_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_container_consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_consumable_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_consumable_items,public.management_container_consumables,public.management_consumable_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.management_consumable_items,public.management_container_consumables,public.management_consumable_movements TO authenticated;
GRANT INSERT(item_code,name,description,category,unit,default_unit_cost,currency,is_active,notes),
 UPDATE(item_code,name,description,category,unit,default_unit_cost,currency,is_active,notes) ON public.management_consumable_items TO authenticated;
CREATE POLICY consumable_items_read ON public.management_consumable_items FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY consumable_items_insert ON public.management_consumable_items FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY consumable_items_update ON public.management_consumable_items FOR UPDATE TO authenticated USING(public.app_has_permission('management.update')) WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY consumable_stock_read ON public.management_container_consumables FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY consumable_stock_insert ON public.management_container_consumables FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY consumable_stock_update ON public.management_container_consumables FOR UPDATE TO authenticated USING(public.app_has_permission('management.update')) WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY consumable_movements_read ON public.management_consumable_movements FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY consumable_movements_insert ON public.management_consumable_movements FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
-- Stock and immutable movements are writable only through the checked RPC.
CREATE TRIGGER consumable_items_created BEFORE INSERT OR UPDATE ON public.management_consumable_items FOR EACH ROW EXECUTE FUNCTION public.management_asset_created_fields();
CREATE TRIGGER consumable_items_updated BEFORE UPDATE ON public.management_consumable_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER consumable_stock_updated BEFORE UPDATE ON public.management_container_consumables FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_consumable_items AFTER INSERT OR UPDATE ON public.management_consumable_items FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_consumable_movements AFTER INSERT ON public.management_consumable_movements FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE FUNCTION public.protect_consumable_unit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Consumables require READ COMMITTED' USING ERRCODE='40001'; END IF;
 IF (NEW.unit,NEW.currency) IS DISTINCT FROM (OLD.unit,OLD.currency)
 AND EXISTS(SELECT 1 FROM public.management_consumable_movements WHERE item_id=OLD.id) THEN
   RAISE EXCEPTION 'Unità e valuta non modificabili dopo il primo movimento.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_consumable_unit() FROM PUBLIC;
CREATE TRIGGER consumable_unit_check BEFORE UPDATE ON public.management_consumable_items FOR EACH ROW EXECUTE FUNCTION public.protect_consumable_unit();

CREATE FUNCTION public.record_consumable_movement(p_item_id uuid,p_type text,p_from uuid,p_to uuid,p_project uuid,
 p_quantity numeric,p_unit_cost numeric,p_date date,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.management_consumable_items; origin public.management_container_consumables;
 destination public.management_container_consumables; applied_cost numeric(14,6); result uuid; target_count integer;
BEGIN
 IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Consumables require READ COMMITTED' USING ERRCODE='40001'; END IF;
 IF p_quantity IS NULL OR p_quantity='NaN'::numeric OR p_quantity<=0 OR p_quantity>=1e11 OR p_quantity<>round(p_quantity,3)
 OR p_date IS NULL OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Quantità o data non valida.' USING ERRCODE='22023'; END IF;
 IF NOT COALESCE((p_type='load' AND p_from IS NULL AND p_to IS NOT NULL AND p_project IS NULL)
 OR (p_type='transfer' AND p_from IS NOT NULL AND p_to IS NOT NULL AND p_from<>p_to AND p_project IS NULL)
 OR (p_type='consumption' AND p_from IS NOT NULL AND p_to IS NULL AND p_project IS NOT NULL)
 OR (p_type='adjustment' AND (p_from IS NULL)<>(p_to IS NULL) AND p_project IS NULL AND length(btrim(p_notes))>0),false) THEN
   RAISE EXCEPTION 'Destinazioni o motivazione del movimento non valide.' USING ERRCODE='22023';
 END IF;
 -- One item lock serializes all balance changes, including creation of empty stock rows.
 SELECT * INTO item FROM public.management_consumable_items WHERE id=p_item_id FOR NO KEY UPDATE;
 IF NOT FOUND OR (p_type='load' AND NOT item.is_active) THEN RAISE EXCEPTION 'Articolo non disponibile.' USING ERRCODE='22023'; END IF;
 PERFORM id FROM public.management_containers WHERE id IN (p_from,p_to) ORDER BY id FOR SHARE;
 GET DIAGNOSTICS target_count=ROW_COUNT;
 IF target_count<>(CASE WHEN p_from IS NULL OR p_to IS NULL THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'Container non disponibile.' USING ERRCODE='22023'; END IF;
 IF p_project IS NOT NULL THEN
   PERFORM id FROM public.projects WHERE id=p_project AND archived_at IS NULL FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_from IS NOT NULL THEN
   SELECT * INTO origin FROM public.management_container_consumables WHERE container_id=p_from AND item_id=p_item_id;
   IF NOT FOUND OR origin.quantity<p_quantity THEN RAISE EXCEPTION 'Giacenza insufficiente.' USING ERRCODE='22023'; END IF;
   applied_cost:=origin.unit_cost;
 ELSIF p_type='load' THEN
   IF p_unit_cost IS NULL OR p_unit_cost='NaN'::numeric OR p_unit_cost<0 OR p_unit_cost>=1e8 OR p_unit_cost<>round(p_unit_cost,6) THEN
     RAISE EXCEPTION 'Costo unitario non valido.' USING ERRCODE='22023';
   END IF;
   applied_cost:=p_unit_cost;
 ELSE
   SELECT * INTO destination FROM public.management_container_consumables WHERE container_id=p_to AND item_id=p_item_id;
   applied_cost:=COALESCE(destination.unit_cost,item.default_unit_cost);
 END IF;
 IF applied_cost IS NULL THEN RAISE EXCEPTION 'Costo unitario non disponibile: effettuare prima un carico.' USING ERRCODE='22023'; END IF;
 IF p_from IS NOT NULL THEN
   UPDATE public.management_container_consumables SET quantity=quantity-p_quantity WHERE id=origin.id;
 END IF;
 IF p_to IS NOT NULL THEN
   INSERT INTO public.management_container_consumables(container_id,item_id,quantity,unit_cost)
     VALUES(p_to,p_item_id,p_quantity,applied_cost)
   ON CONFLICT(container_id,item_id) DO UPDATE SET
     unit_cost=round((management_container_consumables.quantity*COALESCE(management_container_consumables.unit_cost,0)
       +EXCLUDED.quantity*EXCLUDED.unit_cost)/(management_container_consumables.quantity+EXCLUDED.quantity),6),
     quantity=management_container_consumables.quantity+EXCLUDED.quantity;
 END IF;
 INSERT INTO public.management_consumable_movements(item_id,movement_type,quantity,unit_cost,amount,
   from_container_id,to_container_id,project_id,movement_date,notes,currency,created_by)
 VALUES(p_item_id,p_type,p_quantity,applied_cost,round(p_quantity*applied_cost,2),p_from,p_to,p_project,p_date,NULLIF(btrim(p_notes),''),item.currency,auth.uid())
 RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.record_consumable_movement(uuid,text,uuid,uuid,uuid,numeric,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_consumable_movement(uuid,text,uuid,uuid,uuid,numeric,numeric,date,text) TO authenticated;

CREATE VIEW public.management_consumable_stock_details WITH(security_invoker=true) AS
 SELECT s.*,i.item_code,i.name,i.unit,i.currency,i.is_active,s.quantity*s.unit_cost AS stock_value
 FROM public.management_container_consumables s JOIN public.management_consumable_items i ON i.id=s.item_id;
REVOKE ALL ON public.management_consumable_stock_details FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.management_consumable_stock_details TO authenticated;
CREATE FUNCTION public.management_consumption_summary() RETURNS TABLE(currency text,total_consumption numeric)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT currency,sum(amount) FROM public.management_consumable_movements WHERE movement_type='consumption' GROUP BY currency ORDER BY currency;
$$;
REVOKE ALL ON FUNCTION public.management_consumption_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.management_consumption_summary() TO authenticated;
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
 WHERE u.status IN ('active','closed') AND public.app_has_permission('management.read') AND public.app_has_permission('project.read')
 UNION ALL
 SELECT m.id,m.project_id,NULL::uuid,m.movement_date,i.item_code || ' — ' || i.name,'consumable'::text,i.id,
 NULL::uuid,NULL::uuid,'Consumabili'::text,NULL::uuid,NULL::text,m.currency,m.amount
 FROM public.management_consumable_movements m JOIN public.management_consumable_items i ON i.id=m.item_id
 JOIN public.projects p ON p.id=m.project_id AND p.archived_at IS NULL
 WHERE m.movement_type='consumption' AND public.app_has_permission('management.read') AND public.app_has_permission('project.read');
COMMIT;
