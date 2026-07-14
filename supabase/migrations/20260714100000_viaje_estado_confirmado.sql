-- ============================================================================
-- Viajes · nuevo estado 'confirmado'
--
-- Cuando se confirma una cotización en el Cotizador, el viaje se registra
-- directo como 'confirmado' (ya con cliente y referencia ligados), para que
-- Transportes lo vea en su sección de "viajes confirmados" sin recapturarlo.
-- 'confirmado' YA es facturable: entra directo a la proforma del cliente
-- (ver VIAJE_ESTADOS_FACTURABLES en src/lib/proformaBuilder.ts). Transportes
-- puede seguir moviéndolo a Completado/Entregado cuando se realice.
--
-- Aditivo: ningún dato existente viola el CHECK ampliado.
-- ============================================================================

-- El CHECK de estado se llama `viajes_estado_check` (Postgres normaliza el
-- IN a `= ANY(ARRAY[...])`). Se re-crea incluyendo 'confirmado'.
ALTER TABLE viajes DROP CONSTRAINT IF EXISTS viajes_estado_check;
ALTER TABLE viajes ADD CONSTRAINT viajes_estado_check
  CHECK (estado IN ('pendiente','confirmado','asignado','en_transito','entregado','completado','cancelado'));

NOTIFY pgrst, 'reload schema';
