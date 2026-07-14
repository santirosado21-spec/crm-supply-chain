# MIGRATIONS_PENDING — Sprint Almacén + Task Tracker + Pizarrón + Calendario Almacén

## Estado: 10 MIGRACIONES PENDIENTES DE APLICAR (#11-#22 ya aplicadas)

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

### 10. `20260604000001_cartas_porte_warehouse_task_link.sql`
- Agrega `cartas_porte.warehouse_task_id UUID REFERENCES warehouse_tasks(id) ON DELETE SET NULL`
  + índice parcial `WHERE warehouse_task_id IS NOT NULL`.
- Permite ligar una Carta Porte a una tarea del Pizarrón de Almacén
  (recepción/picking/embarque/etc.) para trazabilidad ex-post. Independiente
  del `viaje_id` — ambos pueden coexistir en la misma Carta Porte.
- Sin esta migración: el selector "Ligar a tarea de almacén" funciona en UI
  (banner verde aparece) pero el `warehouse_task_id` NO se persiste — al
  recargar desde el historial, el vínculo se pierde.

### 11. `20260624000001_warehouse_entries.sql` ✅ APLICADA (2026-06-25, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; tabla + RLS + realtime activos)
- Nueva tabla `warehouse_entries` que respalda el **wizard unificado de entradas
  de almacén** (`/almacen/entradas`): 3 pasos en un solo flujo con estado
  compartido (cliente + nota subida una sola vez).
- Columnas JSONB para nota original (`original_items`), validación de alta
  (`step1_results`/`step1_complete`), items editados + export
  (`step2_items`/`export_generated`), y verificación + anomalías
  (`step3_results`/`anomalies`). Estado del flujo en `flow_status` +
  `current_step`. Trazabilidad por email (`created_by`).
- 3 índices (status+fecha, customer_id, created_by) + trigger `updated_at` +
  RLS abierta. Patrón base: `cartas_instruccion.sql`.
- Sin esta migración: el wizard carga pero **no persiste ni reanuda** — cada
  paso funciona en memoria de la sesión y se pierde el historial al recargar.
  Las 3 páginas sueltas (Validador de Códigos / Facilitador / Validación de
  Entrada) siguen funcionando sin la tabla.

### 12. `20260625000001_warehouse_entries_transaction.sql` ✅ APLICADA (2026-06-25, vía MCP en prod `uifrgmiqpkbgyvzbcldn`)
- `warehouse_entries` gana `extensiv_transaction_id TEXT` (número de transacción de
  Extensiv capturado en el Paso 3 — trazabilidad/log) y `document_total_qty INTEGER`
  (total declarado de la nota para auto-verificación) + índice `idx_we_transaction`.
- Sin esta migración el wizard funciona, pero no persiste el número de transacción ni
  el total para reconciliación.

### 13. `20260625130000_task_tags.sql` ✅ APLICADA (2026-06-25, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; tablas + RLS + realtime + seed de 18 etiquetas activos)
- Nueva tabla `task_tags` (catálogo de etiquetas de clasificación de tareas,
  agrupado por `dimension`: movimiento | area | actividad | prioridad | proveedor)
  con `label`, `color`, `sort_order`, `active`. RLS: lectura autenticada, escritura
  solo admin (`current_user_is_admin()`, igual que `task_categories`). Índice
  único `(dimension, lower(label))` + índice `(dimension, active, sort_order)`.
- Nueva tabla puente `task_tag_links` (task_id FK → tasks, tag_id FK → task_tags,
  PK compuesta) con RLS abierta + índice en `tag_id`.
- Realtime habilitado en ambas. Seed idempotente de movimiento/área/actividad/
  prioridad (proveedor queda vacío — lo llena admin desde Dirección → Etiquetas).
- Respalda la clasificación obligatoria de tareas del **Calendario General** y
  los filtros por etiqueta. Sin esta migración el formulario de "Crear tarea para
  Calendario General" y los filtros de `/agenda` fallan al leer `task_tags`.

### 14. `20260702000001_extensiv_item_log.sql` ✅ APLICADA (2026-07-02, vía MCP `apply_migration` en prod `uifrgmiqpkbgyvzbcldn`; tabla + 2 RPCs verificados)
- Nueva tabla `extensiv_item_log` (log idempotente de alta de SKUs en Extensiv
  desde el Paso 1 del wizard de Entradas) + RPCs SECURITY DEFINER
  `extensiv_item_log_attempt` / `extensiv_item_log_finalize`. UNIQUE
  `(customer_id, sku)` para no duplicar el alta. RLS abierta. Patrón espejo de
  `extensiv_billing_log`.
