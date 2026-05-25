-- ============================================================================
-- Fix RLS — tablas del sprint techship
--
-- La migración 20260515000001 creó las 7 tablas con políticas
--   CREATE POLICY open_all_<t> ... FOR ALL USING (true) WITH CHECK (true)
-- SIN cláusula `TO`. Una policy sin `TO` aplica a TODOS los roles, incluido
-- `anon` — y la anon key viaja embebida en el bundle JS del frontend. Eso dejó
-- legibles/escribibles para cualquiera con la URL pública del proyecto:
--   parcel_addresses      → PII (nombres, emails, teléfonos, direcciones)
--   markup_profile_rules  → márgenes y precios del negocio
--
-- El resto del schema (ver 20260507000002) restringe las tablas a
-- `TO authenticated`. Esta migración re-crea las 7 políticas con esa cláusula,
-- conservando el modelo single-tenant: cualquier empleado con sesión opera,
-- pero el rol anónimo queda fuera.
-- ============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'markup_profiles','markup_profile_rules','parcel_addresses',
    'manifests','manifest_guias','parcel_order_templates','parcel_print_queue'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Elimina la policy abierta original y cualquier re-ejecución previa.
    EXECUTE format('DROP POLICY IF EXISTS open_all_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS auth_all_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY auth_all_%I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t);
  END LOOP;
END $$;
