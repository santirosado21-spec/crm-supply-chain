// Configuración del módulo Almacén.
//
// La cuenta "Almacén Receptor" recibe las tareas que SAC manda al área de
// almacén; los distribuidores las reparten desde /almacen/distribucion.
// Es un identificador de ruteo (no un secreto) — overridable por env var.
export const ALMACEN_RECEPTOR_EMAIL =
  import.meta.env.VITE_ALMACEN_RECEPTOR_EMAIL || 'almacen@supplychain.mx'
