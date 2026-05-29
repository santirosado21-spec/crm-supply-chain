-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Multi-taker + planificación operativa para Pizarrón / Calendario de Almacén  ║
-- ║                                                                              ║
-- ║ - Tabla puente `warehouse_task_takers` (cada persona = 1 fila independiente) ║
-- ║ - Trigger de retro-compat: `taken_by_name`/`taken_at` siguen vivos           ║
-- ║ - RPCs nuevos: `pizarron_start_taker`, `pizarron_end_taker`                  ║
-- ║ - `pizarron_claim_task` / `pizarron_complete_task` mantienen su firma        ║
-- ║ - Columnas operativas: `warehouse_tasks.scheduled_start / scheduled_end`     ║
-- ║ - `priority` ahora DOUBLE PRECISION (drag-and-drop lexicográfico)            ║
-- ║                                                                              ║
-- ║ Migración 100% aditiva. RLS abierta. Realtime habilitado.                    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Tabla puente warehouse_task_takers ───────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_task_takers (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_task_id UUID NOT NULL REFERENCES warehouse_tasks(id) ON DELETE CASCADE,
  taker_name        TEXT NOT NULL CHECK (btrim(taker_name) <> ''),
  taker_email       TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  duration_min      INT GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NULL THEN NULL
      ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0))::INT
    END
  ) STORED,
  device_id         TEXT,
  notes             TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT warehouse_task_takers_time_range
    CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_wt_takers_active
  ON warehouse_task_takers (warehouse_task_id, ended_at)
  WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wt_takers_name_started
  ON warehouse_task_takers (taker_name, started_at);
CREATE INDEX IF NOT EXISTS idx_wt_takers_warehouse_task
  ON warehouse_task_takers (warehouse_task_id);

-- RLS abierta (consistente con el resto del schema)
ALTER TABLE warehouse_task_takers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_warehouse_task_takers ON warehouse_task_takers;
CREATE POLICY anon_all_warehouse_task_takers
  ON warehouse_task_takers
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_task_takers;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 2. Columnas operativas en warehouse_tasks ──────────────────────────────
ALTER TABLE warehouse_tasks
  ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_end   TIMESTAMPTZ;

-- priority: INT → DOUBLE PRECISION (postgrest devuelve number, no string).
-- Permite inserción lexicográfica para drag-and-drop: priority = (prev + next) / 2.
ALTER TABLE warehouse_tasks
  ALTER COLUMN priority TYPE DOUBLE PRECISION USING priority::DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_scheduled
  ON warehouse_tasks (scheduled_start)
  WHERE scheduled_start IS NOT NULL;

-- CHECK opcional: si ambos están presentes, end > start
ALTER TABLE warehouse_tasks
  DROP CONSTRAINT IF EXISTS warehouse_tasks_schedule_range;
ALTER TABLE warehouse_tasks
  ADD CONSTRAINT warehouse_tasks_schedule_range
  CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end > scheduled_start);

-- ── 3. Trigger de retro-compatibilidad ──────────────────────────────────────
-- Mantiene `warehouse_tasks.taken_by_name` y `taken_at` sincronizados con el
-- primer taker activo (ended_at IS NULL, started_at más antiguo). Esto preserva
-- 100% el comportamiento de PizarronBoard / PizarronKioskPage / RPCs viejos.
CREATE OR REPLACE FUNCTION sync_warehouse_task_takers_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_task_id    UUID;
  v_name       TEXT;
  v_email      TEXT;
  v_started_at TIMESTAMPTZ;
BEGIN
  v_task_id := COALESCE(NEW.warehouse_task_id, OLD.warehouse_task_id);

  -- Estrategia: activos primero (por started_at ASC); si no hay activos, el
  -- primero histórico. Así preservamos "quién la hizo" en tareas completadas
  -- (PizarronAdminPage lee taken_by_name para mostrar tareas cerradas).
  SELECT taker_name, taker_email, started_at
    INTO v_name, v_email, v_started_at
    FROM warehouse_task_takers
   WHERE warehouse_task_id = v_task_id
   ORDER BY (ended_at IS NULL) DESC, started_at ASC
   LIMIT 1;

  UPDATE warehouse_tasks
     SET taken_by_name  = v_name,
         taken_by_email = v_email,
         taken_at       = v_started_at
   WHERE id = v_task_id;

  RETURN NULL;
END;
$func$;

DROP TRIGGER IF EXISTS trg_sync_warehouse_task_takers_legacy
  ON warehouse_task_takers;
CREATE TRIGGER trg_sync_warehouse_task_takers_legacy
  AFTER INSERT OR UPDATE OF ended_at, started_at OR DELETE
  ON warehouse_task_takers
  FOR EACH ROW
  EXECUTE FUNCTION sync_warehouse_task_takers_legacy();

