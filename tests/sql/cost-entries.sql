-- Run with psql as the local migration owner after migrations 001-030.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('28000000-0000-4000-8000-000000000001','costentries@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='28000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','28000000-0000-4000-8000-000000000001',true);

DO $$
DECLARE entity uuid; invoice uuid; entry uuid; allocation uuid; project uuid; manual uuid;
BEGIN
  SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
  INSERT INTO public.projects(project_code,name,legal_entity_id)
    VALUES('P03-TEST','Test registro costi',entity) RETURNING id INTO project;
  INSERT INTO public.invoices(invoice_type,invoice_number,legal_entity_id,
    amount_net,vat_amount,amount_total,currency,invoice_date,received_date,registration_date)
    VALUES('purchase','P03-NEG',entity,-100,0,-100,'EUR','2026-09-01','2026-09-02','2026-09-03')
    RETURNING id INTO invoice;
  SELECT id INTO STRICT entry FROM public.cost_entries WHERE source_type='invoice' AND source_id=invoice;
  IF (SELECT amount FROM public.cost_entries WHERE id=entry) <> -100
    OR (SELECT cost_date FROM public.cost_entries WHERE id=entry) <> '2026-09-03'::date THEN
    RAISE EXCEPTION 'Invoice sign or date precedence was lost';
  END IF;
  IF public.sync_invoice_cost_entry(invoice) <> entry OR public.sync_invoice_cost_entry(invoice) <> entry THEN
    RAISE EXCEPTION 'Repeated backfill/sync is not idempotent';
  END IF;
  BEGIN
    INSERT INTO public.cost_entries(source_type,source_id,cost_date,description,amount)
      VALUES('invoice',invoice,CURRENT_DATE,'Duplicate',10);
    RAISE EXCEPTION 'Duplicate invoice source accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO public.management_allocations(invoice_id,project_id,allocated_amount,notes)
    VALUES(invoice,project,60,'Preserve allocation') RETURNING id INTO allocation;
  IF (SELECT cost_entry_id FROM public.management_allocations WHERE id=allocation) IS DISTINCT FROM entry THEN
    RAISE EXCEPTION 'Legacy invoice allocation did not link automatically';
  END IF;
  -- Exercise the idempotent allocation-backfill predicate without touching its data.
  UPDATE public.management_allocations a SET cost_entry_id=c.id FROM public.cost_entries c
    WHERE c.source_type='invoice' AND c.source_id=a.invoice_id AND a.cost_entry_id IS DISTINCT FROM c.id;
  IF (SELECT allocated_amount FROM public.management_allocations WHERE id=allocation) <> 60
    OR (SELECT notes FROM public.management_allocations WHERE id=allocation) <> 'Preserve allocation' THEN
    RAISE EXCEPTION 'Allocation backfill changed economic data';
  END IF;
  IF (SELECT residual FROM public.cost_entry_balances WHERE id=entry) <> 40 THEN
    RAISE EXCEPTION 'Negative invoice residual is incorrect';
  END IF;
  BEGIN
    UPDATE public.management_allocations SET allocated_amount=101 WHERE id=allocation;
    RAISE EXCEPTION 'Allocation limit bypassed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.invoices SET amount_net=-120,amount_total=-120,currency='USD' WHERE id=invoice;
  IF (SELECT amount FROM public.cost_entries WHERE id=entry) <> -120
    OR (SELECT currency FROM public.cost_entries WHERE id=entry) <> 'USD' THEN
    RAISE EXCEPTION 'Invoice updates not synchronized';
  END IF;
  UPDATE public.invoices SET archived_at=now() WHERE id=invoice;
  IF (SELECT status FROM public.cost_entries WHERE id=entry) <> 'excluded' THEN
    RAISE EXCEPTION 'Archived invoice cost not excluded';
  END IF;
  DELETE FROM public.management_allocations WHERE id=allocation;
  BEGIN
    UPDATE public.invoices SET amount_net=0,amount_total=0 WHERE id=invoice;
    RAISE EXCEPTION 'Zeroing an existing invoice cost was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.invoices SET archived_at=NULL WHERE id=invoice;
  INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount)
    VALUES(entry,project,60) RETURNING id INTO allocation;
  IF (SELECT invoice_id FROM public.management_allocations WHERE id=allocation) IS DISTINCT FROM invoice THEN
    RAISE EXCEPTION 'Cost-entry-first allocation lost invoice compatibility';
  END IF;
  UPDATE public.invoices SET archived_at=now() WHERE id=invoice;
