# MIGRATIONS_PENDING — Sprint Almacén + Task Tracker + Pizarrón

## Estado: 2 MIGRACIONES PENDIENTES DE APLICAR

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

## Cómo aplicar

Desde el repo vinculado a Supabase:

```bash
npm run db:push        # supabase db push
# o, manualmente, pegar cada archivo en el SQL Editor de Supabase
```

## Seed manual (NO incluido en migración) — ver SECRETS_PENDING.md

La cuenta "Almacén Receptor" y los distribuidores (Luis, Guillermo) deben
insertarse manualmente en `team_members`. Ver `SECRETS_PENDING.md`.
