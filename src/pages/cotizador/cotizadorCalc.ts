// ─────────────────────────────────────────────────────────────────────────────
// Cotizador de Fletes — Motor de Cálculo (puro, sin side-effects)
// v5.3 — markup formula, multi-stop, containers
// ─────────────────────────────────────────────────────────────────────────────
import {
  MARGENES_CLIENTE,
  PRECIO_COMBUSTIBLE,
  FIJOS_DIA,
  BONOS_DEFAULT,
  type Unidad,
} from './cotizadorConstants'

// ── Parada (multi-stop) ─────────────────────────────────────────────────────
export interface Parada {
  id: number
  nombre: string
  km: number
  casetas: number
  horas: number
  minutos: number
}

// ── Contenedor ──────────────────────────────────────────────────────────────
export interface Contenedor {
  cantidad: number
  tipo: string
}

// ── Maniobrista asignado al viaje ───────────────────────────────────────────
// Cada viaje puede llevar varios maniobristas (mezcla interno/externo).
export interface ManiobristaAsignado {
  id:        string
  nombre:    string
  esExterno: boolean
}

// Formatea una lista para mostrar en desglose / PDF / notas.
// Ej: "Juan (interno) + Pedro (externo)"
export function formatManiobristas(list: ManiobristaAsignado[]): string {
  if (!list || list.length === 0) return ''
  return list
    .filter(m => m.nombre.trim())
    .map(m => `${m.nombre.trim()} (${m.esExterno ? 'externo' : 'interno'})`)
    .join(' + ')
}

// ── Input types ───────────────────────────────────────────────────────────────
export interface CotizadorInput {
  // Route
  origen:        string
  destino:       string
  kmIda:         number
  casetasIda:    number
  casetasRegreso:number
  horasIda:      number
  minutosIda:    number
  viajeRedondo:  boolean

  // Multi-stop
  modoMultiparadas: boolean
  paradas:          Parada[]
  kmRegreso:        number
  casetasRegresoMulti: number
  horasRegreso:     number
  minutosRegreso:   number

  // Vehicle & client
  unidad:        Unidad
  tipoCliente:   string
  operador:      string
  cliente:       string

  // Referencias internas (opcionales) — se concatenan en viajes.notas al guardar
  referenciaExtensiv?: string
  referenciaSAC?:      string

  // Contenedores
  contenedores:      Contenedor[]
  descripcionCarga:  string

  // Optional: maniobra
  maniobrasHoras:   number
  maniobrasMinutos: number
  maniobraCosto:    number      // $/hr
  // Lista de maniobristas asignados (mezcla interno/externo). Reemplaza al
  // antiguo `maniobrista?: string` — el motor concatena los nombres para PDF.
  maniobristas?:    ManiobristaAsignado[]

  // Optional: bonos operador
  incluyeBonos:  boolean
  bonoSueldo:    number
  bonoKmCarga:   number
  bonoKmVacio:   number
  bonoComida:    number

  // Optional: viáticos extras (ad-hoc, sumados a los calculados por bonos)
  viaticosExtras?: number

  // Optional: dádiva — efectivo extra al operador (contingencia Guardia Nacional).
  // INTERNA: NO suma al costoTotal ni al precioFinal — sale del margen SCC.
  dadiva?: number

  // Optional: días especiales (number of days each type)
  dMatutino: number
  dNocturno: number
  dSabado:   number
  dDomingo:  number
  dFestivo:  number
}

// ── Result type ───────────────────────────────────────────────────────────────
export interface CotizadorResult {
  // Summary
  id:            number
  fecha:         string
  precioFinal:   number
  precioPorKm:   number
  ganancia:      number
  margenPct:     number         // 0-100
  dadiva:        number         // gasto interno (no en PDF cliente)
  gananciaNeta:  number         // ganancia - dadiva