END;
$$;

DO $$
DECLARE center uuid; entry uuid; invoice uuid; manual uuid;
BEGIN
  INSERT INTO public.management_cost_centers(code,name) VALUES('p04_test','Centro P0.4') RETURNING id INTO center;
  SELECT id,source_id INTO STRICT entry,invoice FROM public.cost_entries WHERE description='Fattura P03-NEG';
  PERFORM public.update_cost_entry_classification(entry,NULL,center,'Classificazione test');
  IF (SELECT management_status FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'excluded' THEN
    RAISE EXCEPTION 'Excluded state must take precedence';
  END IF;
  UPDATE public.invoices SET archived_at=NULL WHERE id=invoice;
  IF (SELECT management_status FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'partially_allocated' THEN
    RAISE EXCEPTION 'Partial allocation must take precedence over cost center';
  END IF;
  IF (SELECT cost_center_id FROM public.cost_entries WHERE id=entry) IS DISTINCT FROM center THEN
    RAISE EXCEPTION 'Invoice sync erased classification';
  END IF;
  UPDATE public.management_allocations SET allocated_amount=120 WHERE cost_entry_id=entry;
  IF (SELECT management_status FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'allocated' THEN
    RAISE EXCEPTION 'Full signed-invoice allocation state incorrect';
  END IF;
  DELETE FROM public.management_allocations WHERE cost_entry_id=entry;
  IF (SELECT management_status FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'cost_center' THEN
    RAISE EXCEPTION 'Cost center state incorrect';
  END IF;
  IF (SELECT count(*) FROM public.cost_entry_balances WHERE cost_center_id=center) <> 1 THEN
    RAISE EXCEPTION 'Cost center filter incorrect';
  END IF;
  IF (SELECT amount FROM public.cost_entry_balances WHERE cost_center_id=center) <> -120 THEN
    RAISE EXCEPTION 'Economic amount must remain signed';
  END IF;
  UPDATE public.management_cost_centers SET is_active=false WHERE id=center;
  PERFORM public.update_cost_entry_classification(entry,NULL,center,'Keep inactive center');
  IF (SELECT cost_center_name FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'Centro P0.4' THEN
    RAISE EXCEPTION 'Inactive center disappeared from historical cost';
  END IF;
  BEGIN
    INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_center_id)
      VALUES('manual',CURRENT_DATE,'Inactive assignment',10,center);
    RAISE EXCEPTION 'New assignment to inactive center accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.update_cost_entry_classification(entry,NULL,NULL,'Remove center');
  IF (SELECT management_status FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'unallocated' THEN
    RAISE EXCEPTION 'Unallocated, unclassified cost state incorrect';
  END IF;
  BEGIN
    PERFORM public.update_cost_entry_classification(entry,NULL,center,'Reassign inactive center');
    RAISE EXCEPTION 'Reassignment to inactive center accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id=entry AND action='update'
    AND new_data->>'cost_center_id'=center::text) THEN
    RAISE EXCEPTION 'Invoice classification audit missing';
  END IF;
  UPDATE public.invoices SET archived_at=now() WHERE id=invoice;
END;
$$;

DO $$
DECLARE entry uuid; first_allocation uuid; second_allocation uuid; p1 uuid; p2 uuid; entity uuid; center uuid;
BEGIN
  SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
  SELECT id INTO STRICT p1 FROM public.projects WHERE project_code='P03-TEST';
  SELECT id INTO STRICT center FROM public.management_cost_centers WHERE code='warehouse';
  INSERT INTO public.projects(project_code,name,legal_entity_id)
    VALUES('P05-SECOND','Seconda commessa allocazioni',entity) RETURNING id INTO p2;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_center_id)
    VALUES('manual',CURRENT_DATE,'P05 costo negativo',-100,center) RETURNING id INTO entry;
  INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount)
    VALUES(entry,p1,60) RETURNING id INTO first_allocation;
  IF (SELECT invoice_id FROM public.management_allocations WHERE id=first_allocation) IS NOT NULL THEN
    RAISE EXCEPTION 'Manual cost acquired an invoice';
  END IF;
  IF (SELECT management_status FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'partially_allocated'
    OR (SELECT remaining_amount FROM public.cost_entry_balances WHERE id=entry) <> 40 THEN
    RAISE EXCEPTION 'Partial negative allocation state/residual incorrect';
  END IF;
  -- Current amount 60 plus remaining 40 permits an UPDATE all the way to 100.
  UPDATE public.management_allocations SET allocated_amount=100 WHERE id=first_allocation;
  IF (SELECT management_status FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'allocated' THEN
    RAISE EXCEPTION 'Full manual allocation incorrect';
  END IF;
  BEGIN
    UPDATE public.management_allocations SET allocated_amount=100.01 WHERE id=first_allocation;
    RAISE EXCEPTION 'Allocation UPDATE exceeded abs(cost amount)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.management_allocations SET allocated_amount=80 WHERE id=first_allocation;
  INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount)
    VALUES(entry,p2,20) RETURNING id INTO second_allocation;
  IF (SELECT allocated_amount FROM public.cost_entry_balances WHERE id=entry) <> 100 THEN
    RAISE EXCEPTION 'Multiple allocations total incorrect';
  END IF;
  BEGIN
    UPDATE public.management_allocations SET allocated_amount=80.01 WHERE id=first_allocation;
    RAISE EXCEPTION 'Combined allocation limit bypassed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  DELETE FROM public.management_allocations WHERE id=second_allocation;
  IF (SELECT remaining_amount FROM public.cost_entry_balances WHERE id=entry) <> 20 THEN
    RAISE EXCEPTION 'Deletion did not restore residual';
  END IF;
  BEGIN
    UPDATE public.cost_entries SET amount=-79 WHERE id=entry;
    RAISE EXCEPTION 'Manual cost reduction bypassed allocation limit';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(entry,p1,1);
    RAISE EXCEPTION 'Duplicate manual cost/project accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  DELETE FROM public.management_allocations WHERE id=first_allocation;
  IF (SELECT management_status FROM public.cost_entry_balances WHERE id=entry) IS DISTINCT FROM 'cost_center'
    OR (SELECT cost_center_id FROM public.cost_entries WHERE id=entry) IS DISTINCT FROM center
    OR (SELECT remaining_amount FROM public.cost_entry_balances WHERE id=entry) <> 100
    OR (SELECT amount FROM public.cost_entries WHERE id=entry) <> -100 THEN
    RAISE EXCEPTION 'Deletion changed cost center, signed value or full capacity';
  END IF;
  UPDATE public.cost_entries SET status='excluded' WHERE id=entry;
  BEGIN
    INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(entry,p1,1);
    RAISE EXCEPTION 'Excluded cost accepted new allocation';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id=first_allocation AND action='insert'
    AND new_data->>'cost_entry_id'=entry::text AND new_data->>'project_id'=p1::text)
    OR NOT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id=first_allocation AND action='delete') THEN
    RAISE EXCEPTION 'Cost allocation audit missing';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE manual uuid; invoice_cost uuid; changed integer;
BEGIN
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount)
    VALUES('manual',CURRENT_DATE,'Trasporto urgente',-850) RETURNING id INTO manual;
  IF (SELECT created_by FROM public.cost_entries WHERE id=manual) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Manual cost creator not assigned';
  END IF;
  UPDATE public.cost_entries SET amount=-900 WHERE id=manual;
  UPDATE public.cost_entries SET status='excluded' WHERE id=manual;
  IF NOT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id=manual AND action='insert')
    OR NOT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id=manual AND action='update') THEN
    RAISE EXCEPTION 'Manual cost audit missing';
  END IF;
  SELECT id INTO STRICT invoice_cost FROM public.cost_entries WHERE description='Fattura P03-NEG';
  PERFORM public.update_cost_entry_classification(invoice_cost,NULL,
    (SELECT id FROM public.management_cost_centers WHERE code='warehouse'),'Allowed classification');
  IF (SELECT cost_center_code FROM public.cost_entry_balances WHERE id=invoice_cost) IS DISTINCT FROM 'warehouse'
    OR (SELECT amount FROM public.cost_entries WHERE id=invoice_cost) <> -120 THEN
    RAISE EXCEPTION 'Classification RPC changed source economic data or failed';
  END IF;
  UPDATE public.cost_entries SET amount=1 WHERE id=invoice_cost;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Invoice cost is manually writable'; END IF;
  BEGIN
    DELETE FROM public.cost_entries WHERE id=manual;
    RAISE EXCEPTION 'Physical deletion allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
\echo 'PASS: cost entry identity, sync, backfill, signed balances, manual CRUD, audit and RLS'
ROLLBACK;
