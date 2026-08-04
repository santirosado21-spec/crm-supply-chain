-- ============================================================================
-- El horario se aparta desde que se MANDA la tarea (no al aceptarla)
--
-- Por qué: una tarea nace en 'propuesta', pero tanto el picker de
-- disponibilidad como el constraint tasks_no_overlap solo contaban
-- aceptada/en_curso/pausada. Resultado: agendar a almacén no cerraba el
-- horario y se podían encimar tareas — en prod quedaron TASK00023, TASK00024
-- y TASK00025 las tres el 2026-08-04 15:00-16:00 sobre la cuenta de almacén.
--
-- Decisión de operación: quien manda la tarea aparta el horario en el momento,
-- la mande quien la mande, sin esperar a que almacén acepte. Si almacén la
-- rechaza o se cancela, el slot se libera solo (rechazada/cancelada quedan
-- fuera del WHERE).
--
-- El equivalente en el cliente es BUSY_STATUSES en src/hooks/useTaskAvailability.ts
-- — las dos listas deben mantenerse iguales.
--
-- OJO: un EXCLUDE constraint no admite NOT VALID; Postgres valida todas las
-- filas al crearlo. Si ya existen traslapes en propuesta, este ALTER falla con
-- "conflicting key value violates exclusion constraint". Hay que resolverlos
-- antes (cancelar duplicados o reagendar) — ver query de diagnóstico al final.
-- ============================================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_no_overlap;

ALTER TABLE tasks ADD CONSTRAINT tasks_no_overlap EXCLUDE USING gist (
  assignee_email WITH =,
  time_range     WITH &&
) WHERE (status IN ('propuesta', 'aceptada', 'en_curso', 'pausada'));

-- Diagnóstico — debe devolver 0 filas para que el ALTER de arriba pase:
--
--   SELECT a.ref AS ref_a, b.ref AS ref_b, a.assignee_email, a.scheduled_start
--   FROM tasks a
--   JOIN tasks b ON a.assignee_email = b.assignee_email AND a.id < b.id
--    AND tstzrange(a.scheduled_start, a.scheduled_end, '[)')
--     && tstzrange(b.scheduled_start, b.scheduled_end, '[)')
--   WHERE a.status IN ('propuesta','aceptada','en_curso','pausada')
--     AND b.status IN ('propuesta','aceptada','en_curso','pausada')
--   ORDER BY a.scheduled_start;