  // Route
  kmTotal:       number
  dias:          number
  viajeRedondo:  boolean
  esMultiparadas: boolean
  paradas:       Parada[]

  // Breakdown
  litros:            number
  costoCombustible:  number
  casetas:           number
  depreciacion:      number
  gastosFijos:       number
  maniobra:          number
  maniobraDetalle:   { horas: number; minutos: number; costoPorHora: number }
  maniobristas:      ManiobristaAsignado[]                        // todos los asignados
  maniobrista?:      string                                       // string concatenado (PDF/notas)
  horasExtra:        number
  viaticos:          number                                       // total (auto + extras)
  viaticosExtras?:   number                                       // ad-hoc capturados a mano
  bonosBase:         number
  costoTotal:        number

  // Cargo
  contenedores:     Contenedor[]
  descripcionCarga: string

  // Carry-through for display
  origen:        string
  destino:       string
  cliente:       string
  operador:      string
  unidad:        Unidad
  tipoCliente:   string
  incluyeBonos:  boolean
  referenciaExtensiv?: string
  referenciaSAC?:      string
}

// ── Route data helper ───────────────────────────────────────────────────────
function getDatosRuta(inp: CotizadorInput) {
  if (inp.modoMultiparadas) {
    let totalKm = 0, totalCasetas = 0, totalMinutos = 0
    const destinos: string[] = []

    for (const p of inp.paradas) {
      totalKm += p.km || 0
      totalCasetas += p.casetas || 0
      totalMinutos += ((p.horas || 0) * 60) + (p.minutos || 0)
      if (p.nombre) destinos.push(p.nombre)
    }

    if (inp.viajeRedondo) {
      totalKm += inp.kmRegreso || 0
      totalCasetas += inp.casetasRegresoMulti || 0
      totalMinutos += ((inp.horasRegreso || 0) * 60) + (inp.minutosRegreso || 0)
    }

    return {
      km: totalKm,
      casetas: totalCasetas,
      horas: totalMinutos / 60,
      destino: destinos.join(' → '),
      esMultiparadas: true,
    }
  }

  const casetasTotal = inp.casetasIda + (inp.viajeRedondo ? inp.casetasRegreso : 0)
  const horasIda = inp.horasIda + inp.minutosIda / 60

  return {
    km: inp.viajeRedondo ? inp.kmIda * 2 : inp.kmIda,
    casetas: casetasTotal,
    horas: horasIda ? (horasIda * (inp.viajeRedondo ? 2 : 1)) : 0,
    destino: inp.destino,
    esMultiparadas: false,
  }
}