-- ── 4. RPC: pizarron_start_taker ───────────────────────────────────────────
-- Permite que múltiples personas inicien la MISMA tarea con timestamps
-- independientes. Sin FOR UPDATE bloqueante: takers paralelos son válidos.
CREATE OR REPLACE FUNCTION pizarron_start_taker(
  p_warehouse_task_id UUID,
  p_name              TEXT,
  p_email             TEXT DEFAULT NULL,
  p_device_id         TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_completed_at TIMESTAMPTZ;
  v_taker_id UUID;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED: Escribe tu nombre para iniciar la tarea.';
  END IF;

  SELECT completed_at INTO v_completed_at
    FROM warehouse_tasks
   WHERE id = p_warehouse_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: La tarea ya no existe.';
  END IF;

  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'TASK_COMPLETED: La tarea ya fue completada.';
  END IF;

  INSERT INTO warehouse_task_takers (warehouse_task_id, taker_name, taker_email, device_id)
       VALUES (p_warehouse_task_id, btrim(p_name), p_email, p_device_id)
    RETURNING id INTO v_taker_id;

  RETURN v_taker_id;
END;
$func$;

-- ── 5. RPC: pizarron_end_taker ─────────────────────────────────────────────
-- Idempotente: si ya está cerrado, no-op (no levanta error).
CREATE OR REPLACE FUNCTION pizarron_end_taker(
  p_taker_id UUID,
  p_notes    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_ended_at TIMESTAMPTZ;
BEGIN
  SELECT ended_at INTO v_ended_at
    FROM warehouse_task_takers
   WHERE id = p_taker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAKER_NOT_FOUND: El registro de turno no existe.';
  END IF;

  IF v_ended_at IS NOT NULL THEN
    -- Idempotente: ya cerrado. Permite reintentos sin error.
    RETURN;
  END IF;

  UPDATE warehouse_task_takers
     SET ended_at = now(),
         notes    = COALESCE(NULLIF(btrim(p_notes), ''), notes)
   WHERE id = p_taker_id;
END;
$func$;

-- ── 6. RPC: pizarron_claim_task (REEMPLAZA al original) ────────────────────
-- Mantiene EXACTAMENTE la misma firma y semántica de "single-taker exclusivo"
-- para clientes viejos (kiosk actual). Internamente inserta en la tabla puente
-- y deja que el trigger sincronice `taken_by_name`/`taken_at`.
CREATE OR REPLACE FUNCTION pizarron_claim_task(
  p_warehouse_task_id UUID,
  p_picker_name       TEXT,
  p_picker_email      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_existing TEXT;
BEGIN
  IF p_picker_name IS NULL OR btrim(p_picker_name) = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED: Escribe tu nombre para tomar la tarea.';
  END IF;

  SELECT taken_by_name INTO v_existing
    FROM warehouse_tasks
   WHERE id = p_warehouse_task_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: La tarea ya no existe.';
  END IF;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_TAKEN: Tarea ya tomada por %.', v_existing;
  END IF;

  -- Insert en la tabla puente. El trigger sincroniza taken_by_name/taken_at.
  INSERT INTO warehouse_task_takers (warehouse_task_id, taker_name, taker_email)
       VALUES (p_warehouse_task_id, btrim(p_picker_name), p_picker_email);

  RETURN p_warehouse_task_id;
END;
$func$;

-- ── 7. RPC: pizarron_complete_task (REEMPLAZA al original) ─────────────────
-- Cierra TODOS los takers abiertos y calcula actual_duration_min como
-- SUM(duration_min) — horas-hombre reales, no wall-clock.
CREATE OR REPLACE FUNCTION pizarron_complete_task(
  p_warehouse_task_id UUID,
  p_notes             TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_total_min INT;
BEGIN
  -- 1. Cerrar takers abiertos (el trigger nulificará taken_by_name al cerrar el último activo)
  UPDATE warehouse_task_takers
     SET ended_at = now()
   WHERE warehouse_task_id = p_warehouse_task_id
     AND ended_at IS NULL;

  -- 2. Sumar horas-hombre de TODOS los takers (incluye los que ya estaban cerrados)
  SELECT COALESCE(SUM(duration_min), 0)::INT INTO v_total_min
    FROM warehouse_task_takers
   WHERE warehouse_task_id = p_warehouse_task_id;

  -- 3. Marcar warehouse_task como completada con duración total
  UPDATE warehouse_tasks
     SET completed_at        = now(),
         actual_duration_min = CASE WHEN v_total_min > 0 THEN v_total_min ELSE actual_duration_min END,
         notes               = COALESCE(p_notes, notes)
   WHERE id = p_warehouse_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: La tarea ya no existe.';
  END IF;

  -- 4. Finalizar tarea origen (lógica existente)
  UPDATE tasks SET status = 'finalizada'
   WHERE id = (SELECT task_id FROM warehouse_tasks WHERE id = p_warehouse_task_id)
     AND status NOT IN ('finalizada','cancelada');
END;
$func$;

-- ── 8. GRANTs ──────────────────────────────────────────────────────────────
REVOKE ALL    ON FUNCTION pizarron_start_taker(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pizarron_start_taker(UUID, TEXT, TEXT, TEXT) TO authenticated, anon;
REVOKE ALL    ON FUNCTION pizarron_end_taker(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pizarron_end_taker(UUID, TEXT) TO authenticated, anon;
-- Los GRANTs de pizarron_claim_task y pizarron_complete_task ya existen
-- (firma no cambió) — se preservan automáticamente con CREATE OR REPLACE.

-- ── 9. Comentarios para documentación ──────────────────────────────────────
COMMENT ON TABLE warehouse_task_takers IS
  'Tabla puente: cada persona que trabaja una warehouse_task = 1 fila. Soporta multi-taker (varias personas misma tarea) y multi-device.';
COMMENT ON COLUMN warehouse_task_takers.duration_min IS
  'Minutos trabajados por este taker (generated column). NULL mientras ended_at IS NULL.';
COMMENT ON COLUMN warehouse_tasks.scheduled_start IS
  'Planificación operativa del CEDIS (cuándo el director decidió ejecutarla). Independiente de tasks.scheduled_start (intención SAC).';
COMMENT ON COLUMN warehouse_tasks.scheduled_end IS
  'Fin operativo planeado. Junto con scheduled_start define el bloque visual en /almacen/dia.';
COMMENT ON COLUMN warehouse_tasks.priority IS
  'DOUBLE PRECISION para soportar drag-and-drop lexicográfico: priority = (prev + next) / 2.';
