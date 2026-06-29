import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { extractItemsFromWorkbook } from './sheetParser'

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
