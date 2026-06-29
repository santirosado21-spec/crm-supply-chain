/**
 * Parser de hojas (Excel / CSV) para notas de entrada — SIN pdfjs.
 *
 * Vive separado de ptParser.ts (que importa pdfjs y no corre en Node) para poder
 * testear esta lógica en Node/vitest. ptParser re-exporta lo necesario y delega
 * el caso no-PDF aquí.
 *
 * Detecta columnas por encabezado, agrupa por SKU y maneja listas serializadas
 * (1 fila por número de serie, p.ej. LINET/Wibo): cada fila con serial = 1 unidad.
 */
import * as XLSX from 'xlsx'
import { normalizeSKU, isValidSku, isEmptyLike } from './skuValidation'

/* ─── Tipos compartidos (definidos aquí; ptParser los re-exporta) ───────── */
export interface PTLineItem {
  sku:          string
  qty:          number
  serialNumber: string | null
}

export interface PTExtraction {
  ref:   string | null
  items: PTLineItem[]
  /** Total de unidades declarado en el documento (si está impreso), para auto-verificación. */
  documentTotalQty?: number | null
}

/* ─── Patrones de encabezado (compartidos con el parser de PDF) ─────────── */
export const SKU_HEADER_RE    = /sku|item|product|producto|material|article|articulo|art[ií]culo|style|n°\s*de\s*parte|no\.?\s*de\s*parte|c[oó]digo|parte|model(\s*#|\s*number|o)?/i
export const QTY_HEADER_RE    = /qty|cantidad|quantity|piezas|pzs|pcs|pieces|unidades|units|req|cant\b|unit\s*qty|item\s*qty/i
export const SERIAL_HEADER_RE = /serial\s*(number|#)?|n[°º]?\s*de\s*serie|n[uú]mero\s*de\s*serie|no\.?\s*de\s*serie/i
// Columnas de NOMBRE (descripción) — nunca son el SKU en hojas (CSV/Excel).
// Ej.: "Product descr.", "Product name", "Article Name", "Descripción".
export const NAME_HEADER_RE   = /descr|description|descripci[oó]n|nombre|\bname\b/i

/** Un encabezado es columna de SKU si parece SKU y NO es una columna de nombre. */
function isSkuHeader(h: string): boolean {
  return SKU_HEADER_RE.test(h) && !NAME_HEADER_RE.test(h)
}

export function normalizeSerial(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (isEmptyLike(s)) return null
  return s
}

/* ─── Detección de Ref# ─────────────────────────────────────────────────── */
export function detectRefFromExcel(wb: XLSX.WorkBook): string | null {
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return null
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  const topText = data.slice(0, 30)
    .map(r => (r || []).map(c => String(c ?? '')).join(' '))
    .join(' ')
  const patterns = [
    /#\s*de\s*(?:orden\s*de\s*venta|orden|venta)\s*:?\s*([A-Z0-9][\w-]*)/i,
    /\b(?:purchase\s*order|PO|P\.O\.)\s*#?\s*:?\s*([A-Z0-9][\w-]*)/i,
    /\b(?:orden|referencia|ref|folio)\s*#?\s*:?\s*([A-Z0-9][\w-]*)/i,
    /\bSO\s*([0-9]+)/i,
  ]
  for (const p of patterns) {
    const m = topText.match(p)
    // El candidato debe contener un dígito (evita capturar palabras como
    // "number"/"Position" de los encabezados).
    if (m && m[1] && /\d/.test(m[1])) {
      if (p.source.includes('SO') && !m[1].toUpperCase().startsWith('SO')) return 'SO' + m[1]
      return m[1].trim()
    }
  }
  return null
}

/* ─── Extracción de items (Excel/CSV) ───────────────────────────────────── */
export function extractItemsFromWorkbook(wb: XLSX.WorkBook): PTExtraction {
  const ref = detectRefFromExcel(wb)
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { ref, items: [] }

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  // Localiza la fila de encabezados (puede no ser la primera, p.ej. PackingList LINET).
  let skuCol = -1, qtyCol = -1, serialCol = -1, headerRow = -1
  for (let r = 0; r < data.length; r++) {
    const row = data[r]
    if (!row) continue
    let fSku = -1, fQty = -1, fSerial = -1
    for (let c = 0; c < row.length; c++) {
      const h = String(row[c] ?? '').toLowerCase()
      if (fSku === -1 && isSkuHeader(h))            fSku = c
      if (fQty === -1 && QTY_HEADER_RE.test(h))     fQty = c
      if (fSerial === -1 && SERIAL_HEADER_RE.test(h)) fSerial = c
    }
    if (fSku !== -1 && fQty !== -1) {
      skuCol = fSku; qtyCol = fQty; serialCol = fSerial; headerRow = r
      break
    }
  }
  if (headerRow === -1) return { ref, items: [] }

  // Agrupa por SKU: suma cantidades y concatena seriales (decisión del usuario).
  const agg = new Map<string, { sku: string; qty: number; serials: string[] }>()
  for (let r = headerRow + 1; r < data.length; r++) {
    const row = data[r]
    if (!row) continue
    const sku = normalizeSKU(row[skuCol])
    if (!sku || !isValidSku(sku)) continue

    const serial = serialCol >= 0 ? normalizeSerial(row[serialCol]) : null
    let rowQty: number
    if (serial) {
      // Fila serializada = 1 unidad. Evita el bug del "1,000" europeo (→1000).
      rowQty = 1
    } else {
      const raw = String(row[qtyCol] ?? '').replace(/[^\d.]/g, '')
      rowQty = raw ? (parseInt(raw, 10) || 0) : 0
    }
    if (rowQty <= 0) continue

    const e = agg.get(sku) ?? { sku, qty: 0, serials: [] }
    e.qty += rowQty
    if (serial) e.serials.push(serial)
    agg.set(sku, e)
  }

  const items: PTLineItem[] = Array.from(agg.values()).map(e => ({
    sku: e.sku,
    qty: e.qty,
    serialNumber: e.serials.length ? Array.from(new Set(e.serials)).join(', ') : null,
  }))
  return { ref, items }
}

/* ─── PDF tipo Delivery Note (líneas), p.ej. LINET ──────────────────────── */
// Cada renglón de item es: "<#pos> <CÓDIGO> <nombre…> <cant> PC".
// El SKU es el código tras el número de posición; la cantidad es el número justo
// antes de la unidad ("PC"/"PCS"/"EA"/"PZA"/"ST"/"UN"). Los seriales vienen en
// renglones "Serial no …" (que pueden continuar en renglones siguientes con solo
// números largos). Se agrupa por SKU. Es puro (sin pdfjs) → testeable en Node.
// El sufijo de unidad ("PC") evita falsos positivos con iFIT/Garrido/SO2554/Life Fitness.
const DN_ITEM_RE   = /^\s*\d{1,4}\s+(\S+)\s+.*?(\d+(?:[.,]\d+)?)\s*(?:PC|PCS|EA|PZA|ST|UN|UNIT)\b/i
const DN_SERIAL_RE = /serial\s*(?:no|number|#)?\.?\s*[:.]?\s*(.+)$/i

export function parseDeliveryNoteLines(lines: string[]): PTLineItem[] {
  const agg = new Map<string, { sku: string; qty: number; serials: string[] }>()
  let lastSku: string | null = null

  const pushSerials = (sku: string, text: string) => {
    const serials = text.split(/[\s,;]+/).map(s => s.trim()).filter(s => /^\d{6,}$/.test(s))
    if (serials.length) agg.get(sku)?.serials.push(...serials)
  }

  for (const raw of lines) {
    const line = (raw ?? '').trim()
    if (!line) continue

    // Renglón de seriales: "Serial no 2026…, 2026…".
    const sm = DN_SERIAL_RE.exec(line)
    if (sm && lastSku && /\d{6,}/.test(sm[1])) { pushSerials(lastSku, sm[1]); continue }
    // Continuación de seriales: renglón con solo números largos + comas.
    if (lastSku && /^[\d,\s]+$/.test(line) && /\d{6,}/.test(line)) { pushSerials(lastSku, line); continue }

    // Renglón de item con unidad "PC".
    const m = DN_ITEM_RE.exec(line)
    if (!m) continue
    const sku = normalizeSKU(m[1])
    if (!sku || !isValidSku(sku)) continue
    const qty = Math.trunc(parseFloat(m[2].replace(',', '.')) || 0)
    if (qty <= 0) continue
    const e = agg.get(sku) ?? { sku, qty: 0, serials: [] }
    e.qty += qty
    agg.set(sku, e)
    lastSku = sku
  }

  return Array.from(agg.values()).map(e => ({
    sku: e.sku,
    qty: e.qty,
    serialNumber: e.serials.length ? Array.from(new Set(e.serials)).join(', ') : null,
  }))
}