// ── Core calculation ──────────────────────────────────────────────────────────
export function calcularFlete(inp: CotizadorInput): CotizadorResult {
  const { unidad: u, viajeRedondo } = inp
  const ruta = getDatosRuta(inp)

  // ── km ──────────────────────────────────────────────────────────────────────
  let kmTotal: number, kmCarga: number, kmVacio: number

  if (inp.modoMultiparadas) {
    kmTotal = ruta.km
    kmCarga = ruta.km
    kmVacio = 0
  } else {
    kmTotal = viajeRedondo ? inp.kmIda * 2 : inp.kmIda
    kmCarga = inp.kmIda
    kmVacio = viajeRedondo ? inp.kmIda : 0
  }

  // ── time / days ─────────────────────────────────────────────────────────────
  const horasTotal = ruta.horas || kmTotal / 60
  const dias = Math.max(1, Math.ceil(horasTotal / 8))

  // ── combustible ─────────────────────────────────────────────────────────────
  const litros = (kmCarga / u.rendimiento) + (kmVacio / (u.rendimiento * 1.15))
  const costoCombustible = Math.round(litros * PRECIO_COMBUSTIBLE[u.combustible])

  // ── casetas ─────────────────────────────────────────────────────────────────
  const casetas = ruta.casetas

  // ── bonos operador ──────────────────────────────────────────────────────────
  let viaticos  = 0
  let bonosBase = 0
  if (inp.incluyeBonos) {
    viaticos  = (dias * 3 * inp.bonoComida) + (dias > 1 ? (dias - 1) * BONOS_DEFAULT.HOSPEDAJE : 0)
    bonosBase = (inp.bonoSueldo * dias) + (kmCarga * inp.bonoKmCarga) + (kmVacio * inp.bonoKmVacio)
  }
  // Viáticos extras ad-hoc se SUMAN sobre lo calculado (peajes adicionales,
  // gastos imprevistos, propinas en paso fronterizo, etc.)
  const viaticosExtras = Math.max(0, inp.viaticosExtras ?? 0)
  viaticos  = Math.round(viaticos + viaticosExtras)
  bonosBase = Math.round(bonosBase)

  // ── maniobra ────────────────────────────────────────────────────────────────
  const totalHorasManiobra = inp.maniobrasHoras + inp.maniobrasMinutos / 60
  const maniobra = Math.round(totalHorasManiobra * inp.maniobraCosto)

  // ── días especiales ─────────────────────────────────────────────────────────
  const horasExtra = Math.round(
    inp.dMatutino * 200 +
    inp.dNocturno * 200 +
    inp.dSabado   * 500 +
    inp.dDomingo  * 500 +
    inp.dFestivo  * 1_000,
  )

  // ── fijos + depreciación ────────────────────────────────────────────────────
  const depreciacion = Math.round(u.depreciacion * dias)
  const gastosFijos  = Math.round(FIJOS_DIA * dias)

  // ── totals (markup formula: precio = costo + costo×margen) ─────────────────
  const costoTotal = bonosBase + horasExtra + viaticos + costoCombustible +
                     casetas + depreciacion + gastosFijos + maniobra

  const margen      = MARGENES_CLIENTE[inp.tipoCliente] ?? 0.35
  const ganancia    = Math.round(costoTotal * margen)
  const precioFinal = Math.round(costoTotal + ganancia)
  const precioPorKm = kmTotal > 0 ? Math.round((precioFinal / kmTotal) * 100) / 100 : 0

  // Dádiva: gasto interno. Sale de la ganancia, no del precio al cliente.
  const dadiva = Math.max(0, Math.round(inp.dadiva ?? 0))
  const gananciaNeta = ganancia - dadiva

  return {
    id:           Date.now(),
    fecha:        new Date().toLocaleDateString('es-MX'),
    precioFinal,
    precioPorKm,
    ganancia,
    margenPct:    Math.round(margen * 100),
    dadiva,
    gananciaNeta,
    kmTotal,
    dias,
    viajeRedondo,
    esMultiparadas: ruta.esMultiparadas,
    paradas:       inp.modoMultiparadas ? [...inp.paradas] : [],
    litros:       Math.round(litros * 10) / 10,
    costoCombustible,
    casetas,
    depreciacion,
    gastosFijos,
    maniobra,
    maniobraDetalle: { horas: inp.maniobrasHoras, minutos: inp.maniobrasMinutos, costoPorHora: inp.maniobraCosto },
    maniobristas:   inp.maniobristas ?? [],
    maniobrista:    formatManiobristas(inp.maniobristas ?? []) || undefined,
    horasExtra,
    viaticos,
    viaticosExtras,
    bonosBase,
    costoTotal:   Math.round(costoTotal),
    contenedores:     inp.contenedores,
    descripcionCarga: inp.descripcionCarga,
    origen:       inp.origen,
    destino:      ruta.destino || inp.destino,
    cliente:      inp.cliente,
    operador:     inp.operador,
    unidad:       u,
    tipoCliente:  inp.tipoCliente,
    incluyeBonos: inp.incluyeBonos,
    referenciaExtensiv: inp.referenciaExtensiv?.trim() || undefined,
    referenciaSAC:      inp.referenciaSAC?.trim() || undefined,
  }
}
