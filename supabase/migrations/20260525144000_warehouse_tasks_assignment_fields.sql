-- Campos adicionales en warehouse_tasks para soportar el flujo phoneless +
-- duración estimada (Blue Yonder WLM: Labor Standards) + actual duration
-- (Productivity Measurement). Cambios solo aditivos.
--
-- - assigned_to_name        : nombre libre cuando Guillermo asigna a una
--                              persona sin cuenta (no aparece como picker
--                              vía RPC pizarron_claim_task).
-- - estimated_duration_min  : duración aproximada que Guillermo da al asignar
--                              (pre-rellena con el labor_standard del task_type
--                              cuando existe).
-- - actual_duration_min     : duración real al completar — usado en commit
--                              siguiente al cerrar la tarea.
-- - designation_notes       : instrucciones que Guillermo dicta para el
--                              trabajador (sobre todo para los sin celular).

ALTER TABLE warehouse_tasks
  ADD COLUMN IF NOT EXISTS assigned_to_name        TEXT,
  ADD COLUMN IF NOT EXISTS estimated_duration_min  INTEGER CHECK (estimated_duration_min IS NULL OR estimated_duration_min > 0),
  ADD COLUMN IF NOT EXISTS actual_duration_min     INTEGER CHECK (actual_duration_min    IS NULL OR actual_duration_min    > 0),
  ADD COLUMN IF NOT EXISTS designation_notes       TEXT;
