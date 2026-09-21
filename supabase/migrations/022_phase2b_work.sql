BEGIN;
-- Preserve all existing capabilities and the admin wildcard.
ALTER FUNCTION public.app_has_permission(text) RENAME TO app_has_permission_before_2b;
CREATE FUNCTION public.app_has_permission(permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.app_has_permission_before_2b(permission) OR coalesce(
 CASE WHEN permission IN ('task.read','anomaly.read') THEN public.app_role() IS NOT NULL
 WHEN permission IN ('task.create','task.update','task.archive','anomaly.update') THEN public.app_role() IN ('administration','project_manager','technical','hr')
 WHEN permission IN ('task.assign','anomaly.assign','anomaly.ignore') THEN public.app_role() IN ('administration','project_manager','hr') ELSE false END,false)
$$;
REVOKE ALL ON FUNCTION public.app_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_permission(text) TO authenticated;
ALTER TABLE public.invoices ADD COLUMN project_required boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.invoices.project_required IS 'Explicit operational requirement; general overhead invoices need not have a project.';

-- Typed, FK-backed identity registry, no URLs or unvalidated polymorphic IDs.
CREATE TABLE public.work_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid UNIQUE REFERENCES public.projects(id),
 invoice_id uuid UNIQUE REFERENCES public.invoices(id),
 movement_id uuid UNIQUE REFERENCES public.financial_movements(id),
 document_id uuid UNIQUE REFERENCES public.documents(id),
 order_id uuid UNIQUE REFERENCES public.orders(id),
 delivery_note_id uuid UNIQUE REFERENCES public.delivery_notes(id),
 offer_id uuid UNIQUE REFERENCES public.offers(id),
 contract_id uuid UNIQUE REFERENCES public.contracts(id),
 company_id uuid UNIQUE REFERENCES public.companies(id),
 employee_id uuid UNIQUE REFERENCES public.employees(id),
 deadline_id uuid UNIQUE REFERENCES public.deadlines(id),
 installment_id uuid UNIQUE REFERENCES public.invoice_installments(id),
 CHECK (num_nonnulls(project_id,invoice_id,movement_id,document_id,order_id,delivery_note_id,offer_id,contract_id,company_id,employee_id,deadline_id,installment_id)=1)
);
CREATE FUNCTION public.set_invoice_project_required(invoice uuid, required boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('invoice.update') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE public.invoices SET project_required=required,revision=revision+1 WHERE id=invoice AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_invoice_project_required(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_invoice_project_required(uuid,boolean) TO authenticated;
CREATE FUNCTION public.work_record_visible(record uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.work_records;
BEGIN
 SELECT * INTO r FROM public.work_records WHERE id=record;
 IF NOT FOUND OR public.app_role() IS NULL THEN RETURN false; END IF;
 IF r.project_id IS NOT NULL THEN RETURN public.app_has_permission('project.read'); END IF;
 IF r.invoice_id IS NOT NULL THEN RETURN public.app_has_permission('invoice.read'); END IF;
 IF r.movement_id IS NOT NULL THEN RETURN public.app_has_permission('invoice.read'); END IF;
 IF r.document_id IS NOT NULL THEN RETURN public.app_has_permission('document.read') AND public.document_visible(r.document_id); END IF;
 IF r.order_id IS NOT NULL THEN RETURN public.app_has_permission('order.read'); END IF;
 IF r.delivery_note_id IS NOT NULL THEN RETURN public.app_has_permission('delivery_note.read'); END IF;
 IF r.offer_id IS NOT NULL THEN RETURN public.app_has_permission('offer.read'); END IF;
 IF r.contract_id IS NOT NULL THEN RETURN public.app_has_permission('contract.read'); END IF;
 IF r.company_id IS NOT NULL THEN RETURN public.app_has_permission('company.read'); END IF;
 IF r.employee_id IS NOT NULL THEN RETURN public.app_has_permission('employee.hr.read'); END IF;
 IF r.deadline_id IS NOT NULL THEN RETURN public.app_has_permission('deadline.read') AND EXISTS(SELECT 1 FROM public.deadlines d WHERE d.id=r.deadline_id AND (d.employee_id IS NULL OR public.app_has_permission('employee.hr.read')) AND (d.document_id IS NULL OR public.document_visible(d.document_id)) AND (d.invoice_id IS NULL OR public.app_has_permission('invoice.read'))); END IF;
 IF r.installment_id IS NOT NULL THEN RETURN public.app_has_permission('invoice.read'); END IF;
 RETURN false; END $$;
CREATE FUNCTION public.register_work_record(kind text, source uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT (public.app_has_permission('task.create') OR public.app_has_permission('anomaly.read')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF kind NOT IN ('project','invoice','movement','document','order','delivery_note','offer','contract','company','employee','deadline','installment') THEN RAISE EXCEPTION 'Invalid record type'; END IF;
 EXECUTE format('INSERT INTO public.work_records(%I) VALUES($1) ON CONFLICT(%I) DO UPDATE SET %I=excluded.%I RETURNING id',kind||'_id',kind||'_id',kind||'_id',kind||'_id') INTO result USING source;
 IF NOT public.work_record_visible(result) THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE TABLE public.anomalies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES public.work_records(id),
 code text NOT NULL, title text NOT NULL, description text, severity text NOT NULL CHECK(severity IN ('info','warning','critical')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','ignored')),
 detected_at timestamptz NOT NULL DEFAULT now(), last_detected_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 assigned_to uuid REFERENCES public.profiles(id), reason text, fingerprint text NOT NULL, due_date date,
 UNIQUE(record_id,code), CHECK(status<>'ignored' OR length(trim(reason))>0)
);
CREATE FUNCTION public.anomaly_visible(anomaly uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.app_has_permission('anomaly.read') AND EXISTS(SELECT 1 FROM public.anomalies a WHERE a.id=anomaly AND public.work_record_visible(a.record_id)
 AND (a.code NOT IN ('commercial.overinvoiced','commercial.not_invoiced','commercial.invoice_without_ddt') OR public.app_has_permission('invoice.read')))
$$;
CREATE TABLE public.tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 240), description text, notes text,
 status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','completed','cancelled')),
 priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
 assigned_to uuid REFERENCES public.profiles(id), created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), due_date date, completed_at timestamptz,
 archived_at timestamptz, origin text NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','record','anomaly')),
 anomaly_id uuid REFERENCES public.anomalies(id), revision integer NOT NULL DEFAULT 0,
 CHECK((status='completed')=(completed_at IS NOT NULL)), CHECK((origin='anomaly')=(anomaly_id IS NOT NULL))
);
CREATE TABLE public.task_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES public.tasks(id), record_id uuid NOT NULL REFERENCES public.work_records(id), UNIQUE(task_id,record_id)
);
CREATE INDEX tasks_work_queue ON public.tasks(assigned_to,status,due_date) WHERE archived_at IS NULL;
CREATE INDEX task_records_record ON public.task_records(record_id);
CREATE INDEX anomalies_queue ON public.anomalies(status,severity,assigned_to);
CREATE FUNCTION public.task_visible(task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.app_has_permission('task.read') AND EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=task
 AND (t.anomaly_id IS NULL OR public.anomaly_visible(t.anomaly_id))
 AND NOT EXISTS(SELECT 1 FROM public.task_records l WHERE l.task_id=t.id AND NOT public.work_record_visible(l.record_id)))
$$;
ALTER TABLE public.work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomalies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_records,public.tasks,public.task_records,public.anomalies FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.work_records,public.tasks,public.task_records,public.anomalies TO authenticated;
CREATE POLICY work_records_read ON public.work_records FOR SELECT TO authenticated USING(public.work_record_visible(id));
CREATE POLICY tasks_read ON public.tasks FOR SELECT TO authenticated USING(public.task_visible(id));
CREATE POLICY task_records_read ON public.task_records FOR SELECT TO authenticated USING(public.task_visible(task_id));
CREATE POLICY anomalies_read ON public.anomalies FOR SELECT TO authenticated USING(public.anomaly_visible(id));
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_task_records AFTER INSERT OR DELETE ON public.task_records FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_anomalies_insert AFTER INSERT ON public.anomalies FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_anomalies_update AFTER UPDATE ON public.anomalies FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to OR OLD.reason IS DISTINCT FROM NEW.reason OR OLD.fingerprint IS DISTINCT FROM NEW.fingerprint) EXECUTE FUNCTION public.audit_mutation();

-- Reuse reconciliation and financial balances. Time is evaluated by PostgreSQL, no polling.
CREATE VIEW public.anomaly_candidates WITH(security_invoker=true) AS
 SELECT 'invoice'::text kind,i.id source_id,'invoice.project_required'::text code,'Fattura senza commessa richiesta'::text title,
 'Associare una commessa alla fattura o alle sue righe.'::text description,'warning'::text severity,NULL::date due_date,'required'::text fingerprint
 FROM public.invoices i WHERE i.archived_at IS NULL AND i.status NOT IN ('cancelled','credit_note','archived') AND i.project_required
 AND NOT EXISTS(SELECT 1 FROM public.invoice_projects p WHERE p.invoice_id=i.id) AND NOT EXISTS(SELECT 1 FROM public.invoice_lines l WHERE l.invoice_id=i.id AND l.project_id IS NOT NULL)
 UNION ALL SELECT 'invoice',i.id,'invoice.overdue','Fattura scaduta con residuo','Una o più scadenze hanno un residuo da regolare.','critical',min(b.due_date),min(b.due_date)::text
 FROM public.invoices i JOIN public.financial_deadline_balances b ON b.invoice_id=i.id JOIN public.invoice_financial_summary f ON f.invoice_id=i.id
 WHERE i.archived_at IS NULL AND i.status NOT IN ('cancelled','credit_note','archived') AND i.amount_total>0 AND f.residual>0 AND b.residual>0 AND b.due_date<CURRENT_DATE GROUP BY i.id
 UNION ALL SELECT 'invoice',i.id,'invoice.installments','Totale rate incoerente','La somma delle rate differisce dal totale fattura.','warning',NULL,i.amount_total::text||':'||sum(s.amount)::text
 FROM public.invoices i JOIN public.invoice_installments s ON s.invoice_id=i.id WHERE i.archived_at IS NULL AND i.status NOT IN ('cancelled','credit_note','archived') GROUP BY i.id HAVING abs(sum(s.amount)-i.amount_total)>0.01
 UNION ALL SELECT 'invoice',i.id,'invoice.review','Fattura da verificare','La fattura è stata esplicitamente segnalata da verificare.','warning',i.due_date,i.status
 FROM public.invoices i WHERE i.archived_at IS NULL AND i.status IN ('anomaly','to_check')
 UNION ALL SELECT c.kind,c.record_id,'commercial.'||c.code,c.message,c.message,CASE c.severity WHEN 'anomaly' THEN 'critical' WHEN 'attention' THEN 'warning' ELSE 'info' END,NULL,c.code
 FROM public.commercial_anomalies c
 UNION ALL SELECT 'document',d.id,'document.expiry',CASE WHEN d.expiry_date<CURRENT_DATE THEN 'Documento scaduto' ELSE 'Documento in scadenza' END,
 'Verificare validità e rinnovo del documento.',CASE WHEN d.expiry_date<CURRENT_DATE THEN 'critical' ELSE 'warning' END,d.expiry_date,d.expiry_date::text||CASE WHEN d.expiry_date<CURRENT_DATE THEN ':expired' ELSE ':soon' END
 FROM public.documents d WHERE d.archived_at IS NULL AND d.file_state='ready' AND d.status NOT IN ('archived','superseded') AND d.expiry_date<=CURRENT_DATE+30;
-- Internal candidate view: only the guarded synchronizer can materialize it.
REVOKE ALL ON public.anomaly_candidates FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.sync_anomalies() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET jit=off AS $$
DECLARE c record; rid uuid; active_keys text[]:='{}';
BEGIN
 IF NOT public.app_has_permission('anomaly.read') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(22002);
 FOR c IN SELECT * FROM public.anomaly_candidates LOOP
   BEGIN rid:=public.register_work_record(c.kind,c.source_id); EXCEPTION WHEN insufficient_privilege THEN CONTINUE; END;
   IF c.code IN ('commercial.overinvoiced','commercial.not_invoiced','commercial.invoice_without_ddt') AND NOT public.app_has_permission('invoice.read') THEN CONTINUE; END IF;
   active_keys:=array_append(active_keys,rid::text||':'||c.code);
   INSERT INTO public.anomalies(record_id,code,title,description,severity,due_date,fingerprint)
   VALUES(rid,c.code,c.title,c.description,c.severity,c.due_date,c.fingerprint)
   ON CONFLICT(record_id,code) DO UPDATE SET title=excluded.title,description=excluded.description,severity=excluded.severity,due_date=excluded.due_date,last_detected_at=now(),fingerprint=excluded.fingerprint,
    status=CASE WHEN anomalies.status='resolved' OR anomalies.fingerprint<>excluded.fingerprint THEN 'open' ELSE anomalies.status END,
    reason=CASE WHEN anomalies.status='resolved' OR anomalies.fingerprint<>excluded.fingerprint THEN NULL ELSE anomalies.reason END,resolved_at=NULL;
 END LOOP;
 UPDATE public.anomalies a SET status='resolved',resolved_at=now()
 WHERE a.status<>'resolved' AND public.anomaly_visible(a.id) AND NOT ((a.record_id::text||':'||a.code)=ANY(active_keys));
END $$;
CREATE FUNCTION public.save_task(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tid uuid:=nullif(payload->>'id','')::uuid; oldrow public.tasks; aid uuid:=nullif(payload->>'anomaly_id','')::uuid;
 assignee uuid:=nullif(payload->>'assigned_to','')::uuid; item jsonb; rid uuid; records uuid[]:='{}'; desired text:=coalesce(payload->>'status','todo');
BEGIN
 PERFORM pg_advisory_xact_lock(22003);
 IF NOT public.app_has_permission(CASE WHEN tid IS NULL THEN 'task.create' ELSE 'task.update' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF tid IS NOT NULL THEN
 SELECT * INTO oldrow FROM public.tasks WHERE id=tid FOR UPDATE;
 IF NOT public.task_visible(tid) OR oldrow.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Task unavailable' USING ERRCODE='42501'; END IF;
 IF oldrow.revision IS DISTINCT FROM (payload->>'revision')::int THEN RAISE EXCEPTION 'Attività modificata da un altro utente: ricaricare.' USING ERRCODE='40001'; END IF;
 aid:=oldrow.anomaly_id;
 END IF;
 IF assignee IS DISTINCT FROM oldrow.assigned_to AND assignee IS DISTINCT FROM auth.uid() AND NOT public.app_has_permission('task.assign') THEN RAISE EXCEPTION 'Assignment denied' USING ERRCODE='42501'; END IF;
 IF tid IS NOT NULL AND assignee IS DISTINCT FROM oldrow.assigned_to AND oldrow.assigned_to IS NOT NULL AND NOT public.app_has_permission('task.assign') THEN RAISE EXCEPTION 'Assignment denied' USING ERRCODE='42501'; END IF;
 IF assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=assignee AND p.active AND lower(split_part(u.email,'@',2))='simisrl.eu') THEN RAISE EXCEPTION 'Responsabile non attivo'; END IF;
 IF aid IS NOT NULL THEN
 IF NOT public.anomaly_visible(aid) THEN RAISE EXCEPTION 'Anomaly unavailable' USING ERRCODE='42501'; END IF;
 SELECT record_id INTO rid FROM public.anomalies WHERE id=aid; records:=array_append(records,rid);
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(payload->'records','[]')) LOOP
 rid:=public.register_work_record(item->>'kind',(item->>'id')::uuid); records:=array_append(records,rid);
 END LOOP;
 IF tid IS NULL THEN
 INSERT INTO public.tasks(legal_entity_id,title,description,notes,status,priority,assigned_to,created_by,due_date,completed_at,origin,anomaly_id)
 VALUES((payload->>'legal_entity_id')::uuid,trim(payload->>'title'),payload->>'description',payload->>'notes',desired,coalesce(payload->>'priority','medium'),assignee,auth.uid(),nullif(payload->>'due_date','')::date,CASE WHEN desired='completed' THEN now() END,CASE WHEN aid IS NOT NULL THEN 'anomaly' WHEN cardinality(records)>0 THEN 'record' ELSE 'manual' END,aid) RETURNING id INTO tid;
 ELSE
 UPDATE public.tasks SET legal_entity_id=(payload->>'legal_entity_id')::uuid,title=trim(payload->>'title'),description=payload->>'description',notes=payload->>'notes',status=desired,priority=payload->>'priority',assigned_to=assignee,due_date=nullif(payload->>'due_date','')::date,
 completed_at=CASE WHEN desired='completed' THEN coalesce(completed_at,now()) END,updated_at=now(),revision=revision+1 WHERE id=tid;
 END IF;
 DELETE FROM public.task_records WHERE task_id=tid AND NOT(record_id=ANY(records));
 INSERT INTO public.task_records(task_id,record_id) SELECT tid,unnest(records) ON CONFLICT DO NOTHING;
 RETURN tid;
END $$;
CREATE FUNCTION public.archive_task(task uuid, archived boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('task.archive') OR NOT public.task_visible(task) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE public.tasks SET archived_at=CASE WHEN archived THEN now() END,updated_at=now(),revision=revision+1 WHERE id=task;
END $$;
CREATE FUNCTION public.update_anomaly(anomaly uuid, operation text, assignee uuid DEFAULT NULL, motivation text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.sync_anomalies();
 IF NOT public.anomaly_visible(anomaly) THEN RAISE EXCEPTION 'Anomaly unavailable' USING ERRCODE='42501'; END IF;
 IF operation='assign' THEN
 IF NOT public.app_has_permission('anomaly.assign') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF assignee IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=assignee AND p.active AND lower(split_part(u.email,'@',2))='simisrl.eu') THEN RAISE EXCEPTION 'Responsabile non attivo'; END IF;
 UPDATE public.anomalies SET assigned_to=assignee WHERE id=anomaly;
 ELSIF operation='ignore' THEN
 IF NOT public.app_has_permission('anomaly.ignore') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF coalesce(length(trim(motivation)),0)=0 THEN RAISE EXCEPTION 'Motivazione obbligatoria'; END IF;
 UPDATE public.anomalies SET status='ignored',reason=trim(motivation) WHERE id=anomaly AND status='open';
 ELSIF operation='reopen' THEN
 IF NOT public.app_has_permission('anomaly.update') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE public.anomalies SET status='open',reason=NULL WHERE id=anomaly AND status='ignored';
 ELSE RAISE EXCEPTION 'Invalid operation'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.work_record_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_record_visible(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.register_work_record(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_work_record(text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.task_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.task_visible(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.anomaly_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anomaly_visible(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_anomalies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_anomalies() TO authenticated;
REVOKE ALL ON FUNCTION public.save_task(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_task(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_task(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_task(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.update_anomaly(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_anomaly(uuid,text,uuid,text) TO authenticated;
COMMIT;
