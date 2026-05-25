-- ============================================================================
-- Migration: Pizarrón de Operaciones
-- Proyecto: CRM Supply Chain México · Sprint Almacén + Pizarrón (Fase 4)
-- ============================================================================
--
-- Dashboard tipo comandas para que pickers/montacarguistas tomen tareas desde
-- una pantalla compartida (kiosk). Sin cuenta: el picker escribe su nombre.
-- Auditable por timestamp + nombre.
--
-- Solo aditiva.
-- ============================================================================

-- 1. Tabla warehouse_tasks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID REFERENCES tasks(id) ON DELETE CASCADE,
  area          TEXT NOT NULL CHECK (area IN (
                  'recepcion','picking','montacargas','pre_stage',
                  'consolidacion','embarque','devoluciones','otro')),
  priority      INT DEFAULT 100,
  taken_by_name TEXT,
  taken_by_email TEXT,
  taken_at      TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wt_status ON warehouse_tasks(area, taken_at, completed_at);
CREATE INDEX IF NOT EXISTS idx_wt_task   ON warehouse_tasks(task_id);

ALTER TABLE warehouse_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY anon_all_wt ON warehouse_tasks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Realtime: el kiosk refleja claims/completes en vivo.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_tasks;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. RPC pizarron_claim_task ─────────────────────────────────────────────────
-- Toma una tarea. Falla si ya fue tomada (evita doble-claim en pantalla compartida).
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

  UPDATE warehouse_tasks
     SET taken_by_name  = btrim(p_picker_name),
         taken_by_email = p_picker_email,
         taken_at       = now()
   WHERE id = p_warehouse_task_id;

  RETURN p_warehouse_task_id;
END;
$func$;

-- 3. RPC pizarron_complete_task ──────────────────────────────────────────────
-- Marca la tarea de almacén como completada y finaliza la tarea origen.
CREATE OR REPLACE FUNCTION pizarron_complete_task(
  p_warehouse_task_id UUID,
  p_notes             TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  UPDATE warehouse_tasks
     SET completed_at = now(),
         notes        = COALESCE(p_notes, notes)
   WHERE id = p_warehouse_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: La tarea ya no existe.';
  END IF;

  UPDATE tasks SET status = 'finalizada'
   WHERE id = (SELECT task_id FROM warehouse_tasks WHERE id = p_warehouse_task_id)
     AND status NOT IN ('finalizada','cancelada');
END;
$func$;

REVOKE ALL    ON FUNCTION pizarron_claim_task(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pizarron_claim_task(UUID, TEXT, TEXT) TO authenticated, anon;
REVOKE ALL    ON FUNCTION pizarron_complete_task(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pizarron_complete_task(UUID, TEXT) TO authenticated, anon;

COMMENT ON TABLE warehouse_tasks IS
  'Tareas operativas del Pizarrón de Operaciones. Auditables por taken_by_name + taken_at.';
