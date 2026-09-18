-- Fase 1G remediation: server-side relation actions for offer/contract links.
BEGIN;
CREATE OR REPLACE FUNCTION public.set_offer_order(p_offer uuid,p_order uuid,p_linked boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('offer.update') OR NOT EXISTS(SELECT 1 FROM public.offers WHERE id=p_offer AND archived_at IS NULL) OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order AND archived_at IS NULL) THEN RAISE EXCEPTION 'Access denied or record unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.offers f JOIN public.orders o ON o.id=p_order WHERE f.id=p_offer AND (f.legal_entity_id<>o.legal_entity_id OR f.counterparty_id IS DISTINCT FROM o.counterparty_id OR o.order_type<>'sale' OR f.currency<>o.currency)) THEN RAISE EXCEPTION 'Offerta e ordine incompatibili' USING ERRCODE='23514'; END IF;
 IF p_linked THEN INSERT INTO public.offer_orders(offer_id,order_id) VALUES(p_offer,p_order) ON CONFLICT DO NOTHING; ELSE DELETE FROM public.offer_orders WHERE offer_id=p_offer AND order_id=p_order; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.set_contract_order(p_contract uuid,p_order uuid,p_linked boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('contract.update') OR NOT EXISTS(SELECT 1 FROM public.contracts WHERE id=p_contract AND archived_at IS NULL) OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order AND archived_at IS NULL) THEN RAISE EXCEPTION 'Access denied or record unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.contracts c JOIN public.orders o ON o.id=p_order WHERE c.id=p_contract AND (c.legal_entity_id<>o.legal_entity_id OR c.counterparty_id IS DISTINCT FROM o.counterparty_id)) THEN RAISE EXCEPTION 'Contratto e ordine incompatibili' USING ERRCODE='23514'; END IF;
 IF p_linked THEN INSERT INTO public.contract_orders(contract_id,order_id) VALUES(p_contract,p_order) ON CONFLICT DO NOTHING; ELSE DELETE FROM public.contract_orders WHERE contract_id=p_contract AND order_id=p_order; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.set_contract_invoice(p_contract uuid,p_invoice uuid,p_linked boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('contract.update') OR NOT EXISTS(SELECT 1 FROM public.contracts WHERE id=p_contract AND archived_at IS NULL) OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=p_invoice AND archived_at IS NULL) THEN RAISE EXCEPTION 'Access denied or record unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.contracts c JOIN public.invoices i ON i.id=p_invoice WHERE c.id=p_contract AND (c.legal_entity_id<>i.legal_entity_id OR c.counterparty_id IS DISTINCT FROM CASE WHEN i.invoice_type='purchase' THEN i.supplier_id ELSE i.customer_id END OR (c.currency IS NOT NULL AND c.currency<>i.currency))) THEN RAISE EXCEPTION 'Contratto e fattura incompatibili' USING ERRCODE='23514'; END IF;
 IF p_linked THEN INSERT INTO public.contract_invoices(contract_id,invoice_id) VALUES(p_contract,p_invoice) ON CONFLICT DO NOTHING; ELSE DELETE FROM public.contract_invoices WHERE contract_id=p_contract AND invoice_id=p_invoice; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.set_offer_order(uuid,uuid,boolean),public.set_contract_order(uuid,uuid,boolean),public.set_contract_invoice(uuid,uuid,boolean) TO authenticated;
COMMIT;
