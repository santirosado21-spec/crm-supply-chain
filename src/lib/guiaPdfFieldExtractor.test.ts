import { describe, it, expect } from 'vitest'
import { extractGuiaFieldsFromRows } from './guiaPdfFieldExtractor'
import type { PDFRow } from './ptParser'

/** Construye una fila sintética de PDFRow a partir de textos (mismo shape que produce extractPDFGrid). */
function row(texts: string[], y = 100, page = 1): PDFRow {
  return texts.map((text, i) => ({ text, x: i * 50, y, page }))
}

describe('extractGuiaFieldsFromRows — detección de paquetería', () => {
  it.each([
    ['ESTAFETA', 'estafeta'],
    ['estafeta', 'estafeta'],
    ['UPS', 'ups'],
    ['FEDEX', 'fedex'],
    ['FED EX', 'fedex'],
    ['DHL', 'dhl'],
    ['CASTORES', 'castores'],
  ] as const)('detecta %s como %s', (keyword, expected) => {
    const rows = [row(['Guia de embarque', keyword, 'Tracking: ABC12345678'])]
    expect(extractGuiaFieldsFromRows(rows).paqueteria).toBe(expected)
  })

  it('"Tecship" solo (sin carrier real) no se asigna como paquetería — no es un valor válido', () => {
    const rows = [row(['Generado en Tecship', 'Tracking: ABC12345678'])]
    const result = extractGuiaFieldsFromRows(rows)
    expect(result.paqueteria).toBeNull()
    expect(result.warnings).toContain('No se detectó paquetería/carrier en el PDF')
  })

  it('"Tecship" + carrier real (UPS) en el mismo texto → gana el carrier concreto', () => {
    const rows = [row(['Generado en Tecship', 'Carrier: UPS'])]
    expect(extractGuiaFieldsFromRows(rows).paqueteria).toBe('ups')
  })
})

describe('extractGuiaFieldsFromRows — detección de tracking number', () => {
  it('vía keyword adyacente ("No. de guía:")', () => {
    const rows = [row(['No. de guía: 1234567890AB'])]
    expect(extractGuiaFieldsFromRows(rows).trackingNumber).toBe('1234567890AB')
  })

  it('vía keyword "Tracking Number"', () => {
    const rows = [row(['Tracking Number: XR-998877665'])]
    expect(extractGuiaFieldsFromRows(rows).trackingNumber).toBe('XR-998877665')
  })

  it('vía patrón distintivo UPS (1Z...) sin ninguna keyword', () => {
    const rows = [row(['Envio de paquete', '1Z999AA10123456784', 'Gracias por su preferencia'])]
    expect(extractGuiaFieldsFromRows(rows).trackingNumber).toBe('1Z999AA10123456784')
  })

  it('fallback: token alfanumérico aislado cuando no hay keyword ni prefijo UPS', () => {
    const rows = [row(['Guia', 'ABCDEFGH12345'])]
    expect(extractGuiaFieldsFromRows(rows).trackingNumber).toBe('ABCDEFGH12345')
  })

  it('el fallback descarta tokens puramente numéricos de 10 dígitos (probable teléfono)', () => {
    const rows = [row(['Contacto', '5512345678'])]
    expect(extractGuiaFieldsFromRows(rows).trackingNumber).toBeNull()
  })

  it('el fallback descarta palabras normales en mayúsculas sin ningún dígito (regresión: PDF real sin guía tomaba "DESCRIPCI" de "DESCRIPCIÓN" como tracking)', () => {
    const rows = [row(['Item', 'DESCRIPCION', 'Cantidad'])]
    expect(extractGuiaFieldsFromRows(rows).trackingNumber).toBeNull()
  })
})

describe('extractGuiaFieldsFromRows — detección de fecha', () => {
  it('formato ISO YYYY-MM-DD', () => {
    const result = extractGuiaFieldsFromRows([row(['Fecha: 2026-07-09'])])
    expect(result.fecha).toBe('2026-07-09')
    expect(result.fechaRaw).toBe('2026-07-09')
  })

  it('formato DD/MM/YYYY (default MX)', () => {
    const result = extractGuiaFieldsFromRows([row(['Fecha: 05/07/2026'])])
    expect(result.fecha).toBe('2026-07-05')
    expect(result.fechaRaw).toBe('05/07/2026')
  })

  it('caso ambiguo: "mes" imposible (>12) fuerza la heurística MM/DD', () => {
    // 13/07/2026 no puede ser DD=13/MM=07 al revés tampoco... aquí probamos 07/25/2026 (MM/DD explícito)
    const result = extractGuiaFieldsFromRows([row(['Fecha: 07/25/2026'])])
    expect(result.fecha).toBe('2026-07-25')
    expect(result.fechaRaw).toBe('07/25/2026')
  })

  it('sin fecha detectable → null, no lanza', () => {
    const result = extractGuiaFieldsFromRows([row(['Sin ninguna fecha aquí'])])
    expect(result.fecha).toBeNull()
    expect(result.fechaRaw).toBeNull()
  })
})

describe('extractGuiaFieldsFromRows — peso/destino (bonus, no bloqueantes)', () => {
  it('detecta peso y destino cuando están presentes', () => {
    const result = extractGuiaFieldsFromRows([row(['Peso: 12.5 kg', 'Destino: Monterrey NL'])])
    expect(result.peso).toBe('12.5 kg')
    expect(result.destino).toBe('Monterrey NL')
  })

  it('quedan null cuando no están presentes, sin afectar el resto de la extracción', () => {
    const result = extractGuiaFieldsFromRows([row(['UPS', 'Tracking: ABC1234567'])])
    expect(result.peso).toBeNull()
    expect(result.destino).toBeNull()
    expect(result.paqueteria).toBe('ups')
  })
})

describe('extractGuiaFieldsFromRows — tolerancia a fallos', () => {
  it('input vacío ([]) nunca lanza, regresa todo null', () => {
    const result = extractGuiaFieldsFromRows([])
    expect(result.paqueteria).toBeNull()
    expect(result.trackingNumber).toBeNull()
    expect(result.fecha).toBeNull()
    expect(result.rawText).toBe('')
    expect(result.rows).toEqual([])
  })

  it('texto basura / unicode raro nunca lanza', () => {
    const rows = [row(['😀🚚📦', '§±≈÷', ''])]
    expect(() => extractGuiaFieldsFromRows(rows)).not.toThrow()
  })

  it('expone rawText y rows para debug futuro', () => {
    const rows = [row(['UPS', 'Tracking: ABC1234567'])]
    const result = extractGuiaFieldsFromRows(rows)
    expect(result.rawText).toContain('UPS')
    expect(result.rows).toBe(rows)
  })
})
