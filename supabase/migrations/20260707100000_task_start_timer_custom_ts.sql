-- ============================================================================
-- task_start_timer: permite especificar un timestamp de inicio distinto a
-- "ahora" (ej. el trabajador olvidó dar inicio y quiere registrar la hora
-- real en que empezó). Si p_started_at es NULL, se comporta igual que antes.
-- ============================================================================

DROP FUNCTION IF EXISTS task_start_timer(UUID, TEXT);

CREATE OR REPLACE FUNCTION task_start_timer(
  p_task_id     UUID,
  p_user_email  TEXT,
  p_started_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_started   TIMESTAMPTZ;
  v_assignee  TEXT;
  v_caller    TEXT := current_user_email();
  v_start_ts  TIMESTAMPTZ := COALESCE(p_started_at, now());
BEGIN
  IF v_caller = '' THEN RAISE EXCEPTION 'no auth'; END IF;
  IF lower(p_user_email) <> v_caller AND NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'No puedes operar el timer de otro usuario';
  END IF;

  SELECT assignee_email INTO v_assignee FROM tasks WHERE id = p_task_id;
  IF v_assignee IS NULL THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF lower(v_assignee) <> v_caller AND NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Solo el asignado puede iniciar la tarea';
  END IF;

  IF v_start_ts > now() THEN
    RAISE EXCEPTION 'No puedes iniciar una tarea en el futuro';
  END IF;

  UPDATE task_time_entries SET ended_at = now()
   WHERE task_id = p_task_id AND ended_at IS NULL;

  INSERT INTO task_time_entries (task_id, user_email, segment_type, started_at)
  VALUES (p_task_id, lower(p_user_email), 'work', v_start_ts)
  RETURNING started_at INTO v_started;

  UPDATE tasks SET status = 'en_curso' WHERE id = p_task_id;
  RETURN v_started;
END;
$$;
