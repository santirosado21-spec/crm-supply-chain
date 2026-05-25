-- ============================================================================
-- RPC: incremento atómico de parcel_order_templates.use_count
--
-- useOrderTemplates.markUsed leía use_count en el cliente y escribía +1. Dos
-- usuarios usando la misma plantilla a la vez se pisan (lost update). Un UPDATE
-- relativo en el servidor es atómico y no se puede hacer desde el SDK sin RPC.
--
-- SECURITY INVOKER (default): la RLS de parcel_order_templates sigue aplicando,
-- así que el rol anon no puede incrementar (su UPDATE afecta 0 filas).
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_template_use_count(p_id UUID)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE parcel_order_templates
     SET use_count    = use_count + 1,
         last_used_at = now()
   WHERE id = p_id;
$$;
