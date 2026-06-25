-- ============================================================================
-- Warehouse Entries · wizard de entradas de almacén (3 pasos)
--
-- Unifica los 3 pasos del proceso de entradas (validar alta de SKUs →
-- facilitador / generar receipt → verificar inventario) en un solo flujo
-- guiado con estado compartido. Registra cada entrada: cliente, nota original,
-- validación de alta, export generado, verificación contra inventario y las
-- anomalías anotadas. Da historial y permite reanudar el flujo si el usuario
-- recarga o sale a Extensiv entre pasos.
--
-- Patrón base: 20260506000002_cartas_instruccion.sql (JSONB + CHECK status +
-- trazabilidad por email + RLS abierta + trigger updated_at).
-- ============================================================================

CREATE TABLE IF NOT EXISTS warehouse_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Estado del flujo wizard
  flow_status        TEXT NOT NULL DEFAULT 'paso1'
    CHECK (flow_status IN ('paso1','paso2','paso3','completada','cancelada')),
  current_step       SMALLINT NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 3),

  -- Cliente Extensiv (capturado en Paso 1)
  customer_id        INTEGER,
  customer_name      TEXT NOT NULL DEFAULT '',

  -- Nota original (Paso 1) — solo metadatos + items, NO el binario
  nota_file_name     TEXT,
  extracted_via      TEXT CHECK (extracted_via IN ('vision','text') OR extracted_via IS NULL),
  ref                TEXT,
  -- items extraídos de la nota: [{sku, qty, serialNumber}]
  original_items     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Paso 1: validación de alta en Extensiv
  -- [{sku, qty, registered}]
  step1_results      JSONB NOT NULL DEFAULT '[]'::jsonb,
  step1_complete     BOOLEAN NOT NULL DEFAULT false,

  -- Paso 2: items finales editados + export
  -- [{sku, qty, serialNumber}]
  step2_items        JSONB NOT NULL DEFAULT '[]'::jsonb,
  export_generated   BOOLEAN NOT NULL DEFAULT false,
  export_file_name   TEXT,

  -- Paso 3: verificación contra inventario actual + anomalías
  -- [{sku, qtyDoc, qtyExt, status, anomaly}]
  step3_results      JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- anomalías por sku para reporte rápido: {sku: "texto libre"}
  anomalies          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Trazabilidad (por email — LocalUser no tiene id)
  created_by         TEXT,
  completed_at       TIMESTAMPTZ,
  notas              TEXT DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_we_status_fecha ON warehouse_entries(flow_status, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_we_customer     ON warehouse_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_we_created_by   ON warehouse_entries(created_by);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION warehouse_entries_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_we_updated_at ON warehouse_entries;
CREATE TRIGGER trg_we_updated_at
  BEFORE UPDATE ON warehouse_entries
  FOR EACH ROW EXECUTE FUNCTION warehouse_entries_set_updated_at();

ALTER TABLE warehouse_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_all_warehouse_entries ON warehouse_entries;
CREATE POLICY anon_all_warehouse_entries
  ON warehouse_entries FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE warehouse_entries IS
  'Entradas de almacén procesadas por el wizard de 3 pasos (validación de alta → facilitador → verificación de inventario).';
COMMENT ON COLUMN warehouse_entries.flow_status IS
  'paso1 (validar alta) · paso2 (facilitador/export) · paso3 (verificar inventario) · completada · cancelada';
COMMENT ON COLUMN warehouse_entries.original_items IS
  'JSONB array inmutable de la nota original: [{sku, qty, serialNumber}]. El Paso 3 valida contra esta nota.';
COMMENT ON COLUMN warehouse_entries.anomalies IS
  'JSONB objeto {sku: "texto libre"} con las inconsistencias anotadas en el Paso 3.';
