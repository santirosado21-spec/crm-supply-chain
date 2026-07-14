/**
 * Armado de la Proforma consolidada: WMS (CSV Extensiv Billing Manager) +
 * Flete propio (viajes) + Paquetería (guias_paqueteria) para un cliente.
 *
 * `buildProformaPreview` es puro (sin Supabase) y testeable — recibe ya los
 * datos crudos (CSV parseado + viajes + guías del cliente/periodo) y arma las
 * 3 secciones con dedupe. `assembleProformaData` es la capa fina que sí toca
 * Supabase: trae viajes/guías pendientes de facturar del cliente en el rango
 * de fechas y las claves de líneas CSV ya facturadas en una proforma anterior
 * no cancelada del mismo cliente, y delega el armado al builder puro.
 */
import { supabase } from './supabase'
import {
  type ExtensivBillingRow, filterByCustomerName, dedupeKey, normalizeReference, matchesTrackingNumber,
} from './extensivBillingParser'
import type { ViajeEstado } from '../types/tms'

export type ProformaSeccion = 'wms' | 'flete' | 'paqueteria'
export type ProformaFuente  = 'csv_extensiv' | 'viaje' | 'guia_paqueteria'
export type Moneda          = 'MXN' | 'USD'

/**
 * Estados de viaje que entran a la proforma. Incluye 'confirmado': un viaje
 * confirmado desde el Cotizador (con cliente + referencia) ya se toma en cuenta
 * en la proforma del cliente de inmediato, sin esperar a marcarlo Completado.
 * Se excluyen pendiente/asignado/en_transito/cancelado para no facturar por error.
 */
export const VIAJE_ESTADOS_FACTURABLES: ViajeEstado[] = ['confirmado', 'completado', 'entregado']

export interface ProformaLineaPreview {
  seccion:                 ProformaSeccion
  fuente:                  ProformaFuente
  fuenteId:                string | null
  referencia:               string | null
  concepto:                 string
  cantidad:                 number
  precioUnitario:           number | null
  monto:                    number
  moneda:                   Moneda
  incluida:                 boolean
  /** Por qué quedó excluida por default (se puede re-incluir a mano en el preview). */
  motivoExclusion:          string | null
  extensivTransactionId:    string | null
  extensivChargeLabel:      string | null
  rawCsvRow:                ExtensivBillingRow | null
  // Campos estructurados para los exports (hoja "Servicios Transporte" /
  // "Paqueterías") — evitan parsear el concepto. Solo presentes al generar
  // desde datos frescos; en re-export desde historial se parsean del concepto.
  fecha?:                   string | null
  viajeOrigen?:             string
  viajeDestino?:            string
  paqueteria?:              string
}

/**
 * Retención de IVA del 4% sobre servicios de autotransporte terrestre de carga
 * (regla mexicana) — aplica solo al subtotal de flete propio, nunca a WMS ni
 * paquetería. Se muestra desglosada en preview/exports para que quien apruebe
 * la proforma sepa exactamente de dónde sale. Total = subtotal + IVA − retención.
 */
export const RETENCION_FLETE_PCT = 4

export interface ProformaPreview {
  lineas:              ProformaLineaPreview[]
  subtotalWms:         number
  subtotalFlete:       number
  subtotalPaqueteria:  number
  subtotal:            number
  ivaPct:              number
  ivaMonto:            number
  /** 4 si hay flete propio en la proforma, 0 si no. */
  retencionPct:        number
  /** RETENCION_FLETE_PCT % del subtotal de flete propio. */
  retencionMonto:      number
  total:               number
  moneda:              Moneda
}

export interface ViajeParaProforma {
  id:                    string
  origen:                string   // ciudad de origen del viaje
  destino:               string
  fechaProgramada:       string | null
  ingresoCliente:        number
  referenciaOrigen:      'extensiv' | 'manual' | null
  extensivTransactionId: string | null
  referenciaManual:      string | null
}

export interface GuiaParaProforma {
  id:                    string
  paqueteria:            string
  trackingNumber:        string
  precio:                number
  fecha:                 string
  origen:                'extensiv' | 'manual'
  extensivTransactionId: string | null
  manualReference:       string | null
}

