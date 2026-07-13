import { describe, it, expect } from 'vitest'
import { aggregateConceptos, formatPeriodoLargo, viajesExportRows, guiasExportRows, retencionLabel } from './proformaDoc'
import type { ProformaLineaPreview } from './proformaBuilder'

function linea(overrides: Partial<ProformaLineaPreview>): ProformaLineaPreview {
  return {
    seccion: 'wms', fuente: 'csv_extensiv', fuenteId: null, referencia: 'SO001', concepto: 'Cargo',
    cantidad: 1, precioUnitario: 10, monto: 10, moneda: 'MXN', incluida: true, motivoExclusion: null,
    extensivTransactionId: null, extensivChargeLabel: null, rawCsvRow: null,
    ...overrides,
  }
}

describe('aggregateConceptos — tabla agregada de la portada', () => {
  it('agrupa líneas WMS con mismo concepto y precio unitario (suma cantidades y montos)', () => {
    const out = aggregateConceptos([
      linea({ concepto: 'Salida Por Caja', precioUnitario: 10, cantidad: 26, monto: 260 }),
      linea({ concepto: 'Salida Por Caja', precioUnitario: 10, cantidad: 15, monto: 150 }),
      linea({ concepto: 'Picking por Caja', precioUnitario: 5.5, cantidad: 10, monto: 55 }),
    ])
    expect(out).toHaveLength(2)
    const salida = out.find(c => c.descripcion === 'Salida Por Caja')!
    expect(salida.cantidad).toBe(41)
    expect(salida.costoUnitario).toBe(10)
    expect(salida.costoTotal).toBe(410)
  })

  it('mismo concepto con precio distinto queda en líneas separadas (cambio de tarifa)', () => {
    const out = aggregateConceptos([
      linea({ concepto: 'Salida Por Caja', precioUnitario: 10, cantidad: 5, monto: 50 }),
      linea({ concepto: 'Salida Por Caja', precioUnitario: 12, cantidad: 5, monto: 60 }),
    ])
    expect(out).toHaveLength(2)
  })

  it('excluye las líneas con incluida=false', () => {
    const out = aggregateConceptos([
      linea({ concepto: 'Salida', cantidad: 5, monto: 50 }),
      linea({ concepto: 'Salida', cantidad: 3, monto: 30, incluida: false }),
    ])
    expect(out[0].cantidad).toBe(5)
    expect(out[0].costoTotal).toBe(50)
  })

  it('flete → una línea "Servicios de transporte"; paquetería → "Envíos por paquetería"', () => {
    const out = aggregateConceptos([
      linea({ seccion: 'flete', fuente: 'viaje', concepto: 'Flete propio: CDMX → MTY', monto: 5000, precioUnitario: 5000 }),
      linea({ seccion: 'flete', fuente: 'viaje', concepto: 'Flete propio: Lerma → QRO', monto: 3000, precioUnitario: 3000 }),
      linea({ seccion: 'paqueteria', fuente: 'guia_paqueteria', concepto: 'Paquetería fedex: T1', monto: 350, precioUnitario: 350 }),
    ])
    const flete = out.find(c => c.descripcion === 'Servicios de transporte')!
    expect(flete.cantidad).toBe(2)
    expect(flete.costoTotal).toBe(8000)
    expect(flete.costoUnitario).toBeNull()
    const paq = out.find(c => c.descripcion === 'Envíos por paquetería')!
    expect(paq.cantidad).toBe(1)
    expect(paq.costoTotal).toBe(350)
  })

  it('sin flete ni paquetería no agrega esas líneas', () => {
    const out = aggregateConceptos([linea({})])
    expect(out.some(c => c.descripcion === 'Servicios de transporte')).toBe(false)
    expect(out.some(c => c.descripcion === 'Envíos por paquetería')).toBe(false)
  })
})

describe('formatPeriodoLargo', () => {
  it('mismo mes: "01 al 31 de Julio de 2026"', () => {
    expect(formatPeriodoLargo('2026-07-01', '2026-07-31')).toBe('01 al 31 de Julio de 2026')
  })
  it('meses distintos mismo año', () => {
    expect(formatPeriodoLargo('2026-06-15', '2026-07-13')).toBe('15 de Junio al 13 de Julio de 2026')
  })
  it('años distintos', () => {
    expect(formatPeriodoLargo('2025-12-20', '2026-01-05')).toBe('20 de Diciembre de 2025 al 05 de Enero de 2026')
  })
})

describe('viajesExportRows', () => {
  it('usa los campos estructurados cuando existen', () => {
    const rows = viajesExportRows([
      linea({ seccion: 'flete', fuente: 'viaje', referencia: 'REF-01', concepto: 'Flete propio: CDMX → Monterrey', monto: 5000, fecha: '2026-07-13', viajeOrigen: 'CDMX', viajeDestino: 'Monterrey' }),
    ])
    expect(rows[0]).toMatchObject({ refInterna: 'REF-01', origen: 'CDMX', destino: 'Monterrey', costo: 5000, fecha: '2026-07-13' })
  })

  it('re-export desde historial: parsea origen/destino del concepto', () => {
    const rows = viajesExportRows([
      linea({ seccion: 'flete', fuente: 'viaje', referencia: 'REF-02', concepto: 'Flete propio: Lerma → Querétaro', monto: 3000 }),
    ])
    expect(rows[0].origen).toBe('Lerma')
    expect(rows[0].destino).toBe('Querétaro')
  })

  it('ignora líneas de flete excluidas', () => {
    expect(viajesExportRows([
      linea({ seccion: 'flete', fuente: 'viaje', concepto: 'Flete propio: A → B', incluida: false }),
    ])).toHaveLength(0)
  })
})

describe('guiasExportRows', () => {
  it('usa paqueteria estructurada o la parsea del concepto', () => {
    const rows = guiasExportRows([
      linea({ seccion: 'paqueteria', fuente: 'guia_paqueteria', referencia: 'TRACK-1', concepto: 'Paquetería fedex: TRACK-1', monto: 350, paqueteria: 'fedex', fecha: '2026-07-13' }),
      linea({ seccion: 'paqueteria', fuente: 'guia_paqueteria', referencia: 'TRACK-2', concepto: 'Paquetería dhl: TRACK-2', monto: 300 }),
    ])
    expect(rows[0].paqueteria).toBe('FEDEX')
    expect(rows[1].paqueteria).toBe('DHL')
    expect(rows[1].tracking).toBe('TRACK-2')
  })
})

describe('retencionLabel', () => {
  it('incluye el monto base y la explicación completa', () => {
    const label = retencionLabel(8000, 'MXN')
    expect(label).toContain('Retención IVA 4%')
    expect(label).toContain('autotransporte de carga')
    expect(label).toContain('$8,000.00 MXN')
  })
})
