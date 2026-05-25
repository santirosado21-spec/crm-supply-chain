# BLOCKERS — Sprint Almacén + Task Tracker + Pizarrón

## Estado: SIN BLOQUEOS QUE DETUVIERAN LA EJECUCIÓN

Las Fases 2–5 se ejecutaron completas. Hubo un bloqueo de entorno (no de código)
que se resolvió con un workaround; se documenta abajo.

## ⚠️ Bloqueo de entorno — macOS revocó acceso al repo en ~/Desktop

Durante la sesión, macOS (TCC / Privacy & Security) revocó el acceso de lectura
a archivos dentro de `~/Desktop/CRM SUPPLY CHAIN DEFINITIVO/crm-supply-chain/`.
Síntoma: todo `cat`/`open()`/`git` sobre el repo fallaba con
`Operation not permitted`, incluso con el sandbox deshabilitado. No es un
problema de código — es permiso del sistema operativo.

### Workaround aplicado
Se clonó el repo desde GitHub a una ubicación accesible (`~/crm-sprint-work`),
se ejecutó todo el sprint ahí, y se hicieron commit + push a
`feat/almacen-pizarron`. El resultado está en el remoto.

### ACCIÓN REQUERIDA DEL USUARIO (importante)
El working tree de `~/Desktop/.../crm-supply-chain` quedó con un estado
intermedio roto de un intento previo. Para sincronizar con el trabajo real:

1. Conceder **Full Disk Access** a la terminal en
   System Settings → Privacy & Security → Full Disk Access, y reiniciar la sesión.
2. En el repo de Desktop:
   ```bash
   git fetch origin
   git reset --hard origin/feat/almacen-pizarron
   ```
3. Recomendado a futuro: mover el repo fuera de `~/Desktop` (p. ej. `~/dev/`)
   para que TCC no vuelva a interferir.

## Codex CLI

`which codex` OK (instalado). Se optó por construir directamente con Claude
para garantizar coherencia de tipos entre fases interdependientes y porque el
entorno ya estaba degradado por el bloqueo de TCC. Decisión de eficiencia, no
bloqueo.

## Migraciones

Ver `MIGRATIONS_PENDING.md` — 2 migraciones nuevas quedan pendientes de aplicar
(el clon de trabajo no está vinculado al proyecto Supabase). No bloqueante para
el código; sí necesario antes de usar Distribución y Pizarrón en producción.
