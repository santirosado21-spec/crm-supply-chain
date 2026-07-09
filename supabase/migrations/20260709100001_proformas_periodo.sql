-- ============================================================================
-- Módulo de Proforma consolidada (regreso del billing, con otro enfoque)
--
-- Contexto: el módulo de facturación anterior (ProformasPage/SekoBillingPage/
-- ExtensivBillingPage) se eliminó el 2026-05-22 apostando a que Extensiv
-- calcularía todo vía su Billing Wizard. Ese Wizard ya está configurado y
-- entrega exports CSV de cargos de almacén (WMS) por cliente — pero no cubre
-- flete (ni propio ni de paquetería), que nunca ha vivido en Extensiv.
--
-- Este módulo hace lo inverso al enfoque viejo: en vez de empujar cargos HACIA
-- Extensiv, se importa el CSV que Extensiv ya genera y se consolida en el CRM
-- con los movimientos de transporte (viajes + guias_paqueteria) de ese cliente
-- en un periodo, para armar una proforma con desglose de IVA/moneda.
--
-- La tabla `proformas` residual (de la función vieja) es 1-a-1 con una sola
-- `operacion_id` — no sirve para consolidar múltiples fuentes/periodo. Se crea
-- `proformas_periodo` aparte; `proformas` no se toca.
-- ============================================================================

-- 1. Header -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proformas_periodo (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  cliente_codigo        TEXT,
  cliente_nombre        TEXT          NOT NULL,
  referencia            TEXT          NOT NULL UNIQUE,
  periodo_desde         DATE          NOT NULL,
  periodo_hasta         DATE          NOT NULL,
  moneda                TEXT          NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN','USD')),
  tipo_cambio           NUMERIC(10,4),
  subtotal_wms          NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal_flete        NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal_paqueteria   NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_pct               NUMERIC(5,2)  NOT NULL DEFAULT 16,
  iva_monto             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado                TEXT          NOT NULL DEFAULT 'generada' CHECK (estado IN ('generada','cancelada')),
  csv_filename          TEXT,
  notas                 TEXT          DEFAULT '',
  creado_por            TEXT,
  cancelada_at          TIMESTAMPTZ,
  cancelada_por         TEXT,
  cancelada_motivo      TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT proformas_periodo_rango_valido CHECK (periodo_hasta >= periodo_desde)
);

CREATE INDEX IF NOT EXISTS idx_proformas_periodo_cliente ON proformas_periodo(cliente_id, periodo_desde DESC);
CREATE INDEX IF NOT EXISTS idx_proformas_periodo_estado  ON proformas_periodo(estado);

CREATE OR REPLACE FUNCTION proformas_periodo_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_proformas_periodo_updated_at ON proformas_periodo;
CREATE TRIGGER trg_proformas_periodo_updated_at
  BEFORE UPDATE ON proformas_periodo
  FOR EACH ROW EXECUTE FUNCTION proformas_periodo_set_updated_at();

-- 2. Líneas ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proforma_periodo_lineas (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id               UUID          NOT NULL REFERENCES proformas_periodo(id) ON DELETE CASCADE,
  seccion                   TEXT          NOT NULL CHECK (seccion IN ('wms','flete','paqueteria')),
  fuente                    TEXT          NOT NULL CHECK (fuente IN ('csv_extensiv','viaje','guia_paqueteria')),
  fuente_id                 UUID,
  referencia                TEXT,
  concepto                  TEXT          NOT NULL,
  cantidad                  NUMERIC(12,2) DEFAULT 1,
  precio_unitario           NUMERIC(12,2),
  monto                     NUMERIC(12,2) NOT NULL,
  moneda                    TEXT          NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN','USD')),
  incluida                  BOOLEAN       NOT NULL DEFAULT true,
  extensiv_transaction_id   TEXT,
  extensiv_charge_label     TEXT,
  raw_csv_row               JSONB,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proforma_periodo_lineas_proforma ON proforma_periodo_lineas(proforma_id);
CREATE INDEX IF NOT EXISTS idx_proforma_periodo_lineas_fuente   ON proforma_periodo_lineas(fuente, fuente_id)
  WHERE fuente_id IS NOT NULL;
-- Dedupe: qué filas del CSV de Extensiv ya se facturaron en una proforma
-- anterior no cancelada de este mismo cliente (join a proformas_periodo).
CREATE INDEX IF NOT EXISTS idx_proforma_periodo_lineas_csv_dedupe ON proforma_periodo_lineas(extensiv_transaction_id, extensiv_charge_label)
  WHERE fuente = 'csv_extensiv';

-- 3. RLS ----------------------------------------------------------------------
-- NOTA (2026-07-09): las policies "abiertas" del schema original NO llevaban
-- `TO authenticated` y por lo tanto alcanzaban también al rol `anon` (la anon
-- key viaja en el bundle JS público) — ver 20260516000003_rls_lockdown.sql,
-- que cerró ese hueco en 9 tablas operativas/financieras. Las tablas nuevas de
-- este módulo (financiero) deben nacer ya restringidas a `authenticated`.
ALTER TABLE proformas_periodo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_periodo_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_proformas_periodo ON proformas_periodo;
CREATE POLICY auth_all_proformas_periodo
  ON proformas_periodo FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_all_proforma_periodo_lineas ON proforma_periodo_lineas;
CREATE POLICY auth_all_proforma_periodo_lineas
  ON proforma_periodo_lineas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Comentarios ----------------------------------------------------------
COMMENT ON TABLE proformas_periodo IS
  'Proforma consolidada por cliente+periodo: cargos WMS (CSV Extensiv Billing Manager) + flete propio (viajes) + paquetería (guias_paqueteria), con IVA/moneda desglosados.';
COMMENT ON TABLE proforma_periodo_lineas IS
  'Detalle de una proformas_periodo. `fuente_id` apunta a viajes.id/guias_paqueteria.id cuando fuente != csv_extensiv.';
COMMENT ON COLUMN proforma_periodo_lineas.incluida IS
  'false = la línea se previsualizó pero el usuario la excluyó antes de guardar (no cuenta en los subtotales).';

NOTIFY pgrst, 'reload schema';
