import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { extractItemsFromWorkbook, parseDeliveryNoteLines } from './sheetParser'

describe('sheetParser — CSV serializado de LINET (; europeo)', () => {
  // Replica ExpSN_*.csv: ; como separador, SKU en "Model number", nombre en
  // "Product descr.", 1 fila por serial, pcs "1,000" (que SheetJS lee como 1000).
  const csv = [
    'Sales Order number;Customer PO;Delivery Note number;Reference No.;Model number;Product descr.;Serial number;End of warranty;pcs',
    '20067522;18265201;30191411;;1GE412055-2313;Eleganza 4 With scales;20260170423;00.00.0000;1,000',
    '20067522;18265201;30191411;;1GE412055-2313;Eleganza 4 With scales;20260170420;00.00.0000;1,000',
    '20067522;18265201;30191411;;1GE412055-2313;Eleganza 4 With scales;20260170419;00.00.0000;1,000',
  ].join('\n')

  it('agrupa por SKU, qty = # de seriales (no 1000), y toma el código no el nombre', () => {
    const wb = XLSX.read(new TextEncoder().encode(csv), { type: 'array' })
    const { items } = extractItemsFromWorkbook(wb)
    expect(items).toHaveLength(1)
    expect(items[0].sku).toBe('1GE412055-2313')          // Model number, NO "Eleganza..."
    expect(items[0].qty).toBe(3)                          // 3 seriales = 3 (no 3000)
    expect(items[0].serialNumber).toBe('20260170423, 20260170420, 20260170419')
  })

  it('nunca toma la columna de nombre (Product descr.) como SKU', () => {
    const wb = XLSX.read(new TextEncoder().encode(csv), { type: 'array' })
    const { items } = extractItemsFromWorkbook(wb)
    expect(items.some(i => i.sku.includes('ELEGANZA'))).toBe(false)
  })
})

describe('sheetParser — Excel PackingList de LINET (header en fila 4)', () => {
  const aoa = [
    ['', '', '', '', '', 'Packing list'],
    [], [], [],
    ['Vehicle order No.', 'Contract', 'Delivery note', 'Order Number of colli', 'Position in contract', 'Product number', 'Item Qty', 'Product name', 'Pcs in colli'],
    ['1/1', '18265201', '', '1 - 3', 50, '1K40B611-336', 9, 'TOM2 without scales', 3],
    ['', '', '', 4, 50, '1K40B611-336', 1, 'TOM2 without scales', 1],
    ['', '', '', '', 60, '4PPLI1100AS', 9, 'Passive mattress EffectaCare', 3],
  ]

  it('detecta header no-primera-fila, SKU=Product number, qty=Item Qty agrupado', () => {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PackingList')
    const { items } = extractItemsFromWorkbook(wb)
    const bySku = Object.fromEntries(items.map(i => [i.sku, i.qty]))
    expect(bySku['1K40B611-336']).toBe(10)   // 9 + 1 agrupado
    expect(bySku['4PPLI1100AS']).toBe(9)
    // No usa "Product name" como SKU
    expect(items.some(i => i.sku.includes('TOM2WITHOUT'))).toBe(false)
  })
})

describe('parseDeliveryNoteLines — Delivery Note LINET (PDF digital, sin modelo)', () => {
  // Líneas reales del ExpDL_0030191411.pdf (como las da el extractor de texto del PDF).
  const lines = [
    'Item Material Description Customer Article Details Customer Article Code Quantity',
    '10 1GE412055-2313 Eleganza 4 With scales 36.00 PC',
    'Serial no 20260170423, 20260170420, 20260170419,',
    '20260170453, 20260170430, 20260170435',
    '20 4PW171100LS Passive mattress ViskoMatt 10, 208 x 86, 36.00 PC',
    '30 4PV340290000 Telescopic aluminium IV pole 36.00 PC',
    '40 11028700B0000 One piece of independent holder for fixa 72.00 PC',
    '140 2G0PACK100004 Packing 9.00 PC',
    '190 2M1600000000 Sea packing for mattress 1.00 PC',
  ]

  it('extrae los 6 SKUs con sus cantidades (código, no nombre)', () => {
    const items = parseDeliveryNoteLines(lines)
    const bySku = Object.fromEntries(items.map(i => [i.sku, i.qty]))
    expect(bySku).toEqual({
      '1GE412055-2313': 36,
      '4PW171100LS': 36,
      '4PV340290000': 36,
      '11028700B0000': 72,
      '2G0PACK100004': 9,
      '2M1600000000': 1,
    })
  })

  it('adjunta los seriales al SKU correcto', () => {
    const items = parseDeliveryNoteLines(lines)
    const bed = items.find(i => i.sku === '1GE412055-2313')!
    expect(bed.serialNumber).toContain('20260170423')
    expect(bed.serialNumber!.split(', ').length).toBe(6)
  })

  it('NO matchea formatos sin unidad "PC" (iFIT/Garrido) — sin regresión', () => {
    const ifit = ['1-6 NTEL16825 ELLIPTICALS NORDICTRACK 9506910030 6 101.60 609.62 .503 3.0']
    const garrido = ['GA-47V OAK SAND BATHROOM CABINET 54 54 44 2376 88*55*58 15.12']
    expect(parseDeliveryNoteLines(ifit)).toEqual([])
    expect(parseDeliveryNoteLines(garrido)).toEqual([])
  })
})
