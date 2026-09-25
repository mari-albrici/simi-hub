BEGIN;

CREATE TABLE public.management_cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.management_cost_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_cost_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.management_cost_categories TO authenticated;
CREATE POLICY management_cost_categories_read ON public.management_cost_categories
  FOR SELECT TO authenticated USING (public.app_has_permission('management.read'));
CREATE POLICY management_cost_categories_insert ON public.management_cost_categories
  FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('management.update'));
CREATE POLICY management_cost_categories_update ON public.management_cost_categories
  FOR UPDATE TO authenticated USING (public.app_has_permission('management.update'))
  WITH CHECK (public.app_has_permission('management.update'));

CREATE TRIGGER management_cost_categories_updated_at
  BEFORE UPDATE ON public.management_cost_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_management_cost_categories
  AFTER INSERT OR UPDATE ON public.management_cost_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

INSERT INTO public.management_cost_categories (code, name, sort_order) VALUES
  ('materials', 'Materiali', 10),
  ('consumables', 'Consumabili', 20),
  ('labor', 'Manodopera', 30),
  ('travel', 'Trasferte', 40),
  ('accommodation', 'Vitto e alloggio', 50),
  ('transport', 'Trasporti', 60),
  ('rentals', 'Noleggi', 70),
  ('equipment', 'Attrezzature', 80),
  ('small_equipment', 'Piccola attrezzatura', 90),
  ('vehicles', 'Mezzi', 100),
  ('containers', 'Container', 110),
  ('logistics', 'Logistica', 120),
  ('subcontracting', 'Subappalti', 130),
  ('indirect_costs', 'Costi indiretti', 140),
  ('other', 'Altro', 150);

ALTER TABLE public.management_allocations
  ADD COLUMN cost_category_id uuid REFERENCES public.management_cost_categories(id);
CREATE INDEX management_allocations_cost_category_idx
  ON public.management_allocations(cost_category_id);

-- Existing allocations stay unclassified. The existing row audit automatically
-- includes cost_category_id in old_data/new_data.
CREATE FUNCTION public.check_management_allocation_category()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE category_active boolean;
BEGIN
  IF NEW.cost_category_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cost_category_id IS NOT DISTINCT FROM OLD.cost_category_id THEN
      RETURN NEW;
    END IF;
  END IF;
  -- SHARE serializes assignment against concurrent deactivation (non-key UPDATE).
  SELECT is_active INTO category_active FROM public.management_cost_categories
    WHERE id = NEW.cost_category_id FOR SHARE;
  IF category_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'La categoria di costo deve esistere ed essere attiva.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_management_allocation_category() FROM PUBLIC;
CREATE TRIGGER management_allocations_category
  BEFORE INSERT OR UPDATE OF cost_category_id ON public.management_allocations
  FOR EACH ROW EXECUTE FUNCTION public.check_management_allocation_category();

COMMIT;
