-- Cerrar una actividad/tarea del Calendario General: evidencia opcional
-- (ya no exige link de Google Drive) y solo la persona asignada (+ admin)
-- puede cerrarla. NO aplica a warehouse_entry_close / warehouse_exit_close /
-- pizarron_complete_task, que siguen exigiendo evidencia sin cambios.

CREATE OR REPLACE FUNCTION public.task_close_with_evidence(p_task_id uuid, p_evidence_url text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller TEXT := current_user_email();
  v_task   tasks;
  v_admin  BOOLEAN := current_user_is_admin();
BEGIN
  IF v_caller = '' THEN RAISE EXCEPTION 'no auth'; END IF;

  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task IS NULL THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF v_task.status IN ('finalizada','cancelada') AND NOT v_admin THEN
    RAISE EXCEPTION 'La tarea ya está cerrada';
  END IF;
  IF lower(v_task.assignee_email) <> v_caller AND NOT v_admin THEN
    RAISE EXCEPTION 'Solo el asignado puede cerrar esta tarea';
  END IF;

  UPDATE task_time_entries SET ended_at = now()
   WHERE task_id = p_task_id AND ended_at IS NULL;

  UPDATE tasks
     SET status = 'finalizada',
         completion_evidence_url = btrim(p_evidence_url)
   WHERE id = p_task_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.task_finalize_timer(p_task_id uuid, p_user_email text, p_evidence_url text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_assignee  TEXT;
  v_caller    TEXT := current_user_email();
BEGIN
  IF v_caller = '' THEN RAISE EXCEPTION 'no auth'; END IF;
  IF lower(p_user_email) <> v_caller AND NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'No puedes operar el timer de otro usuario';
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
$function$;
