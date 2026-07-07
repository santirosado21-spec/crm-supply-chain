-- ============================================================================
-- Cerrar una tarea (general o de almacén) ahora requiere un link de Google
-- Drive como evidencia de cierre. Se valida server-side en cada RPC de cierre
-- para que ningún flujo del front pueda saltarse el requisito.
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completion_evidence_url TEXT;

ALTER TABLE warehouse_tasks
  ADD COLUMN IF NOT EXISTS completion_evidence_url TEXT;

-- Helper: ¿la URL apunta a Google Drive/Docs?
CREATE OR REPLACE FUNCTION is_google_drive_url(p_url TEXT) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(btrim(p_url), '') <> ''
     AND p_url ~* '(drive|docs)\.google\.com';
$$;

-- ── RPC: task_close_with_evidence ───────────────────────────────────────────
-- Camino de cierre "directo" (sin timer activo) usado por TaskTraceabilityPanel,
-- WarehouseOperativoPanel y AgendaPage. Mismo permiso que la policy ts_update
-- (assigner, assignee o admin).
CREATE OR REPLACE FUNCTION task_close_with_evidence(
  p_task_id       UUID,
  p_evidence_url  TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller TEXT := current_user_email();
  v_task   tasks;
  v_admin  BOOLEAN := current_user_is_admin();
BEGIN
  IF v_caller = '' THEN RAISE EXCEPTION 'no auth'; END IF;
  IF NOT is_google_drive_url(p_evidence_url) THEN
    RAISE EXCEPTION 'Captura un link de Google Drive válido para cerrar la tarea';
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task IS NULL THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF v_task.status IN ('finalizada','cancelada') AND NOT v_admin THEN
    RAISE EXCEPTION 'La tarea ya está cerrada';
  END IF;
  IF lower(v_task.assigner_email) <> v_caller
     AND lower(v_task.assignee_email) <> v_caller
     AND NOT v_admin THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar esta tarea';
  END IF;

  UPDATE task_time_entries SET ended_at = now()
   WHERE task_id = p_task_id AND ended_at IS NULL;

  UPDATE tasks
     SET status = 'finalizada',
         completion_evidence_url = btrim(p_evidence_url)
   WHERE id = p_task_id;
END;
$$;

REVOKE ALL     ON FUNCTION task_close_with_evidence(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION task_close_with_evidence(UUID, TEXT) TO authenticated;

-- ── task_finalize_timer: ahora exige evidencia también ─────────────────────
DROP FUNCTION IF EXISTS task_finalize_timer(UUID, TEXT);

CREATE OR REPLACE FUNCTION task_finalize_timer(
  p_task_id       UUID,
  p_user_email    TEXT,
  p_evidence_url  TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_assignee  TEXT;
  v_caller    TEXT := current_user_email();
BEGIN
  IF v_caller = '' THEN RAISE EXCEPTION 'no auth'; END IF;
  IF lower(p_user_email) <> v_caller AND NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'No puedes operar el timer de otro usuario';
  END IF;
  IF NOT is_google_drive_url(p_evidence_url) THEN
    RAISE EXCEPTION 'Captura un link de Google Drive válido para cerrar la tarea';
  END IF;
  SELECT assignee_email INTO v_assignee FROM tasks WHERE id = p_task_id;
  IF lower(v_assignee) <> v_caller AND NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Solo el asignado puede finalizar';
  END IF;

  UPDATE task_time_entries SET ended_at = now()
   WHERE task_id = p_task_id AND ended_at IS NULL;
  UPDATE tasks
     SET status = 'finalizada',
         completion_evidence_url = btrim(p_evidence_url)
   WHERE id = p_task_id;
END;
$$;

-- ── pizarron_complete_task: ahora exige evidencia también ──────────────────
DROP FUNCTION IF EXISTS pizarron_complete_task(UUID, TEXT);

CREATE OR REPLACE FUNCTION pizarron_complete_task(
  p_warehouse_task_id UUID,
  p_notes             TEXT DEFAULT NULL,
  p_evidence_url      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_total_min INT;
  v_task_id   UUID;
BEGIN
  IF NOT is_google_drive_url(p_evidence_url) THEN
    RAISE EXCEPTION 'EVIDENCE_REQUIRED: Captura un link de Google Drive válido para cerrar la tarea.';
  END IF;

  -- 1. Cerrar takers abiertos (el trigger nulificará taken_by_name al cerrar el último activo)
  UPDATE warehouse_task_takers
     SET ended_at = now()
   WHERE warehouse_task_id = p_warehouse_task_id
     AND ended_at IS NULL;

  -- 2. Sumar horas-hombre de TODOS los takers (incluye los que ya estaban cerrados)
  SELECT COALESCE(SUM(duration_min), 0)::INT INTO v_total_min
    FROM warehouse_task_takers
   WHERE warehouse_task_id = p_warehouse_task_id;

  -- 3. Marcar warehouse_task como completada con duración total y evidencia
  UPDATE warehouse_tasks
     SET completed_at            = now(),
         actual_duration_min     = CASE WHEN v_total_min > 0 THEN v_total_min ELSE actual_duration_min END,
         notes                   = COALESCE(p_notes, notes),
         completion_evidence_url = btrim(p_evidence_url)
   WHERE id = p_warehouse_task_id
   RETURNING task_id INTO v_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: La tarea ya no existe.';
  END IF;

  -- 4. Finalizar tarea origen y reflejar la evidencia ahí también
  UPDATE tasks
     SET status = 'finalizada',
         completion_evidence_url = btrim(p_evidence_url)
   WHERE id = v_task_id
     AND status NOT IN ('finalizada','cancelada');
END;
$func$;

REVOKE ALL     ON FUNCTION pizarron_complete_task(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pizarron_complete_task(UUID, TEXT, TEXT) TO authenticated, anon;
