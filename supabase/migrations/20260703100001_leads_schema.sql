-- ============================================================================
-- Módulo Comercial — Seguimiento de Leads
--
-- Tablas leads + lead_notes. Ver plan en
-- ~/.claude/plans/act-a-como-arquitecto-senior-sunny-scott.md §1.
--
-- estatus (etapa del pipeline, 7 valores) y nivel_interes (temperatura del
-- lead, 5 valores) son ejes independientes — no se derivan uno del otro.
-- servicio_interes usa el catálogo real y ya vigente del formulario de la
-- landing (index.html de supply-chain-mexico-web, líneas 796-809).
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                   TEXT UNIQUE,
  nombre                TEXT NOT NULL,
  empresa               TEXT,
  cargo                 TEXT,
  correo                TEXT,
  telefono              TEXT,
  canal                 TEXT NOT NULL CHECK (canal IN (
    'landing_page','instagram','linkedin','cold_email','organico'
  )),
  fecha_entrada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  servicio_interes      TEXT NOT NULL CHECK (servicio_interes IN (
    'Almacenaje de Mercancías',
    'Gestión de Activos (Asset Management)',
    'Transporte con Flota Propia',
    'Flete Externo / Carriers',
    'Paquetería y Última Milla',
    'Comercio Electrónico (Fulfillment)',
    'Previo en Origen',
    'Logística Global',
    'Aduanas',
    'Seguros de Carga',
    'Otro'
  )),
  notas_comerciales     TEXT DEFAULT '',
  responsable_comercial TEXT,
  estatus               TEXT NOT NULL DEFAULT 'nuevo' CHECK (estatus IN (
    'nuevo','contactado','en_seguimiento','reunion_agendada',
    'cotizacion_enviada','cerrado_ganado','cerrado_perdido'
  )),
  nivel_interes         TEXT NOT NULL DEFAULT 'frio' CHECK (nivel_interes IN (
    'frio','tibio','caliente','oportunidad','cliente_perdido'
  )),
  prioridad             TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
  proxima_accion_tipo   TEXT CHECK (proxima_accion_tipo IN ('llamada','correo','whatsapp','reunion')),
  proxima_accion_fecha  TIMESTAMPTZ,
  client_id             UUID REFERENCES clients(id),
  motivo_perdido        TEXT,
  created_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_canal        ON leads(canal);
CREATE INDEX IF NOT EXISTS idx_leads_estatus      ON leads(estatus);
CREATE INDEX IF NOT EXISTS idx_leads_responsable  ON leads(responsable_comercial);
CREATE INDEX IF NOT EXISTS idx_leads_fecha        ON leads(fecha_entrada);
CREATE INDEX IF NOT EXISTS idx_leads_prioridad    ON leads(prioridad);
CREATE INDEX IF NOT EXISTS idx_leads_nivel_interes ON leads(nivel_interes);

-- Autonumérico LEAD00001, mismo patrón que generate_task_ref() en
-- 20260504000011_task_tracker.sql.
CREATE OR REPLACE FUNCTION generate_lead_ref() RETURNS TRIGGER AS $$
DECLARE
  next_num INT;
BEGIN
  IF NEW.ref IS NULL OR NEW.ref = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(ref,'\D','','g'),'')::INT), 0) + 1
      INTO next_num FROM leads;
    NEW.ref := 'LEAD' || lpad(next_num::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_ref ON leads;
CREATE TRIGGER trg_leads_ref BEFORE INSERT ON leads
FOR EACH ROW EXECUTE FUNCTION generate_lead_ref();

-- updated_at automático, mismo patrón que ventas_metricas.
CREATE OR REPLACE FUNCTION set_leads_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION set_leads_updated_at();

-- Timeline de seguimiento — calco exacto de task_notes.
CREATE TABLE IF NOT EXISTS lead_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_email  TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at);

-- ============================================================================
-- RLS — policies granulares, no la abierta FOR ALL USING(true). Usa el
-- helper current_user_is_comercial() (ya incluye admin) de
-- 20260703100000_role_comercial.sql.
-- ============================================================================
ALTER TABLE leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_select ON leads;
DROP POLICY IF EXISTS leads_insert ON leads;
DROP POLICY IF EXISTS leads_update ON leads;
DROP POLICY IF EXISTS leads_delete ON leads;

CREATE POLICY leads_select ON leads FOR SELECT TO authenticated
  USING (current_user_is_comercial());
CREATE POLICY leads_insert ON leads FOR INSERT TO authenticated
  WITH CHECK (current_user_is_comercial());
CREATE POLICY leads_update ON leads FOR UPDATE TO authenticated
  USING (current_user_is_comercial()) WITH CHECK (current_user_is_comercial());
CREATE POLICY leads_delete ON leads FOR DELETE TO authenticated
  USING (current_user_is_admin());

DROP POLICY IF EXISTS lead_notes_select ON lead_notes;
DROP POLICY IF EXISTS lead_notes_insert ON lead_notes;

CREATE POLICY lead_notes_select ON lead_notes FOR SELECT TO authenticated
  USING (current_user_is_comercial());
CREATE POLICY lead_notes_insert ON lead_notes FOR INSERT TO authenticated
  WITH CHECK (current_user_is_comercial() AND user_email = current_user_email());

-- Realtime — el pipeline se actualiza en vivo entre varios comerciales.
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
