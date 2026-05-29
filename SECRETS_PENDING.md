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

## Estado

- [ ] Migración `20260521000001` aplicada
- [ ] Seed de `team_members` ejecutado
- [ ] (Opcional) `VITE_ALMACEN_RECEPTOR_EMAIL` configurada si difiere del default
- [ ] `OPENROUTER_API_KEY` configurada (rotada) + `openrouter-vision` desplegada
