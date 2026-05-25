# MIGRATIONS_PENDING — Sprint Almacén + Task Tracker + Pizarrón + Calendario Almacén

## Estado: 4 MIGRACIONES PENDIENTES DE APLICAR

El sprint se ejecutó en un clon de trabajo (`~/crm-sprint-work`) no vinculado
al proyecto Supabase, por lo que `supabase db push` no se ejecutó. Las
migraciones están en `supabase/migrations/` y son **solo aditivas**.

### 1. `20260521000001_task_distribution.sql`
- `team_members.can_distribute_tasks BOOLEAN DEFAULT false`.
- RPC `task_reassign(p_task_id, p_new_assignee)` — SECURITY DEFINER, reasigna
  tareas, valida distribuidor/admin, registra en `task_audit_log`.

### 2. `20260521000002_pizarron.sql`
- Tabla `warehouse_tasks` (8 áreas) + índices + RLS abierta + realtime.
- RPC `pizarron_claim_task(...)` — toma una tarea (anti doble-claim con FOR UPDATE).
- RPC `pizarron_complete_task(...)` — completa y finaliza la tarea origen.

### 3. `20260525143000_labor_standards.sql`
- Tabla `labor_standards` (task_type UNIQUE, base_duration_min, unit_label, notes)
  + RLS abierta + trigger de updated_at.
- Engineered Labor Standards (Blue Yonder WLM): tiempo base por tipo de tarea
  para almacén. Se administra en `/almacen/estandares` y se usa como sugerencia
  al asignar en el Pizarrón.

### 4. `20260525144000_warehouse_tasks_assignment_fields.sql`
- `warehouse_tasks` gana 4 columnas aditivas:
  `assigned_to_name`, `estimated_duration_min`, `actual_duration_min`,
  `designation_notes`.
- Soporta el flujo phoneless: Guillermo asigna una tarea a un trabajador sin
  cuenta dictando nombre + duración estimada + instrucciones. El kiosko
  muestra esa designación. `actual_duration_min` se captura al completar
  (commit siguiente) como base para medición de productividad BY WLM.

## Cómo aplicar

Desde el repo vinculado a Supabase:

```bash
npm run db:push        # supabase db push
# o, manualmente, pegar cada archivo en el SQL Editor de Supabase
```

## Seed manual (NO incluido en migración) — ver SECRETS_PENDING.md

La cuenta "Almacén Receptor" y los distribuidores (Luis, Guillermo) deben
insertarse manualmente en `team_members`. Ver `SECRETS_PENDING.md`.
