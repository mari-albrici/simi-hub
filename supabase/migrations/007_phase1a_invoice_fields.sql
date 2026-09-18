-- Fase 1A: metadata fiscali e dettagli riga aggiuntivi. Additivo e sicuro per dati esistenti.
BEGIN;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS registration_date date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS vat_treatment text;
ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS discount numeric(14,4) NOT NULL DEFAULT 0;
ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.invoice_installments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE public.invoice_installments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_currency_code CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_discount_valid CHECK (discount >= 0 AND discount <= 100) NOT VALID;
CREATE INDEX IF NOT EXISTS idx_invoices_currency ON public.invoices(currency);
CREATE INDEX IF NOT EXISTS idx_invoices_registration_date ON public.invoices(registration_date);
CREATE INDEX IF NOT EXISTS idx_invoice_installments_status_due ON public.invoice_installments(status,due_date);

-- Wrapper estende la RPC transazionale della Fase 0 senza modificarne la firma già pubblicata.
CREATE OR REPLACE FUNCTION public.save_invoice_phase1(payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invoice_id uuid; item jsonb;
BEGIN
  invoice_id := public.save_invoice(payload);
  UPDATE public.invoices SET received_date=NULLIF(payload->>'received_date','')::date,
    registration_date=NULLIF(payload->>'registration_date','')::date,
    currency=upper(COALESCE(NULLIF(payload->>'currency',''),'EUR')),
    vat_treatment=NULLIF(payload->>'vat_treatment',''),
    document_id=NULLIF(payload->>'document_id','')::uuid WHERE id=invoice_id;
  IF NULLIF(payload->>'document_id','') IS NOT NULL THEN
    UPDATE public.documents SET file_state='ready' WHERE id=(payload->>'document_id')::uuid AND created_by=auth.uid() AND file_state='pending';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'lines','[]'::jsonb)) LOOP
    IF NULLIF(item->>'id','') IS NOT NULL THEN
      UPDATE public.invoice_lines SET unit=NULLIF(item->>'unit',''), discount=COALESCE(NULLIF(item->>'discount','')::numeric,0), notes=NULLIF(item->>'notes','') WHERE id=(item->>'id')::uuid AND invoice_id=save_invoice_phase1.invoice_id;
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'installments','[]'::jsonb)) LOOP
    IF NULLIF(item->>'id','') IS NOT NULL THEN
      UPDATE public.invoice_installments SET status=COALESCE(NULLIF(item->>'status',''),'open'), notes=NULLIF(item->>'notes','') WHERE id=(item->>'id')::uuid AND invoice_id=save_invoice_phase1.invoice_id;
    END IF;
  END LOOP;
  RETURN invoice_id;
END $$;
REVOKE ALL ON FUNCTION public.save_invoice_phase1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_invoice_phase1(jsonb) TO authenticated;
COMMIT;
