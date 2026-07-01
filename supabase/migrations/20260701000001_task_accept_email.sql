-- ============================================================================
-- Correo al ACEPTAR una tarea
--
-- Por qué: notify_task_event mandaba correo al crear, rechazar y finalizar,
-- pero al ACEPTAR solo insertaba notificación in-app (sin correo). El usuario
-- quiere aviso por correo también cuando el asignado acepta la tarea.
-- Esta migración agrega el PERFORM db_send_task_email en la rama 'aceptada',
-- dirigido a quien creó la tarea (assigner_email). Todo lo demás queda igual.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_task_event() RETURNS TRIGGER AS $$
DECLARE
  v_assigner_name TEXT;
  v_assignee_name TEXT;
BEGIN
  SELECT user_name INTO v_assigner_name FROM team_members WHERE user_email = NEW.assigner_email;
  SELECT user_name INTO v_assignee_name FROM team_members WHERE user_email = NEW.assignee_email;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO notifications (user_email, type, title, body, link, payload)
    VALUES (NEW.assignee_email, 'task_proposed',
      'Nueva tarea: ' || NEW.title,
      'De ' || coalesce(v_assigner_name, NEW.assigner_email),
      '/tasks/' || NEW.id,
      jsonb_build_object('task_id', NEW.id, 'ref', NEW.ref));

    PERFORM db_send_task_email(
      NEW.assignee_email,
      '[Supply Chain] Nueva tarea: ' || NEW.title,
      '<p>Hola ' || coalesce(v_assignee_name, '') || ',</p>' ||
      '<p><strong>' || coalesce(v_assigner_name, NEW.assigner_email) ||
        '</strong> te asignó una nueva tarea: <strong>' || NEW.title || '</strong>.</p>' ||
      '<p>Programada: ' || to_char(NEW.scheduled_start AT TIME ZONE 'America/Mexico_City', 'DD Mon YYYY HH24:MI') ||
      ' → ' || to_char(NEW.scheduled_end AT TIME ZONE 'America/Mexico_City', 'HH24:MI') || ' (CDMX)</p>' ||
      CASE WHEN coalesce(NEW.description,'') <> '' THEN '<p>' || NEW.description || '</p>' ELSE '' END ||
      '<p>Revísala en el CRM para aceptarla o rechazarla.</p>',
      NEW.id
    );

  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'aceptada' THEN
      INSERT INTO notifications (user_email, type, title, body, link, payload)
      VALUES (NEW.assigner_email, 'task_accepted',
        coalesce(v_assignee_name, NEW.assignee_email) || ' aceptó: ' || NEW.title, NULL,
        '/tasks/' || NEW.id, jsonb_build_object('task_id', NEW.id, 'ref', NEW.ref));

      PERFORM db_send_task_email(
        NEW.assigner_email,
        '[Supply Chain] Tarea aceptada: ' || NEW.title,
        '<p>' || coalesce(v_assignee_name, NEW.assignee_email) ||
        ' aceptó la tarea <strong>' || NEW.title || '</strong>.</p>' ||
        '<p>Revisa el detalle en el CRM.</p>',
        NEW.id
      );

    ELSIF NEW.status = 'rechazada' THEN
      INSERT INTO notifications (user_email, type, title, body, link, payload)
      VALUES (NEW.assigner_email, 'task_rejected',
        coalesce(v_assignee_name, NEW.assignee_email) || ' rechazó: ' || NEW.title, NEW.rejection_reason,
        '/tasks/' || NEW.id, jsonb_build_object('task_id', NEW.id, 'ref', NEW.ref));

      PERFORM db_send_task_email(
        NEW.assigner_email,
        '[Supply Chain] Tarea rechazada: ' || NEW.title,
        '<p>' || coalesce(v_assignee_name, NEW.assignee_email) ||
        ' rechazó la tarea <strong>' || NEW.title || '</strong>.</p>' ||
        CASE WHEN coalesce(NEW.rejection_reason,'') <> ''
             THEN '<p>Motivo: ' || NEW.rejection_reason || '</p>' ELSE '' END,
        NEW.id
      );

    ELSIF NEW.status = 'finalizada' THEN
      INSERT INTO notifications (user_email, type, title, body, link, payload)
      VALUES (NEW.assigner_email, 'task_finalized',
        coalesce(v_assignee_name, NEW.assignee_email) || ' finalizó: ' || NEW.title, NULL,
        '/tasks/' || NEW.id, jsonb_build_object('task_id', NEW.id, 'ref', NEW.ref));

      PERFORM db_send_task_email(
        NEW.assigner_email,
        '[Supply Chain] Tarea finalizada: ' || NEW.title,
        '<p>' || coalesce(v_assignee_name, NEW.assignee_email) ||
        ' finalizó la tarea <strong>' || NEW.title || '</strong>.</p>' ||
        '<p>Revisa el detalle en el CRM.</p>',
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
