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

## 5. Extensiv — habilitar escritura para el alta de SKUs (Paso 1) ⚠️ PENDIENTE

La feature "Dar de alta SKU en Extensiv" (Paso 1 del wizard de Entradas) hace
`POST /customers/{id}/items` vía el proxy. Está **apagada por defecto** detrás de
dos flags + una dependencia externa:

1. **Proxy (Supabase secret):** habilita la allowlist de escritura del
   `extensiv-proxy` (`supabase/functions/extensiv-proxy/index.ts`):

   ```bash
   supabase secrets set EXTENSIV_WRITE_ENABLED=true
   supabase functions deploy extensiv-proxy
   ```

2. **UI (Vercel env + `.env` local):** muestra el botón "Dar de alta":

   ```
   VITE_EXTENSIV_WRITE_ENABLED=true
   ```

3. **Confirmar con Extensiv (contacto: John / api@extensiv.com) ANTES de activar
   en prod:**
   - Ruta/método exactos del endpoint de creación de item (hipótesis:
     `POST /customers/{id}/items`, espejo del GET que ya usamos).
   - Nombres/estructura exactos de los campos del body (hoy best-effort en
     `buildCreateItemPayload` de `src/lib/extensiv.ts`: `sku`, `description`,
     `unitOfMeasure`, `storageDimension{length,width,height}`, `weight`).
   - Que las credenciales OAuth (`EXTENSIV_CLIENT_*`) tengan **permiso de escritura**
     de items.

   El esquema exacto NO está en la documentación pública de Extensiv (gated). Si
   difiere, el único ajuste es el payload en `buildCreateItemPayload`.

> Requiere la migración `20260702000001_extensiv_item_log.sql` aplicada
> (ver `MIGRATIONS_PENDING.md §14`).

## Estado

- Extensiv alta de SKUs (§5) — estado 2026-07-02:
  - [x] Migración `extensiv_item_log` aplicada (MCP, prod `uifrgmiqpkbgyvzbcldn`)
  - [x] Proxy `extensiv-proxy` redeployado con la allowlist (v10, `verify_jwt=false`)
  - [x] Vercel env `VITE_EXTENSIV_WRITE_ENABLED=true` (production) — aplica al próximo build
  - [x] `.env` local con `VITE_EXTENSIV_WRITE_ENABLED=true`
  - [ ] **Secret Supabase `EXTENSIV_WRITE_ENABLED=true`** — falta (no había token/login local): `supabase login && supabase secrets set EXTENSIV_WRITE_ENABLED=true --project-ref uifrgmiqpkbgyvzbcldn`
  - [ ] **Deploy del frontend a prod** con la feature (el árbol local tiene cambios ajenos sin commitear — deployar la feature de forma limpia)
  - [ ] **Confirmar endpoint/campos/permiso con Extensiv** — borrador listo en `EXTENSIV_WRITE_API_QUESTIONS.md`
- [x] Migración `20260521000001` (task_distribution) aplicada — vía MCP, 2026-07-01
- [x] Cuenta receptora + distribuidores ya existen en prod (dominio real
  `@supplychain.com.mx`; el seed de §1 con `@supplychain.mx` quedó de ejemplo).
  `gluna.lrm@supplychain.com.mx` (Memo) marcado `can_distribute_tasks = true`.
- [ ] (Opcional) `VITE_ALMACEN_RECEPTOR_EMAIL` configurada si difiere del default
- [ ] `OPENROUTER_API_KEY` configurada (rotada) + `openrouter-vision` desplegada
- [ ] **Resend: dominio `supplychain.com.mx` verificado + `FROM_EMAIL` seteado** (§4)
- [ ] **Secrets del webhook de leads (landing page) — §5, ninguno configurado aún**

## 5. Webhook de intake de leads (landing page → CRM) ⚠️ PENDIENTE

Edge function `leads-intake-webhook` ya está **desplegada** (`verify_jwt=false`,
2026-07-03) pero sin sus secrets — hoy responde `503 LEADS_INTAKE_SECRET not
configured` a cualquier request. El proxy del lado de la landing
(`/Users/santiagorosado/Desktop/Landing Page mexico/api/lead-intake.js`) y el
cambio en `js/main.js` ya están en el repo de la landing, también sin sus env
vars de Vercel — hoy responde `503 Not configured` sin romper el formulario.

No pude configurar ninguno de los dos lados yo mismo: no hay MCP tool para
`supabase secrets set`, y el binario local de `supabase` CLI está roto (`Bad
CPU type in executable`). Pasos manuales:

1. **Generar un secret compartido** (uno solo, se usa igual en ambos lados):
   ```bash
   openssl rand -hex 32
   ```
2. **En Supabase (proyecto `uifrgmiqpkbgyvzbcldn`)** — Dashboard → Edge
   Functions → Secrets, o CLI si el binario funciona en otra máquina:
   ```bash
   supabase secrets set LEADS_INTAKE_SECRET=<el-secret-generado>
   supabase secrets set COMERCIAL_ALERT_EMAIL=<email-o-lista-a-notificar>
   ```
   `EDGE_SHARED_SECRET` ya existe (lo usa `notify-task-email`) — no hay que tocarlo.
3. **En Vercel, proyecto `supply-chain-mexico-web`** (repo `Landing Page mexico`)
   → Settings → Environment Variables:
   ```
   LEADS_INTAKE_SECRET=<el-mismo-secret-del-paso-1>
   CRM_LEADS_WEBHOOK_URL=https://uifrgmiqpkbgyvzbcldn.supabase.co/functions/v1/leads-intake-webhook
   ```
   Redeploy del sitio para que tomen efecto (env vars de Vercel no aplican en caliente).
4. **Nota Resend (ver §4):** aunque se configure `COMERCIAL_ALERT_EMAIL`, el correo
   de alerta de "nuevo lead" solo llegará de forma confiable si esa dirección es
   `santirosado21@gmail.com` — cualquier otra falla con 403 hasta verificar el
   dominio. El lead se guarda en el CRM de todas formas; solo el correo de aviso
   depende de esto.
5. **Verificar end-to-end:** llenar el formulario real en
   `https://supply-chain-mexico-web.vercel.app/` y confirmar que aparece un lead
   nuevo en `/comercial/leads/lista` con `canal = Landing page`.
