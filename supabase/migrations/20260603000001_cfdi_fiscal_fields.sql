-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ CFDI 4.0 — Fiscal fields                                                     ║
-- ║ Agrega campos fiscales SAT a clients, crea emisor_config (single-row) y      ║
-- ║ cfdi_drafts (borradores). Base para Carta Porte y futura facturación.        ║
-- ║                                                                              ║
-- ║ Replica el contenido de la migración archivada                                ║
-- ║ ~/Desktop/CRM SUPPLY CHAIN DEFINITIVO/supabase_migration_cfdi_fiscal_fields.sql║
-- ║ que nunca se aplicó. Aditiva, RLS abierta.                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Campos CFDI 4.0 en clients ──────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS rfc                  TEXT,
  ADD COLUMN IF NOT EXISTS razon_social         TEXT,
  ADD COLUMN IF NOT EXISTS cp_fiscal            TEXT,
  ADD COLUMN IF NOT EXISTS regimen_fiscal_sat   TEXT,
  ADD COLUMN IF NOT EXISTS uso_cfdi_default     TEXT;

-- ── 2. emisor_config (single-row: somos el único emisor) ───────────────────
CREATE TABLE IF NOT EXISTS emisor_config (
  id                   SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rfc                  TEXT NOT NULL,
  razon_social         TEXT NOT NULL,
  regimen_fiscal_sat   TEXT NOT NULL,
  cp_expedicion        TEXT NOT NULL,
  serie_default        TEXT DEFAULT 'A',
  folio_proximo        INTEGER DEFAULT 1,
  certificado_numero   TEXT,
  logo_url             TEXT,
  updated_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE emisor_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read emisor" ON emisor_config;
CREATE POLICY "anon read emisor" ON emisor_config FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth write emisor" ON emisor_config;
CREATE POLICY "auth write emisor" ON emisor_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed inicial (placeholders — el usuario los completa en /wms/emisor-config)
INSERT INTO emisor_config (id, rfc, razon_social, regimen_fiscal_sat, cp_expedicion)
VALUES (1, 'XAXX010101000', 'Supply Chain MX (placeholder)', '601', '52004')
ON CONFLICT (id) DO NOTHING;

-- ── 3. cfdi_drafts (borradores de CFDI genéricos) ──────────────────────────
CREATE TABLE IF NOT EXISTS cfdi_drafts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_codigo       TEXT NOT NULL,
  cliente_rfc          TEXT,
  serie                TEXT NOT NULL,
  folio                INTEGER NOT NULL,
  fecha                TIMESTAMPTZ NOT NULL DEFAULT now(),
  periodo              TEXT,
  subtotal             NUMERIC(14, 2) NOT NULL,
  iva                  NUMERIC(14, 2) NOT NULL,
  total                NUMERIC(14, 2) NOT NULL,
  xml_content          TEXT,
  estado               TEXT DEFAULT 'borrador',
  uuid_sat             TEXT,
  conceptos_json       JSONB,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(serie, folio)
);

CREATE INDEX IF NOT EXISTS idx_cfdi_cliente ON cfdi_drafts(cliente_codigo);
CREATE INDEX IF NOT EXISTS idx_cfdi_periodo ON cfdi_drafts(periodo);
CREATE INDEX IF NOT EXISTS idx_cfdi_estado ON cfdi_drafts(estado);

ALTER TABLE cfdi_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read cfdi" ON cfdi_drafts;
CREATE POLICY "anon read cfdi" ON cfdi_drafts FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth all cfdi" ON cfdi_drafts;
CREATE POLICY "auth all cfdi" ON cfdi_drafts FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE emisor_config IS
  'Datos del emisor (Supply Chain MX) para CFDI 4.0. Single-row con CHECK id=1.';
COMMENT ON TABLE cfdi_drafts IS
  'Borradores de CFDI 4.0 genéricos. Para Carta Porte ver tabla cartas_porte.';
