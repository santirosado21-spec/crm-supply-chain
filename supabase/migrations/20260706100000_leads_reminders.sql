-- ============================================================================
-- Recordatorio de leads (un solo disparo a los N días) + correo personal de
-- recordatorios (no necesariamente @supplychain.com.mx).
--
-- Patrón de cron reusado tal cual de generate_task_reminders() /
-- 'task_reminders_5min' en 20260504000013_task_tracker_v3.sql, pero aquí es
-- un solo disparo (no recurrente): una vez enviado, recordatorio_enviado se
-- marca true y no se vuelve a mandar.
-- ============================================================================

-- 1. Correo personal de recordatorios (por usuario, no por lead) ────────────
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS reminder_email TEXT;

-- RPC self-service: cualquier usuario autenticado puede fijar SU PROPIO
-- correo de recordatorios (no requiere ser admin, a diferencia de
-- team_member_set_role — esto no es un cambio de rol/permiso, solo una
-- preferencia personal de notificación).
CREATE OR REPLACE FUNCTION set_my_reminder_email(p_email TEXT)
RETURNS team_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_email TEXT;
  v_result       team_members%ROWTYPE;
BEGIN
  v_caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_caller_email = '' THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión.';
  END IF;

  UPDATE team_members
     SET reminder_email = nullif(trim(p_email), '')
   WHERE lower(user_email) = v_caller_email
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Tu cuenta (%) no está en team_members.', v_caller_email;
  END IF;

  RETURN v_result;
END $$;

REVOKE ALL   ON FUNCTION set_my_reminder_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_my_reminder_email(TEXT) TO authenticated;

-- 2. Recordatorio por lead: N días elegidos al crear/editar ─────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS recordatorio_dias    INTEGER,
  ADD COLUMN IF NOT EXISTS recordatorio_fecha    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recordatorio_enviado  BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_recordatorio_pendiente
  ON leads(recordatorio_fecha)
  WHERE recordatorio_enviado = false AND recordatorio_fecha IS NOT NULL;

-- 3. Job: un solo disparo por lead, correo al reminder_email del responsable ─
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
       AND l.estatus NOT IN ('cerrado_ganado', 'cerrado_perdido')
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

DO $$ BEGIN
  PERFORM cron.unschedule('lead_reminders_hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('lead_reminders_hourly', '0 * * * *', $$ SELECT generate_lead_reminders(); $$);
