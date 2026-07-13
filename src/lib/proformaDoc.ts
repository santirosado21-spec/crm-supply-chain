/**
 * Helpers puros para los exports profesionales de la Proforma (Excel + PDF),
 * siguiendo el formato de la plantilla real del negocio
 * ("Proforma_LRM_Jan_26_Professional"): portada con tabla agregada por
 * concepto (Cantidad | Descripción | Costo Unitario | Costo Total), hoja de
 * Servicios de Transporte y desgloses.
 *
 * Sin dependencias impuras (ni exceljs ni jspdf) — testeable en Node.
 */
import type { ProformaLineaPreview } from './proformaBuilder'

/** Datos del emisor para el encabezado del documento (valores de la plantilla real). */
export const EMISOR_DEFAULT = {
  razonSocial: 'Supply Chain Consulting',
  direccion1:  'Presidente Miguel Alemán Valdez 904, desp 201',
  direccion2:  'Nápoles, Benito Juárez, Ciudad de México. C.P. 03180',
  rfc:         'SCC1202278VA',
}

export interface ConceptoAgregado {
  descripcion:   string
  cantidad:      number
  /** null cuando las líneas agrupadas tienen precios distintos (ej. paquetería). */
  costoUnitario: number | null
  costoTotal:    number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Agrupa las líneas INCLUIDAS para la tabla de la portada, igual que la
 * plantilla ("Almacenaje", "Entradas", "Salidas", "Envíos por paquetería"...):
 * - WMS: agrupa por (concepto, precioUnitario) sumando cantidades y montos.
 * - Paquetería: una sola línea "Envíos por paquetería" (cantidad = # guías).
 * - Flete: una sola línea "Servicios de transporte" (cantidad = # viajes) —
 *   el detalle viaje por viaje vive en la hoja/sección "Servicios Transporte".
 */
export function aggregateConceptos(lineas: ProformaLineaPreview[]): ConceptoAgregado[] {
  const incluidas = lineas.filter(l => l.incluida)
  const out: ConceptoAgregado[] = []

  const wmsMap = new Map<string, ConceptoAgregado>()
  for (const l of incluidas.filter(l => l.seccion === 'wms')) {
    const key = `${l.concepto}::${l.precioUnitario ?? ''}`
    const agg = wmsMap.get(key) ?? { descripcion: l.concepto, cantidad: 0, costoUnitario: l.precioUnitario, costoTotal: 0 }
    agg.cantidad = round2(agg.cantidad + l.cantidad)
    agg.costoTotal = round2(agg.costoTotal + l.monto)
    wmsMap.set(key, agg)
  }
  out.push(...wmsMap.values())

  const fletes = incluidas.filter(l => l.seccion === 'flete')
  if (fletes.length > 0) {
    out.push({
      descripcion:   'Servicios de transporte',
      cantidad:      fletes.length,
      costoUnitario: null,
      costoTotal:    round2(fletes.reduce((s, l) => s + l.monto, 0)),
    })
  }

  const guias = incluidas.filter(l => l.seccion === 'paqueteria')
  if (guias.length > 0) {
    out.push({
      descripcion:   'Envíos por paquetería',
      cantidad:      guias.length,
      costoUnitario: null,
      costoTotal:    round2(guias.reduce((s, l) => s + l.monto, 0)),
    })
  }

  return out
}

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** "01 al 31 de Julio de 2026" — formato del campo Fecha de la plantilla. */
export function formatPeriodoLargo(desdeISO: string, hastaISO: string): string {
  const [y1, m1, d1] = desdeISO.split('-').map(Number)
  const [y2, m2, d2] = hastaISO.split('-').map(Number)
  const dd1 = String(d1).padStart(2, '0')
  const dd2 = String(d2).padStart(2, '0')
  if (y1 === y2 && m1 === m2) {
    return `${dd1} al ${dd2} de ${MESES_ES[m1 - 1]} de ${y1}`
  }
  if (y1 === y2) {
    return `${dd1} de ${MESES_ES[m1 - 1]} al ${dd2} de ${MESES_ES[m2 - 1]} de ${y1}`
  }
  return `${dd1} de ${MESES_ES[m1 - 1]} de ${y1} al ${dd2} de ${MESES_ES[m2 - 1]} de ${y2}`
}

export interface ViajeExportRow {
  refInterna: string
  fecha:      string
  refCliente: string
  origen:     string
  destino:    string
  costo:      number
}

export interface GuiaExportRow {
  paqueteria: string
  tracking:   string
  fecha:      string
  referencia: string
  precio:     number
}

const FLETE_CONCEPTO_RE = /^Flete propio:\s*(.+?)\s*→\s*(.+)$/
const GUIA_CONCEPTO_RE  = /^Paquetería\s+(\S+):\s*(.+)$/

/**
 * Filas para la hoja/sección "Servicios Transporte". Usa los campos
 * estructurados cuando existen (export desde preview fresco); si no (re-export
 * desde historial, donde las líneas guardadas solo traen concepto/referencia),
 * parsea origen/destino del concepto "Flete propio: X → Y".
 */
export function viajesExportRows(lineas: ProformaLineaPreview[]): ViajeExportRow[] {
  return lineas
    .filter(l => l.seccion === 'flete' && l.incluida)
    .map(l => {
      const m = FLETE_CONCEPTO_RE.exec(l.concepto)
      return {
        refInterna: l.referencia ?? '—',
        fecha:      l.fecha ?? '',
        refCliente: l.extensivTransactionId ?? l.referencia ?? '',
        origen:     l.viajeOrigen ?? m?.[1] ?? '',
        destino:    l.viajeDestino ?? m?.[2] ?? '',
        costo:      l.monto,
      }
    })
}

/** Filas para la hoja/sección "Paqueterías" (mismo fallback de parseo que viajes). */
export function guiasExportRows(lineas: ProformaLineaPreview[]): GuiaExportRow[] {
  return lineas
    .filter(l => l.seccion === 'paqueteria' && l.incluida)
    .map(l => {
      const m = GUIA_CONCEPTO_RE.exec(l.concepto)
      return {
        paqueteria: (l.paqueteria ?? m?.[1] ?? '').toUpperCase(),
        tracking:   l.referencia ?? m?.[2] ?? '—',
        fecha:      l.fecha ?? '',
        referencia: l.extensivTransactionId ?? '',
        precio:     l.monto,
      }
    })
}

/** Etiqueta explícita de la retención — quien aprueba debe saber qué es y de dónde sale. */
export function retencionLabel(subtotalFlete: number, moneda: string): string {
  const monto = subtotalFlete.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  return `Retención IVA 4% (autotransporte de carga, sobre $${monto} ${moneda} de flete)`
}