export interface BuildProformaPreviewParams {
  clienteNombre:              string
  csvRows:                    ExtensivBillingRow[]
  viajes:                     ViajeParaProforma[]
  guias:                      GuiaParaProforma[]
  /** dedupeKey() de líneas csv_extensiv ya guardadas en una proforma anterior no cancelada de este cliente. */
  csvDedupeKeysYaFacturados:  Set<string>
  moneda?:                    Moneda
  ivaPct?:                    number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Recalcula subtotales/IVA/total a partir de las líneas (solo `incluida=true`
 * cuentan). Exportada para que la UI la reuse al togglear el checkbox de una
 * línea en el preview, sin tener que re-armar todo desde el CSV/DB de nuevo.
 */
export function computeProformaTotals(lineas: ProformaLineaPreview[], ivaPct: number, moneda: Moneda): ProformaPreview {
  const sumaIncluida = (seccion: ProformaSeccion) =>
    round2(lineas.filter(l => l.seccion === seccion && l.incluida).reduce((s, l) => s + l.monto, 0))

  const subtotalWms        = sumaIncluida('wms')
  const subtotalFlete      = sumaIncluida('flete')
  const subtotalPaqueteria = sumaIncluida('paqueteria')
  const subtotal           = round2(subtotalWms + subtotalFlete + subtotalPaqueteria)
  const ivaMonto           = round2(subtotal * ivaPct / 100)
  const retencionMonto     = round2(subtotalFlete * RETENCION_FLETE_PCT / 100)
  const retencionPct       = subtotalFlete > 0 ? RETENCION_FLETE_PCT : 0
  const total              = round2(subtotal + ivaMonto - retencionMonto)

  return { lineas, subtotalWms, subtotalFlete, subtotalPaqueteria, subtotal, ivaPct, ivaMonto, retencionPct, retencionMonto, total, moneda }
}

export function buildProformaPreview(params: BuildProformaPreviewParams): ProformaPreview {
  const moneda = params.moneda ?? 'MXN'
  const ivaPct = params.ivaPct ?? 16

  const csvFiltradas = filterByCustomerName(params.csvRows, params.clienteNombre)

  // Referencias de las filas CSV que SÍ quedan incluidas — usadas para excluir
  // por cruce un viaje/guía cuyo flete ya viniera facturado dentro del CSV
  // (caso raro hoy, pero el CSV de Extensiv podría llegar a incluir
  // ThirdPartyFreight en el futuro — ver PENDIENTES.md).
  const referenciasCsvIncluidas = new Set<string>()

  const lineasWms: ProformaLineaPreview[] = csvFiltradas.map(row => {
    const key = dedupeKey(row)
    const yaFacturada = params.csvDedupeKeysYaFacturados.has(key)
    if (!yaFacturada) {
      for (const ref of [row.outboundReferenceNumber, row.inboundReferenceNumber, row.transactionId, row.trackingNumber, row.poNumber]) {
        const n = normalizeReference(ref)
        if (n) referenciasCsvIncluidas.add(n)
      }
    }
    return {
      seccion:               'wms',
      fuente:                'csv_extensiv',
      fuenteId:              null,
      referencia:            row.outboundReferenceNumber || row.inboundReferenceNumber || null,
      concepto:              row.chargeLabel || row.category || 'Cargo WMS Extensiv',
      cantidad:              row.quantity,
      precioUnitario:        row.chargePerUnit,
      monto:                 row.total,
      moneda,
      incluida:              !yaFacturada,
      motivoExclusion:       yaFacturada ? 'Ya facturado en una proforma anterior' : null,
      extensivTransactionId: row.transactionId || null,
      extensivChargeLabel:   row.chargeLabel || null,
      rawCsvRow:             row,
    }
  })

  const lineasFlete: ProformaLineaPreview[] = params.viajes.map(v => {
    const referenciaViaje = v.extensivTransactionId || v.referenciaManual || null
    const yaEnCsv = referenciaViaje != null && referenciasCsvIncluidas.has(normalizeReference(referenciaViaje))
    return {
      seccion:               'flete',
      fuente:                'viaje',
      fuenteId:              v.id,
      referencia:            referenciaViaje,
      concepto:              `Flete propio: ${v.origen} → ${v.destino}`,
      cantidad:              1,
      precioUnitario:        v.ingresoCliente,
      monto:                 v.ingresoCliente,
      moneda,
      incluida:              !yaEnCsv,
      motivoExclusion:       yaEnCsv ? 'Referencia ya incluida en el CSV de Extensiv' : null,
      extensivTransactionId: v.extensivTransactionId,
      extensivChargeLabel:   null,
      rawCsvRow:             null,
      fecha:                 v.fechaProgramada,
      viajeOrigen:           v.origen,
      viajeDestino:          v.destino,
    }
  })

  const lineasPaqueteria: ProformaLineaPreview[] = params.guias.map(g => {
    const referenciaGuia = g.extensivTransactionId || g.manualReference || null
    const yaEnCsv =
      (referenciaGuia != null && referenciasCsvIncluidas.has(normalizeReference(referenciaGuia))) ||
      referenciasCsvIncluidas.has(normalizeReference(g.trackingNumber)) ||
      csvFiltradas.some(row => matchesTrackingNumber(row, g.trackingNumber))
    return {
      seccion:               'paqueteria',
      fuente:                'guia_paqueteria',
      fuenteId:              g.id,
      referencia:            g.trackingNumber || referenciaGuia,
      concepto:              `Paquetería ${g.paqueteria}: ${g.trackingNumber}`,
      cantidad:              1,
      precioUnitario:        g.precio,
      monto:                 g.precio,
      moneda,
      incluida:              !yaEnCsv,
      motivoExclusion:       yaEnCsv ? 'Tracking ya incluido en el CSV de Extensiv' : null,
      extensivTransactionId: g.extensivTransactionId,
      extensivChargeLabel:   null,
      rawCsvRow:             null,
      fecha:                 g.fecha,
      paqueteria:            g.paqueteria,
    }
  })

  const lineas = [...lineasWms, ...lineasFlete, ...lineasPaqueteria]
  return computeProformaTotals(lineas, ivaPct, moneda)
}

export interface AssembleProformaDataParams {
  clienteId:      string
  clienteNombre:  string
  periodoDesde:   string // YYYY-MM-DD
  periodoHasta:   string // YYYY-MM-DD
  csvRows:        ExtensivBillingRow[]
  moneda?:        Moneda
  ivaPct?:        number
}

/** Capa con Supabase: trae viajes/guías pendientes + dedupe de proformas previas, delega al builder puro. */
export async function assembleProformaData(params: AssembleProformaDataParams): Promise<ProformaPreview> {
  const { clienteId, periodoDesde, periodoHasta } = params

  const [viajesRes, guiasRes, lineasPreviasRes] = await Promise.all([
    supabase
      .from('viajes')
      .select('id, origen, destino, fecha_programada, ingreso_cliente, referencia_origen, extensiv_transaction_id, referencia_manual')
      .eq('cliente_id', clienteId)
      .in('estado', VIAJE_ESTADOS_FACTURABLES)
      .is('facturado_en_proforma_id', null)
      .gte('fecha_programada', periodoDesde)
      .lte('fecha_programada', periodoHasta),
    supabase
      .from('guias_paqueteria')
      .select('id, paqueteria, tracking_number, precio, fecha, origen, extensiv_transaction_id, manual_reference')
      .eq('cliente_id', clienteId)
      .is('facturado_en_proforma_id', null)
      .gte('fecha', periodoDesde)
      .lte('fecha', periodoHasta),
    supabase
      .from('proforma_periodo_lineas')
      .select('extensiv_transaction_id, extensiv_charge_label, proformas_periodo!inner(cliente_id, estado)')
      .eq('fuente', 'csv_extensiv')
      .eq('proformas_periodo.cliente_id', clienteId)
      .neq('proformas_periodo.estado', 'cancelada'),
  ])

  if (viajesRes.error) throw viajesRes.error
  if (guiasRes.error) throw guiasRes.error
  if (lineasPreviasRes.error) throw lineasPreviasRes.error

  const viajes: ViajeParaProforma[] = (viajesRes.data ?? []).map(v => ({
    id:                    v.id,
    origen:                v.origen,
    destino:               v.destino,
    fechaProgramada:       v.fecha_programada,
    ingresoCliente:        Number(v.ingreso_cliente) || 0,
    referenciaOrigen:      v.referencia_origen as 'extensiv' | 'manual' | null,
    extensivTransactionId: v.extensiv_transaction_id,
    referenciaManual:      v.referencia_manual,
  }))

  const guias: GuiaParaProforma[] = (guiasRes.data ?? []).map(g => ({
    id:                    g.id,
    paqueteria:            g.paqueteria,
    trackingNumber:        g.tracking_number,
    precio:                Number(g.precio) || 0,
    fecha:                 g.fecha,
    origen:                g.origen as 'extensiv' | 'manual',
    extensivTransactionId: g.extensiv_transaction_id,
    manualReference:       g.manual_reference,
  }))

  const csvDedupeKeysYaFacturados = new Set<string>(
    (lineasPreviasRes.data ?? [])
      .filter((l): l is typeof l & { extensiv_transaction_id: string; extensiv_charge_label: string } =>
        !!l.extensiv_transaction_id && !!l.extensiv_charge_label)
      .map(l => dedupeKey({ transactionId: l.extensiv_transaction_id, chargeLabel: l.extensiv_charge_label })),
  )

  return buildProformaPreview({
    clienteNombre: params.clienteNombre,
    csvRows: params.csvRows,
    viajes,
    guias,
    csvDedupeKeysYaFacturados,
    moneda: params.moneda,
    ivaPct: params.ivaPct,
  })
}
