# SECRETS_PENDING — Sprint Almacén + Task Tracker + Pizarrón

Este sprint **no introduce credenciales ni API keys nuevas**. Solo quedan dos
tareas de configuración manual (no son secretos, pero requieren acción humana).

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

## Estado

- [ ] Migración `20260521000001` aplicada
- [ ] Seed de `team_members` ejecutado
- [ ] (Opcional) `VITE_ALMACEN_RECEPTOR_EMAIL` configurada si difiere del default
