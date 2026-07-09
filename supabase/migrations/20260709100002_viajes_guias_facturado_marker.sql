-- ============================================================================
-- Marca de "facturado" en viajes y guias_paqueteria
--
-- Al guardar una proforma_periodo, las líneas de tipo 'viaje'/'guia_paqueteria'
-- incluidas quedan marcadas con `facturado_en_proforma_id` (RPC
-- save_proforma_periodo, ver 20260709100003). Así la siguiente proforma del
-- mismo cliente no vuelve a ofrecer esos mismos viajes/guías como pendientes.
--
-- Si la proforma se cancela (RPC cancel_proforma_periodo), esta columna se
-- libera (NULL) para que puedan re-facturarse en la proforma correcta.
--
-- Depende de 20260709100001_proformas_periodo.sql (la FK apunta ahí).
-- ============================================================================

ALTER TABLE viajes           ADD COLUMN IF NOT EXISTS facturado_en_proforma_id UUID REFERENCES proformas_periodo(id) ON DELETE SET NULL;
ALTER TABLE guias_paqueteria ADD COLUMN IF NOT EXISTS facturado_en_proforma_id UUID REFERENCES proformas_periodo(id) ON DELETE SET NULL;

-- Índices parciales: aceleran la query "disponibles para facturar" que corre
-- cada vez que se arma una proforma (filtra cliente+periodo+no facturado).
CREATE INDEX IF NOT EXISTS idx_viajes_no_facturados           ON viajes(cliente_id, fecha_programada)
  WHERE facturado_en_proforma_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_guias_paqueteria_no_facturadas ON guias_paqueteria(cliente_id, fecha)
  WHERE facturado_en_proforma_id IS NULL;

COMMENT ON COLUMN viajes.facturado_en_proforma_id IS
  'NULL = disponible para incluir en una proforma futura. Seteado por save_proforma_periodo, liberado por cancel_proforma_periodo.';
COMMENT ON COLUMN guias_paqueteria.facturado_en_proforma_id IS
  'NULL = disponible para incluir en una proforma futura. Seteado por save_proforma_periodo, liberado por cancel_proforma_periodo.';

NOTIFY pgrst, 'reload schema';