- Sin esta migración el botón "Dar de alta" del Paso 1 falla al llamar los RPCs.
- Requiere además habilitar la escritura del proxy (`EXTENSIV_WRITE_ENABLED`) y el
  flag de UI (`VITE_EXTENSIV_WRITE_ENABLED`) — ver `SECRETS_PENDING.md §5`.

### 15. `20260707100000_task_start_timer_custom_ts.sql` ✅ APLICADA (2026-07-07, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; firma verificada con `p_started_at`)
- `task_start_timer` gana parámetro opcional `p_started_at TIMESTAMPTZ` (si es
  NULL usa `now()`, comportamiento idéntico a antes). Permite iniciar el timer
  de una tarea con una hora real distinta a "ahora" (ej. el trabajador olvidó
  dar inicio a tiempo), con guard server-side de que no sea futuro.
- Sin esta migración, el botón "Elegir otra hora de inicio" en `TaskTimerWidget`
  falla porque el RPC en prod todavía solo acepta 2 parámetros.

### 16. `20260707100001_pizarron_taker_duration.sql` ✅ APLICADA (2026-07-07, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; RPC probado end-to-end contra un warehouse_task inexistente → error de negocio esperado, no error de sintaxis)
- `pizarron_start_taker` gana parámetro opcional `p_duration_min INT`: cuando
  el trabajador de almacén da clic en "TOMAR" e indica cuánto va a tardar, el
  RPC actualiza `warehouse_tasks.estimated_duration_min` y calcula
  `scheduled_start`/`scheduled_end` = `taken_at` + duración — eso es lo que
  bloquea su bloque en la agenda operativa.
- Sin esta migración, el modal de "Tomar tarea" pide la duración en la UI pero
  el RPC en prod la ignora silenciosamente (parámetro desconocido → error).

### 17. `20260707100002_task_close_evidence_link.sql` ✅ APLICADA (2026-07-07, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; columnas + función helper + 3 RPCs verificados end-to-end)
- `tasks` y `warehouse_tasks` ganan columna `completion_evidence_url TEXT`.
- Nueva función helper `is_google_drive_url(url)`.
- Nuevo RPC `task_close_with_evidence(p_task_id, p_evidence_url)` — camino de
  cierre para TaskTraceabilityPanel/WarehouseOperativoPanel/AgendaPage.
- `task_finalize_timer` y `pizarron_complete_task` ganan parámetro
  `p_evidence_url`, obligatorio y validado contra Drive/Docs antes de cerrar.
- Nota de seguridad (advisors, no bloqueante): `task_start_timer`,
  `task_finalize_timer`, `task_close_with_evidence` e `is_google_drive_url`
  quedan con "role mutable search_path" (no tienen `SET search_path = public`,
  a diferencia de los RPCs `pizarron_*` que sí lo tienen desde antes). Es un
  patrón pre-existente en los RPCs `task_*` de Task Tracker (no introducido por
  este fix) — pendiente de endurecer si se decide una limpieza de seguridad.

### 18. `20260707200000_task_accept_duration.sql` ✅ APLICADA (2026-07-07, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; RPC probado contra ID inexistente → error de negocio esperado)
- `task_change_status` gana parámetro `p_duration_min INT DEFAULT NULL`: al
  aceptar una tarea del Calendario General (no solo Pizarrón), el asignado
  ahora debe indicar cuánto va a tardar; el RPC recalcula
  `scheduled_end = scheduled_start + duración` (mantiene `scheduled_start`
  tal cual lo propuso el asignador). La EXCLUDE constraint `tasks_no_overlap`
  protege contra traslapes, devolviendo un mensaje claro en vez de un error crudo.
- Sin esta migración, el modal de "Aceptar tarea" en `TaskDetail` pide la
  duración pero el RPC en prod la ignora (parámetro desconocido → error).

