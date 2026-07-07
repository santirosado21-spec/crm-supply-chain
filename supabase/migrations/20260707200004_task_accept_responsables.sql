-- ============================================================================
-- Al aceptar una tarea, además de la duración, quien acepta debe indicar
-- quiénes son los responsables físicos de ejecutar el movimiento (personas
-- de almacén). `responsables` es un TEXT[] de emails de team_members.
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS responsables TEXT[] NOT NULL DEFAULT '{}';

DROP FUNCTION IF EXISTS task_change_status(UUID, task_status, TEXT, INT);

CREATE OR REPLACE FUNCTION task_change_status(
  p_task_id           UUID,
  p_new_status        task_status,
  p_rejection_reason  TEXT DEFAULT NULL,
  p_duration_min      INT DEFAULT NULL,
  p_responsables      TEXT[] DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller   TEXT := current_user_email();
  v_task     tasks;
  v_admin    BOOLEAN := current_user_is_admin();
  v_new_end  TIMESTAMPTZ;
BEGIN
  IF v_caller = '' THEN RAISE EXCEPTION 'no auth'; END IF;
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task IS NULL THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;

  -- No se puede modificar status de tareas finalizadas o canceladas (excepto admin)
  IF v_task.status IN ('finalizada','cancelada') AND NOT v_admin THEN
    RAISE EXCEPTION 'La tarea ya está cerrada'; END IF;

  -- Reglas de transición:
  IF p_new_status = 'aceptada' THEN
    IF v_task.status <> 'propuesta' THEN RAISE EXCEPTION 'Solo se aceptan propuestas'; END IF;
    IF lower(v_task.assignee_email) <> v_caller AND NOT v_admin THEN
      RAISE EXCEPTION 'Solo el asignado puede aceptar'; END IF;
    IF p_duration_min IS NULL OR p_duration_min <= 0 THEN
      RAISE EXCEPTION 'Captura cuánto va a tardar la tarea (minutos) para aceptarla';
    END IF;
    IF p_responsables IS NULL OR array_length(p_responsables, 1) IS NULL THEN
      RAISE EXCEPTION 'Selecciona al menos un responsable del movimiento para aceptar';
    END IF;
    v_new_end := v_task.scheduled_start + (p_duration_min || ' minutes')::INTERVAL;
  ELSIF p_new_status = 'rechazada' THEN
    IF v_task.status <> 'propuesta' THEN RAISE EXCEPTION 'Solo se rechazan propuestas'; END IF;
    IF lower(v_task.assignee_email) <> v_caller AND NOT v_admin THEN
      RAISE EXCEPTION 'Solo el asignado puede rechazar'; END IF;
  ELSIF p_new_status = 'cancelada' THEN
    IF lower(v_task.assigner_email) <> v_caller
       AND lower(v_task.assignee_email) <> v_caller
       AND NOT v_admin THEN
      RAISE EXCEPTION 'No tienes permiso para cancelar esta tarea'; END IF;
    -- Cierra cualquier segmento de timer abierto al cancelar
    UPDATE task_time_entries SET ended_at = now()
     WHERE task_id = p_task_id AND ended_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Status no soportado por este RPC: %', p_new_status;
  END IF;

  UPDATE tasks
     SET status = p_new_status,
         rejection_reason = CASE WHEN p_new_status = 'rechazada'
                                 THEN coalesce(p_rejection_reason, '') ELSE rejection_reason END,
         scheduled_end = COALESCE(v_new_end, scheduled_end),
         responsables = CASE WHEN p_new_status = 'aceptada' THEN p_responsables ELSE responsables END
   WHERE id = p_task_id;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'Esa duración traslapa con otra tarea activa en tu agenda';
END;
$$;
