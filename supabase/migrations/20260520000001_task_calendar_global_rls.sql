-- ============================================================================
-- Calendario global de tareas
--
-- Antes: la policy ts_select solo dejaba ver una tarea a su assigner, su
-- assignee o un admin. El calendario era por lo tanto personal.
--
-- Ahora: cualquier miembro activo del equipo (admin, almacen,
-- servicio_cliente, cobranza, transporte) puede VER todas las tareas — el
-- calendario tipo Google Calendar es global. Las acciones de escritura
-- (INSERT/UPDATE/DELETE) siguen restringidas al assigner/assignee/admin, así
-- que un no-asignado ve la tarea read-only.
-- ============================================================================

DROP POLICY IF EXISTS ts_select ON tasks;

CREATE POLICY ts_select ON tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
       WHERE lower(user_email) = current_user_email()
         AND active = true
         AND role IN ('admin','almacen','servicio_cliente','cobranza','transporte')
    )
  );

-- INSERT / UPDATE / DELETE se quedan igual (ts_insert, ts_update, ts_delete
-- de 20260504000012_task_tracker_v2_auth.sql) — no se tocan.
