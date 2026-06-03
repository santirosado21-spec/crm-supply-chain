# MIGRATIONS_PENDING — Sprint Almacén + Task Tracker + Pizarrón + Calendario Almacén

## Estado: 9 MIGRACIONES PENDIENTES DE APLICAR

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

### 5. `20260526000001_add_vehiculo_58D1AC.sql`
- INSERT en `vehiculos`: clave `RAB_58D1AC`, placa `58D1AC`, Rabón Diésel,
  rendimiento 3.5 km/L, depreciación $200, propio + activo.
- Aparece como opción en el selector del Cotizador (TMS) una vez aplicada.
  Mientras tanto, la unidad ya existe en el fallback hardcoded de
  `cotizadorConstants.ts` (sólo se usa si la tabla está vacía).
- Modelo queda como "Por confirmar" — actualizar desde `VehiculosPage` cuando
  se confirme la marca/modelo real.

### 6. `20260528000001_warehouse_task_takers.sql`
- Nueva tabla puente `warehouse_task_takers` (id, warehouse_task_id FK, taker_name,
  taker_email, started_at, ended_at, duration_min GENERATED, device_id, notes)
  con RLS abierta + realtime + índice parcial sobre takers activos.
- Trigger `sync_warehouse_task_takers_legacy()` mantiene `warehouse_tasks.taken_by_name`
  y `taken_at` sincronizados con el primer taker (activo si lo hay, último histórico
  si todos están cerrados). Preserva 100% el kiosko y RPCs viejos.
- Nuevos RPCs `pizarron_start_taker(task_id, name, email?, device_id?)` y
  `pizarron_end_taker(taker_id, notes?)` (idempotente). Permiten **multi-taker**:
  varias personas pueden tomar la MISMA tarea con timestamps independientes.
- Reescritos `pizarron_claim_task` (firma intacta — sigue siendo single-taker
  exclusivo para no romper el kiosko actual) y `pizarron_complete_task` (ahora
  cierra todos los takers y calcula `actual_duration_min = SUM(duration_min)` —
  horas-hombre acumuladas, que es lo que un CEDIS factura).
- `warehouse_tasks` gana columnas operativas `scheduled_start` + `scheduled_end`
  (independientes de `tasks.scheduled_start` — el director del CEDIS reprograma
  sin afectar la intención original de SAC) y `priority` migra de INT a
  DOUBLE PRECISION (drag-and-drop con inserción lexicográfica).
- Esta migración desbloquea Sessions 2–5 del plan
  `~/.claude/plans/shimmering-strolling-metcalfe.md`.

### 7. `20260603000001_cfdi_fiscal_fields.sql`
- Agrega campos fiscales CFDI 4.0 a `clients`: `rfc`, `razon_social`, `cp_fiscal`,
  `regimen_fiscal_sat`, `uso_cfdi_default`.
- Crea `emisor_config` (single-row, CHECK id=1): RFC + razón social del emisor
  SCC. Seed inicial con placeholders — el usuario los completa en
  `/wms/emisor-config` (página ya activa pero hoy falla porque la tabla no
  existía).
- Crea `cfdi_drafts` (genérica para futuros CFDI no Carta Porte).
- Réplica de la migración archivada `~/Desktop/.../supabase_migration_cfdi_fiscal_fields.sql`
  que nunca se aplicó. RLS abierta + read anon.
- Desbloquea Sesión B2 (Carta Porte).

### 8. `20260603000002_cartas_porte.sql`
- Nueva tabla `cartas_porte` para almacenar Cartas Porte generadas desde
  `/tms/carta-porte`: folio único `CP-YYYY-NNNN`, snapshot del emisor,
  estructura JSONB para remitente/destinatarios/transporte/figura/mercancías,
  totales numéricos espejo, `xml_content` TEXT, `pdf_url` opcional, `uuid_sat`
  para cuando se timbre externamente.
- 3 índices (fecha DESC, status, folio) + trigger `updated_at` + RLS abierta
  + realtime habilitado.
- Standalone por ahora: no integrado con `cartas_instruccion` (el campo FK
  suave `cartas_instruccion.carta_porte_id` queda esperando para fase 2).

### 9. `20260603000003_cartas_porte_viaje_link.sql`
- Agrega `cartas_porte.viaje_id UUID REFERENCES viajes(id) ON DELETE SET NULL`
  + índice parcial `WHERE viaje_id IS NOT NULL`.
- Permite ligar una Carta Porte a un Viaje confirmado (creado vía el Cotizador)
  para trazabilidad + auto-llenado de Transporte/Figura/cliente/carga en
  `/tms/carta-porte`.
- Sin esta migración: el selector "Ligar a viaje" funciona en UI (auto-llena
  los campos), pero el `viaje_id` NO se persiste en BD — al recargar la carta
  porte desde el historial, el banner azul no se restaura.

## Cómo aplicar

Desde el repo vinculado a Supabase:

```bash
npm run db:push        # supabase db push
# o, manualmente, pegar cada archivo en el SQL Editor de Supabase
```

## Seed manual (NO incluido en migración) — ver SECRETS_PENDING.md

La cuenta "Almacén Receptor" y los distribuidores (Luis, Guillermo) deben
insertarse manualmente en `team_members`. Ver `SECRETS_PENDING.md`.
