-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ Clasificación de tareas por etiquetas (Calendario General)                   ║
-- ║                                                                              ║
-- ║ - `task_tags`: catálogo editable por admin, agrupado por `dimension`         ║
-- ║   (movimiento | area | actividad | prioridad | proveedor)                    ║
-- ║ - `task_tag_links`: puente tarea ↔ etiqueta (N:N)                            ║
-- ║                                                                              ║
-- ║ Migración 100% aditiva. Seed idempotente. RLS + realtime habilitados.        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 1. Catálogo task_tags ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension   TEXT NOT NULL CHECK (dimension IN ('movimiento','area','actividad','prioridad','proveedor')),
  label       TEXT NOT NULL CHECK (btrim(label) <> ''),
  color       TEXT NOT NULL DEFAULT '#1e3a5f',
  sort_order  INT  NOT NULL DEFAULT 100,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_tags_dimension_label
  ON task_tags (dimension, lower(label));
CREATE INDEX IF NOT EXISTS idx_task_tags_dimension_active
  ON task_tags (dimension, active, sort_order);

-- RLS: lectura para autenticados, escritura solo admin (igual que task_categories)
ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tt_select ON task_tags;
CREATE POLICY tt_select ON task_tags
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS tt_admin_write ON task_tags;
CREATE POLICY tt_admin_write ON task_tags
  FOR ALL TO authenticated
  USING (current_user_is_admin()) WITH CHECK (current_user_is_admin());

-- ── 2. Puente task_tag_links ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_tag_links (
  task_id  UUID NOT NULL REFERENCES tasks(id)     ON DELETE CASCADE,
  tag_id   UUID NOT NULL REFERENCES task_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_task_tag_links_tag ON task_tag_links (tag_id);

-- RLS abierta (consistente con la tabla `tasks`)
ALTER TABLE task_tag_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all_task_tag_links ON task_tag_links;
CREATE POLICY anon_all_task_tag_links
  ON task_tag_links
  FOR ALL USING (true) WITH CHECK (true);

-- ── 3. Realtime ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_tags;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_tag_links;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 4. Seed idempotente ──────────────────────────────────────────────────────
INSERT INTO task_tags (dimension, label, color, sort_order)
SELECT * FROM (VALUES
  -- Movimiento
  ('movimiento', 'Entrada',          '#28a745', 10),
  ('movimiento', 'Salida',           '#1e3a5f', 20),
  -- Área / Competencia
  ('area',       'RH',               '#6366f1', 10),
  ('area',       'Transportes',      '#dc3545', 20),
  ('area',       'SAT',              '#0891b2', 30),
  ('area',       'Asset Management', '#7c3aed', 40),
  ('area',       'Dirección',        '#1e3a5f', 45),
  ('area',       'Administración',   '#64748b', 50),
  ('area',       'Almacén',          '#28a745', 60),
  ('area',       'SAC',              '#1e3a5f', 70),
  -- Tipo de actividad
  ('actividad',  'Recepción',        '#28a745', 10),
  ('actividad',  'Embarque',         '#1e3a5f', 20),
  ('actividad',  'Reparación',       '#f59e0b', 30),
  ('actividad',  'Trámite',          '#0891b2', 40),
  ('actividad',  'Cotización',       '#7c3aed', 50),
  ('actividad',  'Facturación',      '#dc3545', 60),
  -- Prioridad
  ('prioridad',  'Alta',             '#dc3545', 10),
  ('prioridad',  'Media',            '#f59e0b', 20),
  ('prioridad',  'Baja',             '#28a745', 30)
) AS v(dimension, label, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM task_tags t
  WHERE t.dimension = v.dimension AND lower(t.label) = lower(v.label)
);

-- ── 5. Comentarios ───────────────────────────────────────────────────────────
COMMENT ON TABLE task_tags IS
  'Catálogo de etiquetas de clasificación de tareas, agrupado por dimension. Editable por admin desde Dirección → Etiquetas.';
COMMENT ON TABLE task_tag_links IS
  'Puente N:N tarea ↔ etiqueta. Una tarea del Calendario General lleva una etiqueta por dimensión requerida.';
