-- ============================================================================
-- RLS lockdown — cerrar el acceso del rol `anon` a las tablas operativas
--
-- Varias migraciones tempranas crearon políticas `FOR ALL USING (true)` SIN
-- cláusula `TO`. Una policy sin `TO` aplica a TODOS los roles, incluido `anon`
-- — y la anon key viaja embebida en el bundle JS público del frontend. Eso
-- dejó legibles/escribibles, para cualquiera con la URL del proyecto, datos
-- operativos y financieros: viajes, vehículos, guías, ventas, etc.
--
-- Esta migración re-crea esas 9 políticas restringidas a `TO authenticated`,
-- conservando el modelo single-tenant (cualquier empleado con sesión opera).
--
-- NO se tocan:
--   - task_tracker (ya restringido por 20260504000012)
--   - clients / operations (ya `TO authenticated` desde el schema inicial)
--   - mx_postal_codes (lectura pública intencional — datos no sensibles)
--   - carrier_credentials (ya admin-only)
--   - tablas del sprint techship (ya restringidas por 20260516000001)
--
-- Las edge functions usan la service_role key, que ignora RLS — este cambio
-- no afecta al webhook de tracking ni a los proxies.
-- ============================================================================

-- ── TMS: proveedores / vehículos / operadores / viajes ──────────────────────
DROP POLICY IF EXISTS anon_all_proveedores ON proveedores_transporte;
DROP POLICY IF EXISTS auth_all_proveedores ON proveedores_transporte;
CREATE POLICY auth_all_proveedores ON proveedores_transporte
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_all_vehiculos ON vehiculos;
DROP POLICY IF EXISTS auth_all_vehiculos ON vehiculos;
CREATE POLICY auth_all_vehiculos ON vehiculos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_all_operadores ON operadores;
DROP POLICY IF EXISTS auth_all_operadores ON operadores;
CREATE POLICY auth_all_operadores ON operadores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_all_viajes ON viajes;
DROP POLICY IF EXISTS auth_all_viajes ON viajes;
CREATE POLICY auth_all_viajes ON viajes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seko movements ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS anon_all_seko_movements ON seko_movements;
DROP POLICY IF EXISTS auth_all_seko_movements ON seko_movements;
CREATE POLICY auth_all_seko_movements ON seko_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Ventas / métricas ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS anon_all ON ventas_metricas;
DROP POLICY IF EXISTS auth_all_ventas_metricas ON ventas_metricas;
CREATE POLICY auth_all_ventas_metricas ON ventas_metricas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Eventos de tracking de paquetería ───────────────────────────────────────
DROP POLICY IF EXISTS tracking_evt_all ON shipment_tracking_events;
DROP POLICY IF EXISTS auth_all_shipment_tracking_events ON shipment_tracking_events;
CREATE POLICY auth_all_shipment_tracking_events ON shipment_tracking_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Cartas de instrucción ───────────────────────────────────────────────────
DROP POLICY IF EXISTS anon_all_cartas_instruccion ON cartas_instruccion;
DROP POLICY IF EXISTS auth_all_cartas_instruccion ON cartas_instruccion;
CREATE POLICY auth_all_cartas_instruccion ON cartas_instruccion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Guías de paquetería ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS anon_all_guias_paqueteria ON guias_paqueteria;
DROP POLICY IF EXISTS auth_all_guias_paqueteria ON guias_paqueteria;
CREATE POLICY auth_all_guias_paqueteria ON guias_paqueteria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
