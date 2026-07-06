-- ============================================================================
-- Notificaciones de leads — calco de notify_task_event()
-- (20260701000001_task_accept_email.sql). Reusa notifications + la función
-- genérica db_send_task_email() (20260504000013_task_tracker_v3.sql) — no
-- requiere cambios en ninguna de las dos.
--
-- Asignación de responsable_comercial → in-app + correo.
-- Cambio de estatus → solo in-app (evita fatiga de alertas por correo).
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_lead_event() RETURNS TRIGGER AS $$
DECLARE
  v_resp_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.responsable_comercial IS DISTINCT FROM NEW.responsable_comercial
     AND NEW.responsable_comercial IS NOT NULL THEN

    SELECT user_name INTO v_resp_name FROM team_members WHERE user_email = NEW.responsable_comercial;

    INSERT INTO notifications (user_email, type, title, body, link, payload)
    VALUES (
      NEW.responsable_comercial, 'lead_assigned',
      'Lead asignado: ' || NEW.nombre,
      coalesce(NEW.empresa, '') || ' · ' || NEW.servicio_interes,
      '/comercial/leads/' || NEW.id,
      jsonb_build_object('lead_id', NEW.id, 'ref', NEW.ref)
    );

    PERFORM db_send_task_email(
      NEW.responsable_comercial,
      '[Supply Chain] Lead asignado: ' || NEW.nombre,
      '<p>Hola ' || coalesce(v_resp_name, '') || ',</p>' ||
      '<p>Se te asignó el lead <strong>' || NEW.nombre || '</strong>' ||
        CASE WHEN coalesce(NEW.empresa,'') <> '' THEN ' (' || NEW.empresa || ')' ELSE '' END || '.</p>' ||
      '<p>Servicio de interés: ' || NEW.servicio_interes || '</p>' ||
      '<p>Revísalo en el CRM para darle seguimiento.</p>'
    );

  ELSIF TG_OP = 'UPDATE' AND OLD.estatus IS DISTINCT FROM NEW.estatus
        AND NEW.responsable_comercial IS NOT NULL THEN

    INSERT INTO notifications (user_email, type, title, body, link, payload)
    VALUES (
      NEW.responsable_comercial, 'lead_stage_changed',
      NEW.nombre || ' → ' || NEW.estatus,
      NULL,
      '/comercial/leads/' || NEW.id,
      jsonb_build_object('lead_id', NEW.id, 'ref', NEW.ref)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_lead ON leads;
CREATE TRIGGER trg_notify_lead AFTER UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION notify_lead_event();
