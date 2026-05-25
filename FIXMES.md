# FIXMES — Sprint Almacén + Task Tracker + Pizarrón

## Estado: SIN FIXMES AUTÓNOMOS

No se insertaron marcadores `// FIXME-AUTONOMOUS` durante el sprint.

## Verificación

- `npx tsc -b --noEmit` — **limpio** (sin errores) tras cada fase.
- `npm run build` (Vite) — **exitoso**. Solo warnings pre-existentes de tamaño
  de chunk y de import dinámico/estático de `jspdf` (ajenos al sprint).
- `npx eslint` sobre los archivos nuevos — limpio. Se corrigió de paso un
  `no-useless-escape` pre-existente en `receiptExport.ts` (`[^\w\-]` → `[^\w-]`)
  al moverlo a `src/pages/almacen/`.

## Nota

El sprint se desarrolló en un clon de trabajo (ver `BLOCKERS.md`). El código
quedó verde en type-check y build de producción.
