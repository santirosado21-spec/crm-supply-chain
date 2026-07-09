import { describe, it, expect } from 'vitest'
import {
  readExtensivBillingWorkbook, parseExtensivBillingCSV, filterByCustomerName,
  dedupeKey, stripFormulaWrapper, matchesTrackingNumber,
} from './extensivBillingParser'

// Filas reales tomadas del export del Billing Manager de Extensiv
// ("Wed Jul 08 2026 17_12_56 GMT+0000 (Coordinated Universal Time).csv"),
// más una fila sintética de otro cliente para probar el filtro.
const HEADER =
  '"Customer Name","Rate ID","Invoice Number","Warehouse ID","Warehouse Name","Transaction ID","GL Account","Transaction Type","Category","Charge Type","Charge Label","Memo","Counting Unit","Counting Method","Quantity","Charge Per Unit","Total","Status","Created Date","Inbound Reference Number","Outbound Reference Number","Tracking Number","SKU","Weight","BOL Number","PO Number","Lot Number","Serial Number","MU Label","Storage UoM","Inventory UoM","Trailer Number","Confirm Date","Location Name","Class","itemDescription","unitDescription"'

const ROWS = [
  '"Toughbuilt","5f8e98f9-8562-41a1-b47a-0f06458adc2d","",1,"Supply Chain Mexico",275622,"","Shipping","handling","SystemGenerated","Salida Por Caja  Touhbuilt","","packagingunits","",26,10,260,"notReviewed","07/06/2026","",="SO001660",="S03290750-2",="TB-CT-34-2BSP","","","6799643833","","","","","","","07/03/2026","","","",""',
  '"Toughbuilt","18d376fe-80c0-40a8-afc8-2b75026afbbb","",1,"Supply Chain Mexico",275622,"","Shipping","handling","SystemGenerated","Picking por Caja ToughBuilt","","packagingunits","",4,5.5,22,"notReviewed","07/06/2026","",="SO001660",="S03290750-2",="TB-CT-20-LX-2BSP","","","6799643833","","","","","","","07/03/2026","","","",""',
  '"Toughbuilt","5f8e98f9-8562-41a1-b47a-0f06458adc2d","",1,"Supply Chain Mexico",275620,"","Shipping","handling","SystemGenerated","Salida Por Caja  Touhbuilt","","packagingunits","",47,10,470,"notReviewed","07/06/2026","",="SO001659",="S03290750-1",="TB-CT-36-L6-2BSP","","","6799645566","","","","","","","07/03/2026","","","",""',
  '"Toughbuilt","e771b79e-284e-4c20-bd62-a4d78ddecea7","",1,"Supply Chain Mexico",276324,"","Shipping","handling","SystemGenerated","Procesamiento de Orden ToughBuilt","","transaction","",1,12,12,"notReviewed","07/06/2026","",="SO001664",="030588990361170A01N60F","","","","2333022831","","","","","","","07/03/2026","","","",""',
  '"OtroCliente","aaaa","",1,"Supply Chain Mexico",999001,"","Shipping","handling","SystemGenerated","Salida Por Caja","","packagingunits","",1,50,50,"notReviewed","07/06/2026","",="SO009999","","","","","","","","","","07/03/2026","","","",""',
]

const CSV = [HEADER, ...ROWS].join('\n')

function parse() {
  const wb = readExtensivBillingWorkbook(new TextEncoder().encode(CSV))
  return parseExtensivBillingCSV(wb)
}

describe('extensivBillingParser — CSV real del Billing Manager de Extensiv', () => {
  it('parsea las 5 filas con los campos esperados', () => {
    const rows = parse()
    expect(rows).toHaveLength(5)
    expect(rows[0].customerName).toBe('Toughbuilt')
    expect(rows[0].chargeLabel).toBe('Salida Por Caja  Touhbuilt')
    expect(rows[0].category).toBe('handling')
  })

  it('des-envuelve el wrapper de fórmula ="..." en las columnas de referencia', () => {
    const rows = parse()
    expect(rows[0].outboundReferenceNumber).toBe('SO001660')
    expect(rows[0].inboundReferenceNumber).toBe('')
  })

  it('fuerza a string las columnas numéricas de referencia (Transaction ID)', () => {
    const rows = parse()
    expect(rows[0].transactionId).toBe('275622')
  })

  it('el valor con forma de tracking de carrier cae en PO Number, no en Tracking Number — matchesTrackingNumber revisa ambas', () => {
    const rows = parse()
    expect(rows[0].trackingNumber).toBe('S03290750-2')
    expect(rows[0].poNumber).toBe('6799643833')
    expect(matchesTrackingNumber(rows[0], '6799643833')).toBe(true)
    expect(matchesTrackingNumber(rows[0], 'S03290750-2')).toBe(true)
    expect(matchesTrackingNumber(rows[0], 'no-existe')).toBe(false)
  })

  it('calcula quantity/chargePerUnit/total como number, Quantity × Charge Per Unit = Total', () => {
    const rows = parse()
    const salida = rows[0]
    expect(salida.quantity).toBe(26)
    expect(salida.chargePerUnit).toBe(10)
    expect(salida.total).toBe(260)
    expect(salida.quantity * salida.chargePerUnit).toBeCloseTo(salida.total, 2)
  })

  it('lee Created Date / Confirm Date como texto plano (readExtensivBillingWorkbook evita el bug del serial de Excel)', () => {
    const rows = parse()
    expect(rows[0].createdDate).toBe('07/06/2026')
    expect(rows[0].confirmDate).toBe('07/03/2026')
  })

  it('filterByCustomerName solo deja las filas de Toughbuilt, excluye OtroCliente', () => {
    const rows = filterByCustomerName(parse(), 'Toughbuilt')
    expect(rows).toHaveLength(4)
    expect(rows.every(r => r.customerName === 'Toughbuilt')).toBe(true)
  })

  it('filterByCustomerName es case-insensitive y tolera espacios', () => {
    const rows = filterByCustomerName(parse(), '  toughbuilt  ')
    expect(rows).toHaveLength(4)
  })

  it('dedupeKey agrupa Salida+Picking del mismo Transaction ID (275622) bajo distinta clave por Charge Label', () => {
    const rows = parse()
    const salida275622  = rows.find(r => r.transactionId === '275622' && r.chargeLabel.startsWith('Salida'))!
    const picking275622 = rows.find(r => r.transactionId === '275622' && r.chargeLabel.startsWith('Picking'))!
    expect(dedupeKey(salida275622)).not.toBe(dedupeKey(picking275622))
    expect(dedupeKey(salida275622)).toBe(dedupeKey(salida275622)) // estable
  })

  it('stripFormulaWrapper limpia ="X" y deja texto plano intacto', () => {
    expect(stripFormulaWrapper('="SO001660"')).toBe('SO001660')
    expect(stripFormulaWrapper('SO001660')).toBe('SO001660')
    expect(stripFormulaWrapper('')).toBe('')
  })
})
