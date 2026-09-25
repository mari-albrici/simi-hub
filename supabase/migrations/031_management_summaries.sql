BEGIN;

-- Read-only economic projection. Both project access and management RLS remain in
-- force; excluded costs do not contribute to the project's actual cost.
CREATE VIEW public.project_management_allocations WITH (security_invoker = true) AS
  SELECT a.id, a.project_id, a.cost_entry_id, c.cost_date, c.description,
    c.source_type, c.source_id,
    COALESCE(a.invoice_id, CASE WHEN c.source_type = 'invoice' THEN c.source_id END) AS invoice_id,
    COALESCE(a.cost_category_id, c.cost_category_id) AS cost_category_id,
    COALESCE(category.name, 'Non classificato') AS category_name,
    c.supplier_id, supplier.business_name AS supplier_name, c.currency,
    CASE WHEN c.amount < 0 THEN -a.allocated_amount ELSE a.allocated_amount END AS economic_amount
  FROM public.management_allocations a
  JOIN public.cost_entries c ON c.id = a.cost_entry_id AND c.status = 'active'
  JOIN public.projects p ON p.id = a.project_id AND p.archived_at IS NULL
  LEFT JOIN public.management_cost_categories category ON category.id = COALESCE(a.cost_category_id, c.cost_category_id)
  LEFT JOIN public.companies supplier ON supplier.id = c.supplier_id
  WHERE public.app_has_permission('management.read') AND public.app_has_permission('project.read');
REVOKE ALL ON public.project_management_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.project_management_allocations TO authenticated;

CREATE FUNCTION public.project_management_cost_summary(p_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH movements AS (
    SELECT * FROM public.project_management_allocations WHERE project_id = p_project_id
  ), currencies AS (
    SELECT currency, sum(economic_amount) AS total, count(*) AS movement_count
    FROM movements GROUP BY currency
  ), categories AS (
    SELECT cost_category_id, category_name, currency, sum(economic_amount) AS total
    FROM movements GROUP BY cost_category_id, category_name, currency
  )
  SELECT jsonb_build_object(
    -- Never add unlike currencies. A mixed-currency project has per-currency totals.
    'totalCost', CASE WHEN (SELECT count(*) FROM currencies) <= 1
      THEN COALESCE((SELECT sum(total) FROM currencies), 0) ELSE NULL END,
    'allocationCount', (SELECT count(*) FROM movements),
    'byCurrency', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'currency', currency, 'totalCost', total, 'allocationCount', movement_count
    ) ORDER BY currency) FROM currencies), '[]'::jsonb),
    'byCategory', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'categoryId', cost_category_id, 'categoryName', category_name, 'currency', currency, 'totalCost', total
    ) ORDER BY currency, category_name) FROM categories), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.project_management_cost_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_management_cost_summary(uuid) TO authenticated;

CREATE FUNCTION public.management_reconciliation_summary()
RETURNS TABLE (
  currency text, total_active_costs numeric, allocated numeric,
  remaining_in_cost_centers numeric, remaining_unallocated numeric,
  excluded_costs numeric, net_active_costs numeric, balance_difference numeric
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH totals AS (
    SELECT b.currency,
      COALESCE(sum(abs(b.amount)) FILTER (WHERE b.status = 'active'), 0) AS active_total,
      COALESCE(sum(b.allocated_amount) FILTER (WHERE b.status = 'active'), 0) AS allocated_total,
      COALESCE(sum(greatest(abs(b.amount) - b.allocated_amount, 0))
        FILTER (WHERE b.status = 'active' AND b.cost_center_id IS NOT NULL), 0) AS center_total,
      COALESCE(sum(greatest(abs(b.amount) - b.allocated_amount, 0))
        FILTER (WHERE b.status = 'active' AND b.cost_center_id IS NULL), 0) AS unallocated_total,
      COALESCE(sum(abs(b.amount)) FILTER (WHERE b.status = 'excluded'), 0) AS excluded_total,
      COALESCE(sum(b.amount) FILTER (WHERE b.status = 'active'), 0) AS net_total
    FROM public.cost_entry_balances b
    WHERE public.app_has_permission('management.read')
    GROUP BY b.currency
  )
  SELECT currency, active_total, allocated_total, center_total, unallocated_total,
    excluded_total, net_total, active_total - allocated_total - center_total - unallocated_total
  FROM totals ORDER BY currency;
$$;
REVOKE ALL ON FUNCTION public.management_reconciliation_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.management_reconciliation_summary() TO authenticated;

COMMIT;
