# SECRETS_PENDING — Sprint Almacén + Task Tracker + Pizarrón

El sprint base (Almacén/Pizarrón) no introdujo credenciales: solo las dos tareas
de configuración manual de abajo (§1 y §2). La extracción con IA del Generador
Receipt Import sí agrega un secreto nuevo — ver §3.

## 1. Seed de `team_members` — cuenta receptora + distribuidores

Necesario para que funcione el flujo de Distribución (Fase 3). Correr en el
SQL Editor de Supabase **después** de aplicar `20260521000001_task_distribution.sql`:

```sql
-- Cuenta "Almacén Receptor": recibe las tareas que SAC manda a almacén.
INSERT INTO team_members (user_email, user_name, role, active, can_distribute_tasks)
VALUES ('almacen@supplychain.mx', 'Almacén Receptor', 'almacen', true, false)
ON CONFLICT (user_email) DO UPDATE
  SET user_name = EXCLUDED.user_name, role = EXCLUDED.role, active = EXCLUDED.active;

-- Distribuidores: pueden reasignar tareas desde /almacen/distribucion.
INSERT INTO team_members (user_email, user_name, role, active, can_distribute_tasks)
VALUES
  ('luis.trujillo@supplychain.mx',  'Luis Trujillo',  'almacen', true, true),
  ('guillermo.luna@supplychain.mx', 'Guillermo Luna', 'almacen', true, true)
ON CONFLICT (user_email) DO UPDATE
  SET can_distribute_tasks = EXCLUDED.can_distribute_tasks;
```

> Los emails de ejemplo (`@supplychain.mx`) deben ajustarse a las cuentas
> reales de Supabase Auth. Para que el usuario pueda iniciar sesión, el email
> debe existir también en Supabase Auth (Authentication → Users).

## 2. Variable de entorno opcional — `VITE_ALMACEN_RECEPTOR_EMAIL`

`src/config/almacen.ts` lee el email de la cuenta receptora de
`VITE_ALMACEN_RECEPTOR_EMAIL`, con fallback `almacen@supplychain.mx`.

Si la cuenta receptora real tiene otro email, agregarlo en Vercel
(Environment Variables) y en `.env` local:

```
VITE_ALMACEN_RECEPTOR_EMAIL=<email-real-de-la-cuenta-receptora>
```

No es un secreto — es un identificador de ruteo. Si el default
`almacen@supplychain.mx` coincide con la cuenta real, no se necesita nada.

## 3. OpenRouter — visión para el Generador Receipt Import

La extracción de PDFs del Generador Receipt Import usa un modelo de visión vía
OpenRouter (edge function `openrouter-vision`). La API key es un **secreto** y
NO vive en el repo. Configurarla en Supabase secrets:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
# Opcional — modelo por defecto (si se omite: google/gemini-2.5-flash):
supabase secrets set OPENROUTER_VISION_MODEL=google/gemini-2.5-flash
```

Luego desplegar la función:

```bash
supabase functions deploy openrouter-vision
```

> La key anterior estuvo expuesta en un PDF dentro del repo (`API OPEN ROUTER (1).pdf`,
> ya eliminado). **Rotarla en el dashboard de OpenRouter** antes de usarla.

`SUPABASE_URL` y `SUPABASE_ANON_KEY` (usados para validar el JWT del usuario) los
inyecta la plataforma automáticamente — no hay que configurarlos.

## 4. Resend — verificar dominio para el correo de tareas ⚠️ PENDIENTE

**Síntoma confirmado (prod, tabla `email_log`, 2026-07-01):** los correos de
notificación de tareas (`notify_task_event` → `db_send_task_email` → edge fn
`notify-task-email` → Resend) **solo llegan a `santirosado21@gmail.com`** (dueño
de la cuenta Resend, HTTP 200). Cualquier otro destinatario del equipo falla con
`403 validation_error: "You can only send testing emails to your own email address"`.
El gate 401 histórico (EDGE_SHARED_SECRET) ya está resuelto — hoy el pipeline sí
llega a Resend. **Lo único que falta es verificar un dominio propio.**

> Esto NO bloquea mandar/recibir tareas ni la campanita in-app (las notificaciones
> in-app funcionan). Solo afecta la entrega por correo al resto del equipo.

Pasos (el usuario los hace cuando tenga acceso al DNS):

1. En Resend → **Domains** → agregar `supplychain.com.mx` y crear los registros
   **SPF + DKIM** (y DMARC) que Resend indique en el DNS del dominio. Esperar a
   que Resend marque el dominio como **Verified**.
2. Setear el remitente en Supabase secrets (hoy cae al sandbox
   `onboarding@resend.dev`, ver `supabase/functions/notify-task-email/index.ts:12`):

   ```bash
   supabase secrets set FROM_EMAIL="CRM Supply Chain <notificaciones@supplychain.com.mx>"
   ```
3. Confirmar que `RESEND_API_KEY` y `EDGE_SHARED_SECRET` sigan configurados:

   ```bash
   supabase secrets list
   ```
4. Redeploy de la función tras cambiar secrets:

   ```bash
   supabase functions deploy notify-task-email
   ```
5. Validar: crear una tarea y revisar `email_log` (status `sent`, http 200) para
   un destinatario `@supplychain.com.mx`.

## Estado

- [x] Migración `20260521000001` (task_distribution) aplicada — vía MCP, 2026-07-01
- [x] Cuenta receptora + distribuidores ya existen en prod (dominio real
  `@supplychain.com.mx`; el seed de §1 con `@supplychain.mx` quedó de ejemplo).
  `gluna.lrm@supplychain.com.mx` (Memo) marcado `can_distribute_tasks = true`.
- [ ] (Opcional) `VITE_ALMACEN_RECEPTOR_EMAIL` configurada si difiere del default
- [ ] `OPENROUTER_API_KEY` configurada (rotada) + `openrouter-vision` desplegada
- [ ] **Resend: dominio `supplychain.com.mx` verificado + `FROM_EMAIL` seteado** (§4)
