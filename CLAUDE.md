# CLAUDE.md — CRM Supply Chain MX

> Contexto que toda conversación nueva debe conocer. Mantener conciso y actualizado.

## Qué es

CRM operativo para **Supply Chain México** — operador logístico 3PL con CEDIS en Lerma, Edo. de México. Cubre WMS, transporte (TMS) y coordinación de tareas. En producción en Vercel.

## Stack

- **React 19.2** + **Vite 7** + **TypeScript 5.9**
- **Tailwind CSS v4** — sin config file, theming con `@theme` en `src/index.css`
- **Supabase** (`@supabase/supabase-js` v2) — auth, RLS, RPC SECURITY DEFINER, realtime, edge functions
- **react-router-dom v7**, **lucide-react** (iconos), **Recharts** (charts), **Leaflet** (mapas), **jsPDF** (PDFs), **xlsx** (Excel)
- **Vitest** para tests
- Deploy: **Vercel** → https://crm-supply-chain.vercel.app

## Comandos

```bash
npm run dev          # vite --host
npm run build        # vite build
npm run type-check   # tsc -b --noEmit  ← correr antes de commitear
npm run lint         # eslint
npm run test:run     # vitest run
npm run db:push      # supabase db push (aplica migraciones)
npm run db:status    # supabase migration list
```

## Repo

- Path real: `/Users/santiagorosado/Desktop/CRM SUPPLY CHAIN DEFINITIVO/crm-supply-chain/`
- Symlink: `/Users/santiagorosado/CRM SUPPLY CHAIN` → apunta a DEFINITIVO
- GitHub: `santirosado21-spec/crm-supply-chain`
- Branch de producción: `main` (auto-deploy a Vercel)
- Branches de trabajo: usar `feat/<nombre>`, NUNCA force-push a main

## Módulos (3)

| Módulo | Ruta base | Roles |
|---|---|---|
| Herramientas de WMS | `/wms`, `/sac/*`, `/almacen/*` | admin, almacen, servicio_cliente, cobranza |
| Transportes (TMS) | `/tms`, `/cotizador`, `/tramites` | admin, transporte |
| Task Tracker | `/tasks`, `/tasks/admin/*` | admin, almacen, servicio_cliente, cobranza, transporte |

Roles del sistema: `admin`, `almacen`, `servicio_cliente` (SAC), `cobranza`, `transporte`. Definidos en `src/config/permissions.ts` (constantes `WMS_ROLES`, `TMS_ROLES`, `ALMACEN_ROLES`, `TASK_ROLES`).

## Convenciones de UI — OBLIGATORIAS

- **Light mode estilo monday.com.** NO glassmorphism, NO `bg-black`, NO dark mode.
- Cards: `bg-white rounded-xl border border-gray-100 shadow-sm`
- Fondo de página: `style={{ background: 'var(--page-bg)' }}` (#f5f7fa)
- Fuentes: **Syne** (headings, números KPI) + **Plus Jakarta Sans** (body)
- Colores: navy `#1e3a5f` (primario/info), red `#c8373c` (error/acento), green `#28a745` (éxito), amber `#ffc107` (warning)
- Modals: `fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in` + interior `bg-white rounded-2xl shadow-xl`
- Borde animado destacado: clase `.login-frame` (gradiente navy↔red)
- Layout estándar de página: `<Header />` arriba, `<Sidebar />` contextual, `<main>` con scroll
- Sidebar contextual: cada módulo muestra solo sus links. Items nuevos van en las constantes `*_LINKS` de `src/components/layout/Sidebar.tsx`

## Convenciones de código

- `tsc --noEmit` debe pasar limpio antes de cada commit. NO usar `any` salvo payloads externos.
- Supabase joins: `.select('*, clients(name)')`
- Tablas nuevas: RLS habilitado con policy abierta (`FOR ALL USING (true) WITH CHECK (true)`) — consistente con el resto del schema
- Migraciones: `supabase/migrations/YYYYMMDDHHMMSS_nombre.sql`, solo aditivas (no DROP/RENAME de columnas con datos)
- Commits en español. Cerrar mensaje con: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Patrones a copiar: hook CRUD+realtime → `src/hooks/useOperations.ts`; parser PT → `src/lib/ptParser.ts`

## Integración Extensiv

- El CRM consume **Extensiv 3PL Warehouse Manager** como **data source read-only** vía la edge function `supabase/functions/extensiv-proxy/` (`READ_ONLY = true`).
- Endpoints consumidos viven en `src/lib/extensiv.ts`: customers, inventory, orders, receivers, locations, invoices.
- **Extensiv Billing API** (`api-billing.extensiv.com`, auth Cognito JWT) es un servicio SEPARADO del proxy legacy — credenciales pendientes de Extensiv (contacto: John). `pushChargeToExtensiv()` en `src/lib/extensivBilling.ts` empuja charges al Billing Wizard vía `extensiv_billing_log`.

## Hechos del dominio (no obvios del código)

- **IFIT** (código `IFT`): cliente NordicTrack/ProForm. Setup de billing en Extensiv pendiente — contrato PDF V5c en USD, tasa 17.50 MXN/USD. Archivos de setup en `extensiv-setup/ifit/`.
- **Billing operativo conservado:** `RCPage` y Extensiv Billing siguen activos; Proformas y Seko Billing fueron retirados de esta versión México.
- El módulo "Generador CFDI 4.0" fue eliminado del WMS.

## Estado actual

- Branch activo: `feat/limpieza-modulos-mx` — limpieza de módulos para la versión Supply Chain México.
- Planes de sprint viven en `.claude/plans/`.
- Archivos de status de sprints autónomos en raíz: `MIGRATIONS_PENDING.md`, `SECRETS_PENDING.md`, `BLOCKERS.md`, `FIXMES.md`, `SCOPE_GAPS.md`, `SPRINT_REPORT.md`. Revisar después de cada sprint autónomo.
- Backlog general: `PENDIENTES.md`.

## Workflow

- Para sprints multi-fase grandes: terminal CLI + `/ralph-loop` autónomo, delegando código pesado a Codex CLI (`codex exec`).
- Para cambios puntuales: IDE extension con revisión de diffs.
- Una conversación = un tema. `/clear` al cambiar de tema. Sub-agentes (Explore) para tareas que leen muchos archivos.
- Migraciones nuevas: generarlas en `supabase/migrations/` y documentar en `MIGRATIONS_PENDING.md` si no se aplican automáticamente — el usuario las corre en Supabase SQL Editor.
- Secrets (API keys): NUNCA hardcodear ni commitear. Van a Supabase secrets (`supabase secrets set`). Documentar pendientes en `SECRETS_PENDING.md`.
