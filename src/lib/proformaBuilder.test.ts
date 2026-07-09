import { describe, it, expect } from 'vitest'
import { buildProformaPreview, type ViajeParaProforma, type GuiaParaProforma } from './proformaBuilder'
import { dedupeKey, type ExtensivBillingRow } from './extensivBillingParser'

function csvRow(overrides: Partial<ExtensivBillingRow> = {}): ExtensivBillingRow {
  return {
    customerName: 'Toughbuilt', rateId: '', invoiceNumber: '', warehouseId: '1', warehouseName: 'Supply Chain Mexico',
    transactionId: '275622', glAccount: '', transactionType: 'Shipping', category: 'handling',
    chargeType: 'SystemGenerated', chargeLabel: 'Salida Por Caja', memo: '', countingUnit: 'packagingunits',
    countingMethod: '', quantity: 26, chargePerUnit: 10, total: 260, status: 'notReviewed', createdDate: '07/06/2026',
    inboundReferenceNumber: '', outboundReferenceNumber: 'SO001660', trackingNumber: 'S03290750-2', sku: 'TB-CT-34-2BSP',
    weight: '', bolNumber: '', poNumber: '6799643833', lotNumber: '', serialNumber: '', muLabel: '', storageUoM: '',
    inventoryUoM: '', trailerNumber: '', confirmDate: '07/03/2026', locationName: '', class: '', itemDescription: '',
    unitDescription: '',
    ...overrides,
  }
}

function viaje(overrides: Partial<ViajeParaProforma> = {}): ViajeParaProforma {
  return {
    id: 'v1', origen: 'CDMX', destino: 'Monterrey', fechaProgramada: '2026-07-05',
    ingresoCliente: 5000, referenciaOrigen: 'manual', extensivTransactionId: null, referenciaManual: 'FLETE-001',
    ...overrides,
  }
}

function guia(overrides: Partial<GuiaParaProforma> = {}): GuiaParaProforma {
  return {
    id: 'g1', paqueteria: 'fedex', trackingNumber: '999888777', precio: 350, fecha: '2026-07-05',
    origen: 'manual', extensivTransactionId: null, manualReference: 'GUIA-001',
    ...overrides,
  }
}

describe('buildProformaPreview', () => {
  it('arma las 3 secciones y calcula subtotales + IVA + total', () => {
    const preview = buildProformaPreview({
      clienteNombre: 'Toughbuilt',
      csvRows: [csvRow()],
      viajes: [viaje()],
      guias: [guia()],
      csvDedupeKeysYaFacturados: new Set(),
    })

    expect(preview.subtotalWms).toBe(260)
    expect(preview.subtotalFlete).toBe(5000)
    expect(preview.subtotalPaqueteria).toBe(350)
    expect(preview.subtotal).toBe(5610)
    expect(preview.ivaPct).toBe(16)
    expect(preview.ivaMonto).toBeCloseTo(5610 * 0.16, 2)
    expect(preview.total).toBeCloseTo(5610 * 1.16, 2)
    expect(preview.lineas).toHaveLength(3)
    expect(preview.lineas.every(l => l.incluida)).toBe(true)
  })

  it('filtra el CSV solo al cliente elegido (trae de TODOS los clientes)', () => {
    const preview = buildProformaPreview({
      clienteNombre: 'Toughbuilt',
      csvRows: [csvRow(), csvRow({ customerName: 'OtroCliente', total: 999 })],
      viajes: [],
      guias: [],
      csvDedupeKeysYaFacturados: new Set(),
    })
    expect(preview.lineas.filter(l => l.seccion === 'wms')).toHaveLength(1)
    expect(preview.subtotalWms).toBe(260)
  })

  it('excluye una línea CSV ya facturada en una proforma anterior (dedupeKey)', () => {
    const row = csvRow()
    const preview = buildProformaPreview({
      clienteNombre: 'Toughbuilt',
      csvRows: [row],
      viajes: [],
      guias: [],
      csvDedupeKeysYaFacturados: new Set([dedupeKey(row)]),
    })
    expect(preview.lineas[0].incluida).toBe(false)
    expect(preview.lineas[0].motivoExclusion).toMatch(/ya facturado/i)
    expect(preview.subtotalWms).toBe(0)
  })

  it('un mismo Transaction ID con distinto Charge Label NO se excluye entre sí (dedupe por ambos)', () => {
    const salida  = csvRow({ chargeLabel: 'Salida Por Caja', total: 260 })
    const picking = csvRow({ chargeLabel: 'Picking por Caja', total: 22 })
    const preview = buildProformaPreview({
      clienteNombre: 'Toughbuilt',
      csvRows: [salida, picking],
      viajes: [],
      guias: [],
      csvDedupeKeysYaFacturados: new Set([dedupeKey(salida)]), // solo Salida ya facturada
    })
    const lineaSalida  = preview.lineas.find(l => l.concepto === 'Salida Por Caja')!
    const lineaPicking = preview.lineas.find(l => l.concepto === 'Picking por Caja')!
    expect(lineaSalida.incluida).toBe(false)
    expect(lineaPicking.incluida).toBe(true)
    expect(preview.subtotalWms).toBe(22)
  })

  it('excluye un viaje si su referencia manual ya está cubierta por una fila incluida del CSV', () => {
    const row = csvRow({ outboundReferenceNumber: 'FLETE-001' })
    const preview = buildProformaPreview({
      clienteNombre: 'Toughbuilt',
      csvRows: [row],
      viajes: [viaje({ referenciaManual: 'FLETE-001' })],
      guias: [],
      csvDedupeKeysYaFacturados: new Set(),
    })
    const lineaViaje = preview.lineas.find(l => l.fuente === 'viaje')!
    expect(lineaViaje.incluida).toBe(false)
    expect(preview.subtotalFlete).toBe(0)
  })

  it('excluye una guía si su tracking coincide con Tracking Number O PO Number del CSV', () => {
    const rowPoNumber = csvRow({ poNumber: '999888777', trackingNumber: 'otro-valor' })
    const preview = buildProformaPreview({
      clienteNombre: 'Toughbuilt',
      csvRows: [rowPoNumber],
      viajes: [],
      guias: [guia({ trackingNumber: '999888777' })],
      csvDedupeKeysYaFacturados: new Set(),
    })
    const lineaGuia = preview.lineas.find(l => l.fuente === 'guia_paqueteria')!
    expect(lineaGuia.incluida).toBe(false)
  })

  it('una guía sin coincidencia en el CSV se incluye normalmente', () => {
    const preview = buildProformaPreview({
      clienteNombre: 'Toughbuilt',
      csvRows: [csvRow()],
      viajes: [],
      guias: [guia({ trackingNumber: 'sin-relacion' })],
      csvDedupeKeysYaFacturados: new Set(),
    })
    const lineaGuia = preview.lineas.find(l => l.fuente === 'guia_paqueteria')!
    expect(lineaGuia.incluida).toBe(true)
    expect(preview.subtotalPaqueteria).toBe(350)
  })

  it('respeta moneda e IVA custom', () => {
    const preview = buildProformaPreview({
      clienteNombre: 'Toughbuilt',
      csvRows: [csvRow()],
      viajes: [],
      guias: [],
      csvDedupeKeysYaFacturados: new Set(),
      moneda: 'USD',
      ivaPct: 0,
    })
    expect(preview.moneda).toBe('USD')
    expect(preview.lineas[0].moneda).toBe('USD')
    expect(preview.ivaMonto).toBe(0)
    expect(preview.total).toBe(preview.subtotal)
  })
})
