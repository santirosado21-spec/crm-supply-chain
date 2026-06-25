import { describe, it, expect } from 'vitest'
import { isValidSku, normalizeSKU } from './skuValidation'

describe('isValidSku — guardarraíl contra palabras sueltas como SKU', () => {
  // Casos reportados en producción: NUNCA deben aceptarse como SKU.
  const garbage = ['fecha', 'FECHA', 'total', 'TOTAL', 'shipped', 'SHIPPED', 'lerma', 'LERMA',
    'date', 'booking', 'invoice', 'quantity', 'cantidad', 'pcs', 'ctn', 'kgs', 'product',
    'description', 'descripcion', 'serial', 'mexico', 'usa', 'gross', 'net', 'weight',
    'Total Qty', 'TOTAL G.W.', 'UNIT G.W.', 'Cu Meter', 'Tariff code']
  it.each(garbage)('rechaza "%s"', (w) => {
    expect(isValidSku(w)).toBe(false)
  })

  // SKUs reales de los clientes: deben aceptarse.
  const valid = [
    'NTEL16825', 'NTL49926-1', 'PFTL90924', 'NTEXTDF25',         // iFIT / NordicTrack
    'GA-47V OAK SAND', 'GA-341 VINTAGE BROWN', 'GA-SP-S-9127', 'GA-SP-S9127NEGRA', // Garrido
    'ASPT-SL-ALLXN-13', 'OP-HAA', 'HS-OB-1004-01', 'IC-LFICGIC5-01', 'LBR-DB',     // Life Fitness
    'LOG-MOU-MX3S-NEG',                                          // ejemplo del usuario
  ]
  it.each(valid)('acepta "%s"', (s) => {
    expect(isValidSku(s)).toBe(true)
  })

  it('acepta SKUs sin dígitos pero con separador (OP-HAA, HS-BC)', () => {
    expect(isValidSku('OP-HAA')).toBe(true)
    expect(isValidSku('HS-BC')).toBe(true)
  })

  it('rechaza palabras puras sin dígito ni separador', () => {
    expect(isValidSku('TREADMILL')).toBe(false)
    expect(isValidSku('BATHROOM')).toBe(false)
  })

  it('normalizeSKU + isValidSku coherentes con SKU con espacios', () => {
    const n = normalizeSKU('GA-47V OAK SAND') // quita espacios → GA-47VOAKSAND
    expect(n).toBe('GA-47VOAKSAND')
    expect(isValidSku(n)).toBe(true)
  })
})
