-- ============================================================================
-- pizarron_start_taker: quien TOMA la tarea determina cuánto va a tardar, y
-- ese tiempo es el que bloquea su bloque en la agenda operativa
-- (warehouse_tasks.scheduled_start / scheduled_end). Antes esos campos solo
-- los fijaba el director vía setSchedule(); ahora el propio taker los define
-- al aceptar (si envía p_duration_min).
-- ============================================================================

DROP FUNCTION IF EXISTS pizarron_start_taker(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION pizarron_start_taker(
  p_warehouse_task_id UUID,
  p_name              TEXT,
  p_email             TEXT DEFAULT NULL,
  p_device_id         TEXT DEFAULT NULL,
  p_duration_min      INT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_completed_at TIMESTAMPTZ;
  v_taker_id     UUID;
  v_started_at   TIMESTAMPTZ := now();
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

  INSERT INTO warehouse_task_takers (warehouse_task_id, taker_name, taker_email, device_id, started_at)
       VALUES (p_warehouse_task_id, btrim(p_name), p_email, p_device_id, v_started_at)
    RETURNING id INTO v_taker_id;

  IF p_duration_min IS NOT NULL AND p_duration_min > 0 THEN
    UPDATE warehouse_tasks
       SET estimated_duration_min = p_duration_min,
           scheduled_start        = v_started_at,
           scheduled_end          = v_started_at + (p_duration_min || ' minutes')::INTERVAL
     WHERE id = p_warehouse_task_id;
  END IF;

  RETURN v_taker_id;
END;
$func$;

REVOKE ALL     ON FUNCTION pizarron_start_taker(UUID, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION pizarron_start_taker(UUID, TEXT, TEXT, TEXT, INT) TO authenticated, anon;
