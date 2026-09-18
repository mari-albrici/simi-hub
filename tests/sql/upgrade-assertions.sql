DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE role='admin' AND NOT active AND id='10000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Existing profile overwritten'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.legal_entities WHERE business_name='Existing legal name') THEN RAISE EXCEPTION 'Existing entity overwritten'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.projects WHERE customer_id='99999999-9999-4999-8999-999999999999') THEN RAISE EXCEPTION 'Existing orphan deleted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.invoice_projects WHERE invoice_id='40000000-0000-4000-8000-000000000001' AND project_id='30000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Legacy project link lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE amount_total=122 AND id='40000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Invoice changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.documents WHERE storage_path='legacy.pdf' AND access_scope='hr') THEN RAISE EXCEPTION 'HR legacy not protected'; END IF;
END $$;
\echo 'PASS: additive upgrade preserves data, roles, disabled profiles, legal names, legacy links and orphans'
