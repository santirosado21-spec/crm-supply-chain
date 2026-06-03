-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Carta Porte ↔ Viaje: trazabilidad del Cotizador                              ║
-- ║                                                                              ║
-- ║ Agrega `viaje_id` opcional a `cartas_porte` para ligar una Carta Porte al    ║
-- ║ viaje confirmado que la origina. Permite auto-llenar Transporte/Figura/      ║
-- ║ destinatario desde un viaje creado vía el Cotizador.                         ║
-- ║                                                                              ║
-- ║ Migración 100% aditiva, RLS abierta sin cambios.                             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

ALTER TABLE cartas_porte
  ADD COLUMN IF NOT EXISTS viaje_id UUID REFERENCES viajes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cartas_porte_viaje ON cartas_porte (viaje_id)
  WHERE viaje_id IS NOT NULL;

COMMENT ON COLUMN cartas_porte.viaje_id IS
  'Viaje confirmado (del Cotizador) que origina esta Carta Porte. NULL si es standalone.';
