# SPRINT REPORT — Almacén + Task Tracker + Pizarrón

**Branch:** `feat/almacen-pizarron`
**Fecha:** 2026-05-21
**Modo:** autónomo / bypass

## Resumen

Sprint de 5 fases. La Fase 1 ya estaba commiteada al arrancar. Las Fases 2–5
se ejecutaron en esta sesión. `tsc -b --noEmit` limpio y `npm run build`
exitoso al cierre.

> ⚠️ El sprint se desarrolló en un clon de trabajo por un bloqueo de macOS/TCC
> sobre el repo en `~/Desktop`. Ver `BLOCKERS.md` para la acción requerida de
> sincronización del working tree de Desktop.

## Commits del sprint

| Commit | Fase | Descripción |
|--------|------|-------------|
| `8a1a1bd` | 1 | (previo) calendario global + limpieza de TaskCreate |
| `a9d8dfd` | 2 | Receipt Generator → Almacén + validación obligatoria de SKUs |
| `11a1ef6` | 3 | Flujo de distribución de tareas |
| `4b5c0da` | 4 | Pizarrón de Operaciones — kiosk + admin + realtime |
| (final)   | 5 | Polish, status files y SPRINT_REPORT |

## Fases

### Fase 1 — Calendario global + TaskCreate (previa)
Ya commiteada (`8a1a1bd`). Verificado: la migración
`20260520000001_task_calendar_global_rls.sql` hace el SELECT de `tasks` global
para miembros activos; INSERT/UPDATE/DELETE siguen restringidos a
assigner/assignee/admin (no-asignados ven read-only).

### Fase 2 — Receipt Generator a Almacén + validación de SKUs
- `ReceiptGeneratorPage` y `receiptExport` movidos de `src/pages/sac/` a
  `src/pages/almacen/`.
- Ruta `/almacen/receipt-generator` (`ALMACEN_ROLES`). `/sac/receipt-generator`
  redirige a la nueva ruta.
- Validación de cada SKU contra el inventario Extensiv del cliente
  seleccionado, espejo de `findInventoryMatch` del Validador SKU
  (exacto / parcial / no encontrado).
- Botón "Generar Excel" bloqueado hasta validar el 100%: filas rojas siempre
  bloquean; filas amarillas requieren confirmación por checkbox. Banner de
  estado + autocomplete del catálogo Extensiv + corrección de SKU en vivo.
- Sidebar: "Generador Receipt" pasa de `WMS_LINKS` a `ALMACEN_LINKS`.

### Fase 3 — Flujo de distribución
- Migración `20260521000001`: `team_members.can_distribute_tasks` + RPC
  `task_reassign` (SECURITY DEFINER, valida distribuidor/admin, audita).
- `DistributionInboxPage` (`/almacen/distribucion`): lista las tareas
  `propuesta` que SAC envió a la cuenta receptora; los distribuidores las
  reasignan. Gating por `can_distribute_tasks`; realtime sobre `tasks`.

### Fase 4 — Pizarrón de Operaciones
- Migración `20260521000002`: tabla `warehouse_tasks` (8 áreas) + RLS + realtime
  + RPCs `pizarron_claim_task` / `pizarron_complete_task`.
- `useWarehouseTasks` (query + realtime + mutaciones), `types/pizarron.ts`.
- `PizarronBoard` (componente compartido): grid de comandas, modal TOMAR con
  nombre libre.
- `PizarronPage` (`/almacen/pizarron`), `PizarronKioskPage`
  (`/almacen/pizarron-kiosk`, fullscreen, refresco 30s), `PizarronAdminPage`
  (`/almacen/pizarron-admin`, alta de tareas + stats del día).

### Fase 5 — Polish
- `WMS_LINKS` ya no contiene Receipt Generator; redirect `/sac/...` verificado.
- Sin `// FIXME-AUTONOMOUS`. Corregido un `no-useless-escape` en `receiptExport`.
- `tsc` limpio + `npm run build` OK.

## Archivos nuevos

```
src/config/almacen.ts
src/types/pizarron.ts
src/hooks/useWarehouseTasks.ts
src/components/almacen/PizarronBoard.tsx
src/pages/almacen/DistributionInboxPage.tsx
src/pages/almacen/PizarronPage.tsx
src/pages/almacen/PizarronKioskPage.tsx
src/pages/almacen/PizarronAdminPage.tsx
supabase/migrations/20260521000001_task_distribution.sql
supabase/migrations/20260521000002_pizarron.sql
```

## Archivos modificados / movidos

```
src/pages/sac/ReceiptGeneratorPage.tsx  → src/pages/almacen/ (reescrito con validación)
src/pages/sac/receiptExport.ts          → src/pages/almacen/
src/App.tsx                  (rutas: receipt, distribución, pizarrón x3 + redirect)
src/components/layout/Sidebar.tsx       (WMS_LINKS / ALMACEN_LINKS / detectModule)
src/config/permissions.ts               (moduleFromPath reconoce /almacen/*)
```

## Pendientes

- **MIGRATIONS_PENDING.md** — aplicar `20260521000001` y `20260521000002`
  (`npm run db:push`).
- **SECRETS_PENDING.md** — seed manual de `team_members` (cuenta receptora +
  distribuidores); env var opcional `VITE_ALMACEN_RECEPTOR_EMAIL`.
- **FIXMES.md** — ninguno.
- **BLOCKERS.md** — sincronizar el working tree de `~/Desktop` con
  `git reset --hard origin/feat/almacen-pizarron`.

## Verificación final

- [x] `npx tsc -b --noEmit` limpio
- [x] `npm run build` exitoso
- [x] Fases 2–5 ejecutadas
- [x] 6 status files con contenido del sprint
- [x] Commits en `feat/almacen-pizarron`, push al remoto
