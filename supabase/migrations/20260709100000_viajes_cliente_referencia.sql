-- ============================================================================
-- Viajes (flete propio) · cliente_id real + referencia/transacción
--
-- Contexto: hoy `viajes` no tiene `cliente_id` — el cliente se guarda como
-- texto libre dentro de `notas` (regex "Cliente: X") y `operacion_id` nunca
-- se asigna al crear un viaje nuevo (solo se preserva al editar). Esto hace
-- imposible emparejar un viaje con el cliente/proforma de forma confiable.
--
-- Fix: agregar cliente_id (FK real) + el mismo patrón extensiv/manual que ya
-- usa `guias_paqueteria`, para que el módulo de Proforma pueda filtrar viajes
-- por cliente+periodo y, opcionalmente, emparejarlos por transacción.
--
-- OJO: `viajes.origen` YA EXISTE (ciudad de origen del viaje, ver
-- 20260504000014_tms.sql) — la columna nueva de "fuente de la referencia"
-- (extensiv|manual) se llama `referencia_origen` para no chocar con ella.
--
-- Todo nullable: hay filas legacy sin estos datos (no se puede backfill desde
-- el texto libre de `notas` de forma confiable).
-- ============================================================================

ALTER TABLE viajes ADD COLUMN IF NOT EXISTS cliente_id                UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS cliente_codigo            TEXT;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS referencia_origen         TEXT;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS extensiv_transaction_type TEXT;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS extensiv_transaction_id   TEXT;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS extensiv_customer_id      INT;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS referencia_manual         TEXT;

-- Mismo patrón de consistencia que `guias_origen_consistencia`, pero
-- permitiendo referencia_origen IS NULL (filas legacy sin este dato capturado).
ALTER TABLE viajes DROP CONSTRAINT IF EXISTS viajes_referencia_origen_consistencia;
ALTER TABLE viajes ADD CONSTRAINT viajes_referencia_origen_consistencia CHECK (
  referencia_origen IS NULL
  OR (referencia_origen = 'extensiv'
      AND extensiv_transaction_type IS NOT NULL
      AND extensiv_transaction_id   IS NOT NULL
      AND extensiv_customer_id      IS NOT NULL)
  OR (referencia_origen = 'manual'
      AND referencia_manual IS NOT NULL
      AND length(trim(referencia_manual)) > 0)
);

ALTER TABLE viajes DROP CONSTRAINT IF EXISTS viajes_referencia_origen_check;
ALTER TABLE viajes ADD CONSTRAINT viajes_referencia_origen_check
  CHECK (referencia_origen IS NULL OR referencia_origen IN ('extensiv','manual'));

ALTER TABLE viajes DROP CONSTRAINT IF EXISTS viajes_extensiv_transaction_type_check;
ALTER TABLE viajes ADD CONSTRAINT viajes_extensiv_transaction_type_check
  CHECK (extensiv_transaction_type IS NULL OR extensiv_transaction_type IN ('order','receipt'));

CREATE INDEX IF NOT EXISTS idx_viajes_cliente_fecha ON viajes(cliente_id, fecha_programada DESC);
CREATE INDEX IF NOT EXISTS idx_viajes_extensiv_txn   ON viajes(extensiv_transaction_id)
  WHERE extensiv_transaction_id IS NOT NULL;

COMMENT ON COLUMN viajes.cliente_id IS 'Cliente real del viaje (FK). Reemplaza el texto libre "Cliente: X" que se guardaba en notas.';
COMMENT ON COLUMN viajes.referencia_origen IS 'extensiv = ligado a transaction Extensiv; manual = referencia libre; NULL = viaje legacy sin este dato. NO confundir con viajes.origen (ciudad de origen del viaje).';

NOTIFY pgrst, 'reload schema';
