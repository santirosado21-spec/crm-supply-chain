-- ============================================================================
-- Migration: Flujo de distribución de tareas
-- Proyecto: CRM Supply Chain México · Sprint Almacén + Pizarrón (Fase 3)
-- ============================================================================
--
-- SAC manda tareas a una cuenta "Almacén Receptor" (rol almacen). Los
-- distribuidores (can_distribute_tasks = true) las reasignan a los demás
-- miembros del área de almacén.
--
-- Solo aditiva — no DROP ni RENAME de columnas con datos.
-- ============================================================================

-- 1. Flag de distribuidor en team_members ───────────────────────────────────
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS can_distribute_tasks BOOLEAN NOT NULL DEFAULT false;

-- 2. RPC task_reassign ───────────────────────────────────────────────────────
-- SECURITY DEFINER: bypassa la RLS de tasks pero verifica internamente que el
-- caller sea distribuidor (can_distribute_tasks) o admin.
CREATE OR REPLACE FUNCTION task_reassign(p_task_id UUID, p_new_assignee TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_actor                TEXT := current_user_email();
  v_actor_can_distribute BOOLEAN;
BEGIN
  IF v_actor IS NULL OR v_actor = '' THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión.';
  END IF;

  SELECT can_distribute_tasks INTO v_actor_can_distribute
    FROM team_members
   WHERE lower(user_email) = v_actor;

  IF NOT (COALESCE(v_actor_can_distribute, false) OR current_user_is_admin()) THEN
    RAISE EXCEPTION 'NOT_DISTRIBUTOR: Solo distribuidores pueden reasignar tareas.';
  END IF;

  UPDATE tasks
     SET assignee_email = lower(p_new_assignee)
   WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND: La tarea % no existe.', p_task_id;
  END IF;

  INSERT INTO task_audit_log (task_id, action, actor_email, before, after)
  VALUES (
    p_task_id,
    'reassigned',
    v_actor,
    jsonb_build_object('task', p_task_id::text),
    jsonb_build_object('to', lower(p_new_assignee))
  );
END;
$func$;

REVOKE ALL    ON FUNCTION task_reassign(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION task_reassign(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION task_reassign IS
  'Reasigna una tarea a otro miembro del equipo. Solo distribuidores (can_distribute_tasks) o admins. Registra en task_audit_log.';
