BEGIN;

-- A module-owned document remains in the central document/version/Storage system,
-- but is excluded from the general archive through its typed relation.
CREATE VIEW public.general_document_register WITH (security_invoker=true) AS
SELECT r.*
FROM public.document_register r
WHERE NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.document_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.document_invoices x WHERE x.document_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.document_orders x WHERE x.document_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.document_delivery_notes x WHERE x.document_id=r.id);
GRANT SELECT ON public.general_document_register TO authenticated;

-- Stable semantic key prevents a second active Italian SIMI entity.
ALTER TABLE public.legal_entities ADD COLUMN IF NOT EXISTS entity_key text;
UPDATE public.legal_entities SET entity_key=CASE WHEN upper(coalesce(country,'')) IN ('IT','ITALIA') OR business_name ILIKE '%SIMI%Italia%' THEN 'IT' WHEN upper(coalesce(country,'')) IN ('FR','FRANCE','FRANCIA') THEN 'FR' WHEN upper(coalesce(country,'')) IN ('LU','LUX','LUXEMBOURG') THEN 'LUX' ELSE code END WHERE entity_key IS NULL;

DO $$
DECLARE canonical uuid; duplicate uuid;
BEGIN
 SELECT id INTO canonical FROM public.legal_entities WHERE entity_key='IT' ORDER BY (code='SIMI-IT') DESC,(business_name ILIKE 'SIMI S.r.l.') DESC,created_at,id LIMIT 1;
 IF canonical IS NULL THEN
   INSERT INTO public.legal_entities(code,business_name,country,entity_key,active) VALUES ('SIMI-IT','SIMI S.r.l.','IT','IT',true) RETURNING id INTO canonical;
 ELSE
   UPDATE public.legal_entities SET business_name=CASE WHEN business_name ILIKE '%SIMI%Italia%' THEN 'SIMI S.r.l.' ELSE business_name END,country=coalesce(country,'IT'),entity_key='IT',active=true WHERE id=canonical;
 END IF;
 FOR duplicate IN SELECT id FROM public.legal_entities WHERE entity_key='IT' AND id<>canonical LOOP
   UPDATE public.projects SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.documents SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.invoices SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.employees SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.orders SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.delivery_notes SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.offers SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.contracts SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.financial_accounts SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.financial_movements SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.deadlines SET legal_entity_id=canonical WHERE legal_entity_id=duplicate;
   UPDATE public.legal_entities SET active=false,entity_key='IT-MERGED-'||id::text WHERE id=duplicate;
 END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS legal_entities_entity_key_active_uq ON public.legal_entities(entity_key) WHERE active;
CREATE OR REPLACE FUNCTION public.normalize_legal_entity_key() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.entity_key IS NULL THEN NEW.entity_key:=CASE WHEN upper(coalesce(NEW.country,'')) IN ('IT','ITALIA') OR NEW.business_name ILIKE '%SIMI%Italia%' OR NEW.code ILIKE '%SIMI-IT%' THEN 'IT' WHEN upper(coalesce(NEW.country,'')) IN ('FR','FRANCE','FRANCIA') THEN 'FR' WHEN upper(coalesce(NEW.country,'')) IN ('LU','LUX','LUXEMBOURG') THEN 'LUX' ELSE NEW.code END; END IF;
 IF NEW.active AND EXISTS(SELECT 1 FROM public.legal_entities e WHERE e.active AND e.entity_key=NEW.entity_key AND e.id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'Legal entity key already active' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS normalize_legal_entity_key ON public.legal_entities;
CREATE TRIGGER normalize_legal_entity_key BEFORE INSERT OR UPDATE OF entity_key,country,business_name,code,active ON public.legal_entities FOR EACH ROW EXECUTE FUNCTION public.normalize_legal_entity_key();

COMMIT;
