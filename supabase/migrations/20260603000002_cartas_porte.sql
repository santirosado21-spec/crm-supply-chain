-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Carta Porte 3.1 — esquema operativo                                          ║
-- ║                                                                              ║
-- ║ Tabla `cartas_porte` para almacenar Cartas Porte generadas desde el CRM.    ║
-- ║ Alcance: PDF + XML CFDI 4.0 sin timbrar (PAC externo). Standalone por ahora —║
-- ║ no integrado con cartas_instruccion (el FK suave existe pero queda fase 2). ║
-- ║                                                                              ║
-- ║ Migración 100% aditiva. RLS abierta. Realtime habilitado.                    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS cartas_porte (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio                 TEXT NOT NULL UNIQUE,                       -- ej. "CP-2026-0001"
  fecha                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                TEXT NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador','exportada','timbrada','cancelada')),

  -- Snapshot del emisor al momento de generar (immutable post-timbrado)
  emisor_rfc            TEXT,
  emisor_razon_social   TEXT,
  emisor_regimen_fiscal TEXT,
  emisor_cp_expedicion  TEXT,

  -- Estructura del comprobante (JSONB tipados en TS)
  -- remitente:    { rfc, nombre, calle, numext, colonia, cp, estado, municipio, referencia? }
  -- destinatarios: array<Ubicacion>
  -- transporte:   { placas, linea, remolque, pesoBrutoVehicular, rfcPermisionario? }
  -- figura:       { operadorNombre, operadorRfc, operadorLicencia }
  -- mercancias:   array<{ descripcion, descripcionSat, claveSat, unidad, cantidad,
  --                       pesoBruto, pesoNeto, valor? }>
  remitente             JSONB NOT NULL DEFAULT '{}'::jsonb,
  destinatarios         JSONB NOT NULL DEFAULT '[]'::jsonb,
  transporte            JSONB NOT NULL DEFAULT '{}'::jsonb,
  figura                JSONB NOT NULL DEFAULT '{}'::jsonb,
  mercancias            JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Totales (calculados client-side; espejo aquí para reportes rápidos)
  total_peso_bruto      NUMERIC(14,3) DEFAULT 0,
  total_peso_neto       NUMERIC(14,3) DEFAULT 0,

  -- Output
  xml_content           TEXT,                                       -- CFDI 4.0 sin timbrar
  pdf_url               TEXT,                                       -- opcional (Supabase Storage)
  uuid_sat              TEXT,                                       -- llenado tras timbrado externo

  -- Trazabilidad
  notas                 TEXT DEFAULT '',
  creado_por            TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cartas_porte_fecha  ON cartas_porte (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cartas_porte_status ON cartas_porte (status);
CREATE INDEX IF NOT EXISTS idx_cartas_porte_folio  ON cartas_porte (folio);

-- Trigger updated_at (patrón ya usado en cartas_instruccion)
CREATE OR REPLACE FUNCTION cartas_porte_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cartas_porte_updated_at ON cartas_porte;
CREATE TRIGGER trg_cartas_porte_updated_at
  BEFORE UPDATE ON cartas_porte
  FOR EACH ROW EXECUTE FUNCTION cartas_porte_set_updated_at();

-- RLS abierta (consistente con el resto del repo)
ALTER TABLE cartas_porte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_cartas_porte ON cartas_porte;
CREATE POLICY anon_all_cartas_porte
  ON cartas_porte FOR ALL USING (true) WITH CHECK (true);

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cartas_porte;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMENT ON TABLE cartas_porte IS
  'Cartas Porte generadas desde /tms/carta-porte. PDF + XML CFDI 4.0 sin timbrar.';
COMMENT ON COLUMN cartas_porte.folio IS
  'Folio único: CP-YYYY-NNNN. Calculado client-side desde MAX(folio).';
COMMENT ON COLUMN cartas_porte.status IS
  'borrador (en edición) · exportada (XML generado) · timbrada (con UUID SAT) · cancelada';
