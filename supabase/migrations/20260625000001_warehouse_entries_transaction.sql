-- ============================================================================
-- warehouse_entries · trazabilidad por transacción + auto-verificación de totales
--
-- Objetivo 1: en el Paso 3 se captura el número de transacción de Extensiv para
-- trazabilidad y log de entradas pasadas.
-- Objetivo 2: el total declarado del documento se guarda para auto-verificar que
-- la extracción capturó todas las líneas.
--
-- Aditiva (IF NOT EXISTS). RLS ya activa en la tabla.
-- ============================================================================

ALTER TABLE warehouse_entries ADD COLUMN IF NOT EXISTS extensiv_transaction_id TEXT;
ALTER TABLE warehouse_entries ADD COLUMN IF NOT EXISTS document_total_qty INTEGER;

CREATE INDEX IF NOT EXISTS idx_we_transaction ON warehouse_entries(extensiv_transaction_id);

COMMENT ON COLUMN warehouse_entries.extensiv_transaction_id IS
  'Número de transacción/receiver de Extensiv capturado en el Paso 3 (trazabilidad/log).';
COMMENT ON COLUMN warehouse_entries.document_total_qty IS
  'Total de unidades declarado en la nota original, para auto-verificación de completitud.';
