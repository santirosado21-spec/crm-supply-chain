-- Engineered Labor Standards: tiempo base por tipo de tarea para almacén.
-- Concepto tomado de Blue Yonder Workforce & Labor Management. Permite a
-- Guillermo definir cuánto debería tomar cada tipo de tarea (recepción,
-- picking, embarque, etc.) y usarlo como sugerencia al asignar tareas en
-- el pizarrón, además de baseline para futura medición de productividad.

CREATE TABLE IF NOT EXISTS labor_standards (
  id                 BIGSERIAL PRIMARY KEY,
  task_type          TEXT      NOT NULL UNIQUE,
  base_duration_min  INTEGER   NOT NULL CHECK (base_duration_min > 0),
  unit_label         TEXT,                              -- 'por orden', 'por pallet', 'por SKU'
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labor_standards_task_type_idx ON labor_standards (task_type);

ALTER TABLE labor_standards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS labor_standards_all ON labor_standards;
CREATE POLICY labor_standards_all ON labor_standards
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger para mantener updated_at
CREATE OR REPLACE FUNCTION labor_standards_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS labor_standards_set_updated ON labor_standards;
CREATE TRIGGER labor_standards_set_updated
  BEFORE UPDATE ON labor_standards
  FOR EACH ROW EXECUTE FUNCTION labor_standards_touch_updated_at();
