/**
 * Extracción de campos de una guía de paquetería (Estafeta/UPS/FedEx/DHL/Castores
 * o generada en Tecship) a partir de las filas de texto posicional de un PDF
 * (`PDFRow[]`, ver `ptParser.ts`) — puro, sin pdfjs, testeable en Node con
 * arrays sintéticos (mismo patrón que `sheetParser.ts`).
 *
 * IMPORTANTE — diseño best-effort sin muestra real: al momento de escribir esto
 * no había ningún PDF real de guía de paquetería disponible para calibrar los
 * patrones (se buscó explícitamente en el repo). Los regex de abajo están
 * basados en el vocabulario más común de guías/labels (tracking, peso, destino)
 * y MUY PROBABLEMENTE necesiten ajuste en cuanto se pruebe con una guía real —
 * por eso cada resultado conserva `rawText`/`rows` (para depurar) y `fechaRaw`
 * (para ver si la heurística DD/MM vs MM/DD se equivocó), y nunca lanza: un
 * campo no encontrado siempre queda `null`, jamás bloquea la captura manual.
 */
import type { PDFRow } from './ptParser'
import type { Paqueteria } from '../types/guias'

export interface GuiaPdfExtraction {
  paqueteria:     Paqueteria | null
  trackingNumber: string | null
  /** Normalizada YYYY-MM-DD (best-effort). */
  fecha:          string | null
  /** Texto tal cual apareció en el PDF — para verificar si la heurística de fecha se equivocó. */
  fechaRaw:       string | null
  /** Bonus — texto crudo, sin normalizar unidad. */
  peso:           string | null
  /** Bonus. */
  destino:        string | null
  /** Texto completo concatenado — debug futuro cuando algo no se detecte. */
  rawText:        string
  /** Filas crudas — permite ajustar regex sin re-parsear el PDF. */
  rows:           PDFRow[]
  warnings:       string[]
}

export function emptyExtraction(rows: PDFRow[], warning?: string): GuiaPdfExtraction {
  return {
    paqueteria: null, trackingNumber: null, fecha: null, fechaRaw: null,
    peso: null, destino: null, rawText: '', rows,
    warnings: warning ? [warning] : [],
  }
}

// Únicos 5 valores que acepta el CHECK constraint de guias_paqueteria.paqueteria
// (20260506000004_guias_paqueteria_carriers.sql) — "Tecship" NO es un carrier
// válido, es la plataforma que genera la guía, así que nunca se asigna aquí.
const CARRIER_PATTERNS: Array<{ paqueteria: Paqueteria; re: RegExp }> = [
  { paqueteria: 'estafeta', re: /\bESTAFETA\b/i },
  { paqueteria: 'ups',      re: /\bUPS\b/i },
  { paqueteria: 'fedex',    re: /\bFED\s*-?\s*EX\b/i },
  { paqueteria: 'dhl',      re: /\bDHL\b/i },
  { paqueteria: 'castores', re: /\bCASTORES\b/i },
]

function detectPaqueteria(text: string): Paqueteria | null {
  for (const { paqueteria, re } of CARRIER_PATTERNS) {
    if (re.test(text)) return paqueteria
  }
  return null
}

const TRACKING_KEYWORD_RE  = /(?:tracking(?:\s*number)?|no\.?\s*de\s*gu[ií]a|gu[ií]a\s*#|waybill|awb|n[uú]mero\s*de\s*gu[ií]a)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,24})/i
const TRACKING_UPS_RE      = /\b(1Z[0-9A-Z]{16})\b/i
const TRACKING_FALLBACK_RE = /\b([A-Z0-9]{8,22})\b/g

function detectTracking(text: string): string | null {
  const byKeyword = TRACKING_KEYWORD_RE.exec(text)
  if (byKeyword) return byKeyword[1].toUpperCase()

  const ups = TRACKING_UPS_RE.exec(text)
  if (ups) return ups[1].toUpperCase()

  // Fallback: token alfanumérico aislado. Se exige al menos un dígito —
  // verificado con un PDF real (Pick Ticket sin guía) que sin este filtro
  // tomaba palabras normales en mayúsculas (ej. "DESCRIPCI[ÓN]") como si
  // fueran tracking number. Se descarta también si es puramente numérico de
  // 10 dígitos (probable teléfono).
  let m: RegExpExecArray | null
  TRACKING_FALLBACK_RE.lastIndex = 0
  while ((m = TRACKING_FALLBACK_RE.exec(text)) !== null) {
    const token = m[1]
    const hasDigit = /\d/.test(token)
    const isPhoneLike = /^\d{10}$/.test(token)
    if (hasDigit && !isPhoneLike) return token.toUpperCase()
  }
  return null
}

const FECHA_ISO_RE   = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/
const FECHA_SLASH_RE = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/

const pad2 = (n: number) => String(n).padStart(2, '0')

function detectFecha(text: string): { fecha: string | null; fechaRaw: string | null } {
  const iso = FECHA_ISO_RE.exec(text)
  if (iso) {
    const [raw, y, mo, d] = iso
    return { fecha: `${y}-${pad2(Number(mo))}-${pad2(Number(d))}`, fechaRaw: raw }
  }

  const slash = FECHA_SLASH_RE.exec(text)
  if (slash) {
    const [raw, g1, g2, g3] = slash
    let day = Number(g1)
    let month = Number(g2)
    // Heurística MX (DD/MM) por default; si el "mes" es imposible (>12) pero
    // el "día" sí podría ser mes (<=12), asumimos que en realidad es MM/DD.
    if (month > 12 && day <= 12) { const tmp = day; day = month; month = tmp }
    if (month < 1 || month > 12 || day < 1 || day > 31) return { fecha: null, fechaRaw: raw }
    const year = g3.length === 2 ? 2000 + Number(g3) : Number(g3)
    return { fecha: `${year}-${pad2(month)}-${pad2(day)}`, fechaRaw: raw }
  }

  return { fecha: null, fechaRaw: null }
}

const PESO_RE    = /(?:peso|weight)\s*[:#]?\s*([\d.,]+\s?(?:kgs?|lbs?)?)/i
const DESTINO_RE = /(?:destino|ship\s*to|entregar\s*a|deliver\s*to|consignee)\s*[:#]?\s*(.{3,60})/i

function detectByKeyword(text: string, re: RegExp): string | null {
  const m = re.exec(text)
  return m ? m[1].trim() : null
}

export function extractGuiaFieldsFromRows(rows: PDFRow[]): GuiaPdfExtraction {
  try {
    const rawText = rows.map(r => r.map(i => i.text).join(' ')).join('\n')
    const { fecha, fechaRaw } = detectFecha(rawText)
    const warnings: string[] = []
    const paqueteria = detectPaqueteria(rawText)
    const trackingNumber = detectTracking(rawText)
    if (!paqueteria) warnings.push('No se detectó paquetería/carrier en el PDF')
    if (!trackingNumber) warnings.push('No se detectó tracking number en el PDF')

    return {
      paqueteria,
      trackingNumber,
      fecha,
      fechaRaw,
      peso: detectByKeyword(rawText, PESO_RE),
      destino: detectByKeyword(rawText, DESTINO_RE),
      rawText,
      rows,
      warnings,
    }
  } catch (e) {
    return emptyExtraction(rows, e instanceof Error ? e.message : 'Error al interpretar el PDF')
  }
}
