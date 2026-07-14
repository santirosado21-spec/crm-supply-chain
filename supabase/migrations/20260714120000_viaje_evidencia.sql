-- ============================================================================
-- Viajes · evidencia de flete propio (link de Google Drive)
--
-- En vez de recapturar los datos del embarque a mano (la vieja página de
-- "Evidencia de flete propio" montada sobre warehouse_exits), Transportes
-- selecciona un viaje YA existente (creado 'confirmado' desde el Cotizador,
-- con cliente + referencia) y le adjunta el link de Google Drive de la
-- evidencia. La evidencia vive en el propio viaje.
--
-- Se escribe SOLO vía la RPC viaje_attach_evidencia (valida el link
-- server-side con is_google_drive_url, igual que task_close_with_evidence y
-- warehouse_exit_close) — nunca por el UPDATE genérico de viajes.
--
-- Aditivo: columnas nullable, ningún dato existente se ve afectado.
-- ============================================================================

ALTER TABLE viajes ADD COLUMN IF NOT EXISTS evidencia_url   TEXT;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS evidencia_fecha TIMESTAMPTZ;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS evidencia_por   TEXT;

-- is_google_drive_url() ya existe (20260707100002_task_close_evidence_link.sql).
CREATE OR REPLACE FUNCTION viaje_attach_evidencia(
  p_viaje_id      UUID,
  p_evidence_url  TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller TEXT := current_user_email();
BEGIN
  IF v_caller = '' THEN RAISE EXCEPTION 'no auth'; END IF;
  IF NOT is_google_drive_url(p_evidence_url) THEN
    RAISE EXCEPTION 'Captura un link de Google Drive válido para la evidencia del viaje';
  END IF;

  UPDATE viajes
     SET evidencia_url   = btrim(p_evidence_url),
         evidencia_fecha = now(),
         evidencia_por   = v_caller,
         updated_at      = now()
   WHERE id = p_viaje_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Viaje no encontrado'; END IF;
END;
$$;

REVOKE ALL     ON FUNCTION viaje_attach_evidencia(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION viaje_attach_evidencia(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
