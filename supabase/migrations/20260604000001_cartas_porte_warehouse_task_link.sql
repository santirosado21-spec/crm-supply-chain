-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Carta Porte ↔ Tarea de almacén                                              ║
-- ║                                                                              ║
-- ║ Agrega `warehouse_task_id` opcional a `cartas_porte` para ligar una         ║
-- ║ Carta Porte a una tarea de carga de almacén (Pizarrón). Independiente del   ║
-- ║ ligado a viaje — pueden coexistir ambos.                                    ║
-- ║                                                                              ║
-- ║ Migración 100% aditiva, RLS abierta sin cambios.                            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

ALTER TABLE cartas_porte
  ADD COLUMN IF NOT EXISTS warehouse_task_id UUID REFERENCES warehouse_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cartas_porte_warehouse_task
  ON cartas_porte (warehouse_task_id)
  WHERE warehouse_task_id IS NOT NULL;

COMMENT ON COLUMN cartas_porte.warehouse_task_id IS
  'Tarea de almacén (warehouse_tasks) ligada a esta Carta Porte. NULL si no aplica.';
