-- ============================================================================
-- Rol 'comercial' — módulo Seguimiento de Leads
--
-- Agrega el rol 'comercial' al CHECK constraint de team_members.role Y a la
-- whitelist hardcodeada dentro de team_member_set_role() (son dos lugares
-- separados — ver 20260504000010_role_transporte.sql para el precedente del
-- CHECK, y 20260506000006_team_member_rpc.sql para el RPC).
--
-- Sin esto, un admin recibe 'INVALID_ROLE' al intentar asignar 'comercial'
-- desde la UI de Equipo y horarios, aunque el CHECK de la tabla ya lo acepte.
-- ============================================================================

ALTER TABLE team_members
  DROP CONSTRAINT IF EXISTS team_members_role_check;

ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('admin','almacen','servicio_cliente','cobranza','transporte','comercial'));

CREATE OR REPLACE FUNCTION team_member_set_role(
  p_email      TEXT,
  p_role       TEXT,
  p_user_name  TEXT DEFAULT NULL,
  p_active     BOOLEAN DEFAULT true
)
RETURNS team_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email TEXT;
  v_admin_count  INT;
  v_result       team_members%ROWTYPE;
BEGIN
  v_caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF v_caller_email = '' THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión.';
  END IF;

  IF p_role NOT IN ('admin','almacen','servicio_cliente','cobranza','transporte','comercial') THEN
    RAISE EXCEPTION 'INVALID_ROLE: % no es un rol válido.', p_role;
  END IF;

  SELECT count(*) INTO v_admin_count
  FROM team_members
  WHERE role = 'admin' AND active = true;

  IF v_admin_count > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM team_members
      WHERE lower(user_email) = v_caller_email
        AND role = 'admin'
        AND active = true
    ) THEN
      RAISE EXCEPTION 'NOT_ADMIN: Tu cuenta (%) no tiene rol admin activo en team_members.', v_caller_email;
    END IF;
  END IF;

  INSERT INTO team_members (user_email, user_name, role, active)
  VALUES (lower(p_email), p_user_name, p_role, p_active)
  ON CONFLICT (user_email) DO UPDATE SET
    user_name = COALESCE(EXCLUDED.user_name, team_members.user_name),
    role      = EXCLUDED.role,
    active    = EXCLUDED.active
  RETURNING * INTO v_result;

  RETURN v_result;
END $$;

-- Helper de rol comercial, mismo patrón que current_user_is_admin()
-- (20260504000012_task_tracker_v2_auth.sql). Incluye 'admin' a propósito:
-- todas las policies de leads necesitan "admin O comercial" juntos, y así
-- el admin nunca queda bloqueado del módulo aunque aún no exista ningún
-- usuario con rol 'comercial' dado de alta.
CREATE OR REPLACE FUNCTION current_user_is_comercial() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
     WHERE lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       AND active = true
       AND role IN ('admin','comercial')
  );
$$;
