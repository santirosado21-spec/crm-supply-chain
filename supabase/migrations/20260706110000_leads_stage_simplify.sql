-- ============================================================================
-- Simplifica el pipeline de leads de 7 etapas a 4, en progresión lineal:
--   lead_entrante → lead_junta_pendiente → lead_post_junta → lead_proceso_cliente
--
-- "Perdido" deja de ser una etapa del pipeline — se usa nivel_interes =
-- 'cliente_perdido' (ya existente) para marcar leads muertos, sin rama de
-- salida en estatus. Si un lead venía de 'cerrado_perdido', se preserva esa
-- señal migrándolo a nivel_interes='cliente_perdido' antes del remapeo.
-- ============================================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_estatus_check;

UPDATE leads SET nivel_interes = 'cliente_perdido'
 WHERE estatus = 'cerrado_perdido' AND nivel_interes <> 'cliente_perdido';

UPDATE leads SET estatus = 'lead_entrante'
 WHERE estatus IN ('nuevo', 'contactado');
UPDATE leads SET estatus = 'lead_junta_pendiente'
 WHERE estatus IN ('en_seguimiento', 'reunion_agendada');
UPDATE leads SET estatus = 'lead_post_junta'
 WHERE estatus = 'cotizacion_enviada';
UPDATE leads SET estatus = 'lead_proceso_cliente'
 WHERE estatus IN ('cerrado_ganado', 'cerrado_perdido');

ALTER TABLE leads
  ALTER COLUMN estatus SET DEFAULT 'lead_entrante';

ALTER TABLE leads
  ADD CONSTRAINT leads_estatus_check
  CHECK (estatus IN ('lead_entrante', 'lead_junta_pendiente', 'lead_post_junta', 'lead_proceso_cliente'));

-- generate_lead_reminders() filtraba por los estatus terminales viejos, que
-- ya no existen — se reemplaza por nivel_interes <> 'cliente_perdido'.
CREATE OR REPLACE FUNCTION generate_lead_reminders() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sent INT := 0;
  r RECORD;
  v_reminder_email TEXT;
BEGIN
  FOR r IN
    SELECT l.id, l.ref, l.nombre, l.empresa, l.responsable_comercial
      FROM leads l
     WHERE l.recordatorio_fecha IS NOT NULL
       AND l.recordatorio_fecha <= now()
       AND l.recordatorio_enviado = false
       AND l.responsable_comercial IS NOT NULL
       AND l.nivel_interes <> 'cliente_perdido'
  LOOP
    SELECT reminder_email INTO v_reminder_email
      FROM team_members WHERE user_email = r.responsable_comercial;

    INSERT INTO notifications (user_email, type, title, body, link, payload)
    VALUES (
      r.responsable_comercial, 'lead_reminder',
      'Recordatorio: ' || r.nombre,
      coalesce(r.empresa, ''),
      '/comercial/leads/' || r.id,
      jsonb_build_object('lead_id', r.id, 'ref', r.ref)
    );

    IF v_reminder_email IS NOT NULL AND v_reminder_email <> '' THEN
      PERFORM db_send_task_email(
        v_reminder_email,
        '[Supply Chain] Recordatorio de lead: ' || r.nombre,
        '<p>Recordatorio para dar seguimiento al lead <strong>' || r.nombre || '</strong>' ||
          CASE WHEN coalesce(r.empresa,'') <> '' THEN ' (' || r.empresa || ')' ELSE '' END || '.</p>' ||
        '<p>Revísalo en el CRM: /comercial/leads/' || r.id || '</p>'
      );
    END IF;

    UPDATE leads SET recordatorio_enviado = true WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;
