-- ============================================================================
-- Cerrar una entrada de almacén (warehouse_entries) también requiere un link
-- de Google Drive como evidencia, igual que las tareas (task_close_with_evidence).
-- Reutiliza is_google_drive_url() ya creada en 20260707100002.
-- ============================================================================

ALTER TABLE warehouse_entries
  ADD COLUMN IF NOT EXISTS completion_evidence_url TEXT;

CREATE OR REPLACE FUNCTION warehouse_entry_close(
  p_id            UUID,
  p_evidence_url  TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_google_drive_url(p_evidence_url) THEN
    RAISE EXCEPTION 'Captura un link de Google Drive válido para cerrar la entrada';
  END IF;

  UPDATE warehouse_entries
     SET flow_status = 'completada',
         completed_at = now(),
         completion_evidence_url = btrim(p_evidence_url)
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada no encontrada';
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION warehouse_entry_close(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION warehouse_entry_close(UUID, TEXT) TO authenticated, anon;
