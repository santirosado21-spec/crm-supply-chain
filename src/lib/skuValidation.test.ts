import { describe, it, expect } from 'vitest'
import { isValidSku, normalizeSKU, findPartialSkuCandidates, classifySku } from './skuValidation'

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
    '1GE412055-2313', '1K40B611-336', '12BD30301-475', '1F22227-356',             // LINET / Wibo
    '4PW171100LS', '4PV340290000', '11028700B0000', '2G0PACK100004',              // LINET / Wibo
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

  it('normalizeSKU unifica variantes de guion (– — − ‐) a hyphen ASCII', () => {
    expect(normalizeSKU('NTL49926–1')).toBe('NTL49926-1')  // en-dash
    expect(normalizeSKU('NTL49926—1')).toBe('NTL49926-1')  // em-dash
    expect(normalizeSKU('NTL49926−1')).toBe('NTL49926-1')  // minus sign
    expect(normalizeSKU('NTL49926‐1')).toBe('NTL49926-1')  // hyphen U+2010
  })
})

describe('findPartialSkuCandidates — coincidencias parciales (NTL49926-1 ⊂ NTL49926-1000)', () => {
  const catalog = ['NTL49926-1000', 'NTEL16825', 'NTL49926-1500', 'GA-SP-S-9127']

  it('encuentra el candidato cuando el doc es prefijo del registrado', () => {
    expect(findPartialSkuCandidates('NTL49926-1', catalog)).toContain('NTL49926-1000')
  })

  it('lista TODOS los candidatos cuando hay varios (requiere elegir)', () => {
    const c = findPartialSkuCandidates('NTL49926-1', catalog)
    expect(c).toEqual(expect.arrayContaining(['NTL49926-1000', 'NTL49926-1500']))
    expect(c.length).toBeGreaterThanOrEqual(2)
  })

  it('no devuelve candidatos para SKUs sin relación', () => {
    expect(findPartialSkuCandidates('PFTL90924', catalog)).toEqual([])
  })

  it('ignora SKUs demasiado cortos para evitar ruido', () => {
    expect(findPartialSkuCandidates('NT', catalog)).toEqual([])
  })
})

describe('classifySku — clasificación de un SKU contra el catálogo de Extensiv', () => {
  const catalog = ['NTL49926-1000', 'PFTL90924', 'ABC-123']

  it('exact → registrado, sin candidatos', () => {
    expect(classifySku('PFTL90924', catalog)).toEqual({ match: 'exact', candidates: [], registered: true })
  })

  it('partial → candidatos, NO registrado (NTL49926-1 ⊂ NTL49926-1000)', () => {
    const r = classifySku('NTL49926-1', catalog)
    expect(r.match).toBe('partial')
    expect(r.registered).toBe(false)
    expect(r.candidates).toContain('NTL49926-1000')
  })

  it('none → sin coincidencia ni candidatos (por dar de alta)', () => {
    expect(classifySku('ZZZ-999', catalog)).toEqual({ match: 'none', candidates: [], registered: false })
  })

  it('usa el Set provisto cuando se pasa (evita reconstruirlo)', () => {
    const set = new Set(catalog)
    expect(classifySku('ABC-123', catalog, set).registered).toBe(true)
  })
})