### 19. `20260707200001_warehouse_entry_close_evidence.sql` ✅ APLICADA (2026-07-07, vía MCP en prod `uifrgmiqpkbgyvzbcldn`)
- `warehouse_entries` gana columna `completion_evidence_url TEXT`.
- Nuevo RPC `warehouse_entry_close(p_id, p_evidence_url)` — reutiliza
  `is_google_drive_url()` (de la migración #17). Finalizar una entrada desde
  el wizard (Paso 1 único) ahora exige un link de Google Drive válido.
- Sin esta migración, el botón "Finalizar entrada" falla porque el RPC no existe en prod.

### 20. `20260707200002_warehouse_exits.sql` ✅ APLICADA (2026-07-07, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; tabla + RPC verificados)
- Nueva tabla `warehouse_exits` — contraparte simple de `warehouse_entries`
  (registrar salida + cerrar con evidencia), sin integración con la API de
  Extensiv (ver memoria `extensiv-shipout-blocked-on-api` — el ship-out vía
  API sigue bloqueado). El cierre vive solo en el CRM.
- Nuevo RPC `warehouse_exit_close(p_id, p_evidence_url)`, mismo patrón que
  `warehouse_entry_close`. RLS abierta + realtime habilitado.
- Nueva página `/almacen/salidas` + `/almacen/salidas/historial`.
- Sin esta migración, la página de Salidas no puede leer/escribir nada — la tabla no existe.

### 21. `20260707200003_task_categories_cobranza_comercial.sql` ✅ APLICADA (2026-07-07, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; 7 categorías confirmadas)
- Agrega categorías `cobranza` y `comercial` a `task_categories` — antes solo
  existían almacen/sac/transporte/admin/interno, sin cubrir esos 2 roles del
  mapeo automático `ROLE_TO_CATEGORY_CODE` (`src/types/tasks.ts`).
- Sin esta migración, un usuario con rol `cobranza` o `comercial` crea una
  tarea sin categoría asignada (el lookup no encuentra código coincidente).

### 22. `20260707200004_task_accept_responsables.sql` ✅ APLICADA (2026-07-07, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; columna + RPC verificados)
- `tasks` gana columna `responsables TEXT[] NOT NULL DEFAULT '{}'`.
- `task_change_status` gana parámetro `p_responsables TEXT[]`: al aceptar una
  tarea general, además de la duración (horas+minutos en el modal), el
  asignado ahora debe marcar quiénes son los responsables físicos del
  movimiento (checklist de personas con rol `almacen`).
- Sin esta migración, el modal de "Aceptar tarea" pide responsables pero el
  RPC en prod no reconoce el parámetro.

### 23. `20260709100000_viajes_cliente_referencia.sql` ✅ APLICADA (2026-07-09, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; 7 columnas verificadas)
- Regreso del módulo de facturación (Proforma consolidada), con otro enfoque:
  en vez de empujar cargos a Extensiv, se importa el CSV del Billing Manager
  (ya configurado) y se consolida con flete propio + paquetería del CRM.
- `viajes` gana `cliente_id` (FK real a `clients`), `cliente_codigo`,
  `referencia_origen` ('extensiv'|'manual'), `extensiv_transaction_type/id/customer_id`,
  `referencia_manual` — mismo patrón que ya usa `guias_paqueteria`. Antes el
  cliente vivía como texto libre dentro de `notas` y no había forma de
  emparejar un viaje con una transacción/referencia real.
- OJO: `viajes.origen` ya existía (ciudad de origen) — la columna nueva se
  llama `referencia_origen` para no chocar con ella.
- Sin esta migración, `ViajeForm.tsx` (ya actualizado en el frontend para usar
  `ExtensivOperationPicker`) falla al guardar.

### 24. `20260709100001_proformas_periodo.sql` ✅ APLICADA (2026-07-09, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; tablas + RLS verificadas)
- Tablas nuevas `proformas_periodo` (header: cliente, periodo, moneda, tipo de
  cambio, subtotales por sección WMS/flete/paquetería, IVA, total, estado) y
  `proforma_periodo_lineas` (detalle por fuente: `csv_extensiv`/`viaje`/`guia_paqueteria`).
  RLS `TO authenticated` (la tabla `proformas` residual vieja, 1-a-1 con una
  sola operación, no se toca — no sirve para consolidar multi-fuente/periodo).

### 25. `20260709100002_viajes_guias_facturado_marker.sql` ✅ APLICADA (2026-07-09, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; columnas verificadas en ambas tablas)
- `viajes.facturado_en_proforma_id` y `guias_paqueteria.facturado_en_proforma_id`
  (FK a `proformas_periodo`) — evitan que el mismo viaje/guía se facture dos
  veces en proformas distintas del mismo cliente.

### 26. `20260709100003_proforma_periodo_rpc.sql` ✅ APLICADA (2026-07-09, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; probada end-to-end: `save_proforma_periodo` generó folio `PRFWD0001` con subtotal/IVA/total correctos, `cancel_proforma_periodo` liberó el registro — datos de prueba borrados después)
- `next_proforma_periodo_reference` (folio `PRF<codigo><seq>`, mismo patrón que
  `next_operation_reference`).
- `save_proforma_periodo` — SECURITY DEFINER, atómica: inserta header + líneas
  (solo `incluida=true` cuenta en subtotales) y marca `viajes`/`guias_paqueteria`
  incluidos como facturados. Evita condición de carrera si dos personas generan
  proformas del mismo cliente a la vez.
- `cancel_proforma_periodo` — marca cancelada y libera los viajes/guías
  asociados (`facturado_en_proforma_id = NULL`) para re-facturarlos.
- Desbloquea `/proforma` (generar) y `/proforma/historial` (consultar/cancelar).

### 27. `20260709100004_task_close_no_evidence_assignee_only.sql` ✅ APLICADA (2026-07-09, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; firmas verificadas con `pg_proc`, probada contra ID inexistente — error de negocio, no de sintaxis)
- `task_close_with_evidence(p_task_id, p_evidence_url DEFAULT NULL)` — ya no
  exige ni valida el link de Google Drive (evidencia opcional); ya no permite
  cerrar al `assigner_email`, solo al `assignee_email` (+ admin).
- `task_finalize_timer(p_task_id, p_user_email, p_evidence_url)` — mismo
  cambio, solo se quitó la validación de link de Drive (el permiso ya era
  solo-asignado, no cambió).
- **No aplica** a `pizarron_complete_task`, `warehouse_entry_close` ni
  `warehouse_exit_close` (incluye el cierre de "Evidencia de flete propio",
  antes Salidas) — esos tres siguen exigiendo evidencia sin cambios.

### 27. `20260713100000_proforma_retencion.sql` ✅ APLICADA (2026-07-13, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; verificada end-to-end con el CSV real de Toughbuilt — retención −$320 sobre $8,000 de flete, total consistente UI/Excel/PDF/BD)
- `proformas_periodo` gana `retencion_pct` y `retencion_monto`: retención de IVA
  del 4% por autotransporte de carga, calculada SOLO sobre el subtotal de flete
  propio. Total = subtotal + IVA − retención.
- `save_proforma_periodo` recalculada para persistir lo mismo que muestra el
  frontend (`computeProformaTotals`). Las proformas guardadas antes de esta
  migración tienen retención 0 (motor viejo).
- Parte del export profesional de Proforma (formato de la plantilla real):
  portada agregada + hojas Servicios Transporte / Paqueterías / Desglose
  Almacén, en Excel (exceljs) y PDF.

### 28. `20260714100000_viaje_estado_confirmado.sql` ✅ APLICADA (2026-07-14, vía MCP en prod `uifrgmiqpkbgyvzbcldn`; CHECK re-creado, `'confirmado'` permitido — verificado)
- Agrega `'confirmado'` al CHECK de `viajes.estado`. Al confirmar una cotización
  en el Cotizador, el viaje se registra directo como `confirmado` (ya con
  `cliente_id`/`cliente_codigo` y `referencia_manual`), para que Transportes lo
  vea en su sección de confirmados sin recapturarlo.
- `confirmado` YA es facturable: entra directo a la proforma del cliente
  (`VIAJE_ESTADOS_FACTURABLES = ['confirmado','completado','entregado']`).
  Transportes puede seguir moviéndolo a Completado/Entregado cuando se realice.
- Nota: el CHECK existente se llamaba `viajes_estado_check`; se hizo DROP IF
  EXISTS + ADD (el `DO $$` que buscaba por `IN` no matcheó porque Postgres lo
  normaliza a `= ANY(ARRAY[...])`).

## Cómo aplicar

Desde el repo vinculado a Supabase:

```bash
npm run db:push        # supabase db push
# o, manualmente, pegar cada archivo en el SQL Editor de Supabase
```

## Seed manual (NO incluido en migración) — ver SECRETS_PENDING.md

La cuenta "Almacén Receptor" y los distribuidores (Luis, Guillermo) deben
insertarse manualmente en `team_members`. Ver `SECRETS_PENDING.md`.
