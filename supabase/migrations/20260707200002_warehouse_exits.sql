-- ============================================================================
-- Warehouse Exits · registro de salidas de almacén
--
-- Contraparte de warehouse_entries, pero deliberadamente simple (una sola
-- pantalla: registrar + cerrar), sin integración con la API de Extensiv
-- (el ship-out vía API sigue bloqueado — ver memoria
-- extensiv-shipout-blocked-on-api). El cierre solo vive en nuestro CRM y
-- requiere evidencia (link de Google Drive), igual que warehouse_entries.
--
-- Patrón base: 20260624000001_warehouse_entries.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS warehouse_exits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              DATE NOT NULL DEFAULT CURRENT_DATE,

  ref                TEXT,
  customer_id        INTEGER,
  customer_name      TEXT NOT NULL DEFAULT '',

  -- items de la salida: [{sku, qty, description}]
  items              JSONB NOT NULL DEFAULT '[]'::jsonb,
  notas              TEXT DEFAULT '',

  status             TEXT NOT NULL DEFAULT 'abierta'
    CHECK (status IN ('abierta','cerrada','cancelada')),
  completion_evidence_url TEXT,

  created_by         TEXT,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wex_status_fecha ON warehouse_exits(status, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_wex_customer     ON warehouse_exits(customer_id);
CREATE INDEX IF NOT EXISTS idx_wex_created_by   ON warehouse_exits(created_by);

CREATE OR REPLACE FUNCTION warehouse_exits_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wex_updated_at ON warehouse_exits;
CREATE TRIGGER trg_wex_updated_at
  BEFORE UPDATE ON warehouse_exits
  FOR EACH ROW EXECUTE FUNCTION warehouse_exits_set_updated_at();

ALTER TABLE warehouse_exits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_all_warehouse_exits ON warehouse_exits;
CREATE POLICY anon_all_warehouse_exits
  ON warehouse_exits FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_exits;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cierre: requiere link de Google Drive (reutiliza is_google_drive_url de 20260707100002).
CREATE OR REPLACE FUNCTION warehouse_exit_close(
  p_id            UUID,
  p_evidence_url  TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_google_drive_url(p_evidence_url) THEN
    RAISE EXCEPTION 'Captura un link de Google Drive válido para cerrar la salida';
  END IF;

  UPDATE warehouse_exits
     SET status = 'cerrada',
         completed_at = now(),
         completion_evidence_url = btrim(p_evidence_url)
   WHERE id = p_id AND status = 'abierta';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salida no encontrada o ya estaba cerrada/cancelada';
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION warehouse_exit_close(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION warehouse_exit_close(UUID, TEXT) TO authenticated, anon;

COMMENT ON TABLE warehouse_exits IS
  'Salidas de almacén registradas manualmente. Cierre requiere link de Google Drive como evidencia. Sin integración con Extensiv (ship-out vía API bloqueado).';
