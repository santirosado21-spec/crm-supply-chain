-- ============================================================================
-- La categoría de una tarea ahora se asigna automáticamente según el área/rol
-- de quien la crea (ver ROLE_TO_CATEGORY_CODE en src/types/tasks.ts). Los
-- roles 'cobranza' y 'comercial' no tenían categoría correspondiente — se
-- agregan para que el mapeo cubra los 6 roles del sistema.
-- ============================================================================

INSERT INTO task_categories (code, name, color, is_billable)
SELECT * FROM (VALUES
  ('cobranza',  'Cobranza',  '#f59e0b', false),
  ('comercial', 'Comercial', '#8b5cf6', false)
) AS v(code, name, color, is_billable)
WHERE NOT EXISTS (SELECT 1 FROM task_categories tc WHERE tc.code = v.code);
