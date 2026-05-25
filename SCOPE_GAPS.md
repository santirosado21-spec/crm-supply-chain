# SCOPE_GAPS — Sprint Almacén + Task Tracker + Pizarrón

Simplificaciones y desviaciones respecto al spec original. Todo lo listado es
funcional; son decisiones de pragmatismo dentro del modo autónomo.

## Fase 2 — Receipt Generator

- **Sin fallback de inventario manual.** El Validador SKU permite subir un
  Excel de inventario si Extensiv no está configurado. El Receipt Generator
  movido usa **solo** el dropdown de cliente Extensiv como fuente de validación
  (Extensiv está configurado en producción). Si `isExtensivConfigured()` es
  falso, se muestra un aviso y la validación queda deshabilitada.
- **Autocomplete vía `<datalist>`** con el catálogo completo de SKUs del
  cliente. Suficiente para los tamaños de catálogo actuales; si un cliente
  tuviera decenas de miles de SKUs convendría un combobox virtualizado.

## Fase 3 — Distribución de tareas

- **Visibilidad del link en el Sidebar.** El spec pedía mostrar
  "Distribución tareas" / "Pizarrón Admin" solo si `can_distribute_tasks=true`.
  Se simplificó: los links están siempre visibles en `ALMACEN_LINKS` y el
  **gating real es a nivel de página** (cada página consulta el flag y muestra
  un estado "Acceso restringido" a los no-distribuidores). Razón: filtrar links
  por flag exigía exponer `can_distribute_tasks` en `useAuth`/`LocalUser` y
  añadir lógica condicional en `Sidebar.tsx` — el riesgo nº4 del spec pedía no
  tocar `Sidebar.tsx` fuera de `ALMACEN_LINKS`. El gating de página es seguro.
- **`detectModule` / `moduleFromPath`.** Se ajustó la detección de módulo para
  reconocer `/almacen/*` (no solo `/almacen`) como módulo "almacen" — necesario
  para que las páginas nuevas muestren el Sidebar de Almacén. Cambio mínimo de
  una línea en `Sidebar.tsx` y otra en `permissions.ts`.
- **Cuenta receptora.** El email de la cuenta "Almacén Receptor" vive en
  `src/config/almacen.ts` (`ALMACEN_RECEPTOR_EMAIL`), overridable por env var,
  en lugar de hardcodearse repartido por el código.

## Fase 4 — Pizarrón de Operaciones

- **`PizarronBoard` como componente compartido.** El spec listaba PizarronPage
  y PizarronKioskPage por separado; para que el kiosk "reutilice componentes"
  se extrajo `src/components/almacen/PizarronBoard.tsx`, usado por ambas con un
  prop `kiosk`.
- **Layout.** El tablero es un grid responsivo de tarjetas (4 col / 2 / 1) tipo
  comandas, cada tarjeta coloreada por área — en vez de columnas-kanban fijas
  por área (hay 8 áreas, no caben como columnas en una pantalla).
- **Completar tarea** se ejecuta directo al pulsar COMPLETAR (sin modal de
  notas). El RPC `pizarron_complete_task` acepta notas opcionales; el campo
  `notes` queda disponible para un futuro flujo de cierre con observaciones.
- **Auto-fullscreen del kiosk.** `requestFullscreen()` se intenta al montar,
  pero los navegadores suelen exigir gesto del usuario; por eso hay un botón
  "Pantalla completa" de respaldo.

## Arquitectura Claude + Codex

- El spec sugería delegar páginas grandes a Codex. Se construyó todo
  directamente con Claude — coherencia de tipos entre fases y, sobre todo,
  porque el entorno estaba degradado por el bloqueo de TCC (ver `BLOCKERS.md`).
  Resultado: 4/4 fases con type-check y build verdes.
