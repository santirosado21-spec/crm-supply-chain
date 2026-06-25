/**
 * Pick Ticket parser — shared by SKU Validator and Receipt Generator.
 *
 * Supports:
 *  - Excel: detects SKU / Quantity / Serial Number columns by header name
 *  - PDF: grid extraction with X/Y coordinates, two strategies:
 *      A) SKU + QTY in own columns  (e.g. standard PTs)
 *      B) DESCRIPCIÓN + CANT + SKU-below-description (e.g. SO2554 style)
 */
import * as pdfjsLib from 'pdfjs-dist'
import * as XLSX from 'xlsx'
// Lógica pura de SKU (sin pdfjs) — re-exportada para compatibilidad con imports existentes.
import { isEmptyLike, sanitizeCellValue, normalizeSKU, looksLikeSKU, isValidSku } from './skuValidation'
export { isEmptyLike, sanitizeCellValue, normalizeSKU, looksLikeSKU, isValidSku }

// Serve worker locally from /public to avoid CDN version-mismatch issues
// (cdnjs doesn't always mirror the exact pdfjs-dist version we have installed).
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

/* ─── Types ──────────────────────────────────────────────────────────── */
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

interface PDFItem { text: string; x: number; y: number; page: number }
type PDFRow = PDFItem[]

/* ─── Patterns (encabezados de columnas, específicos del parser) ──────── */
const DESC_HEADER_RE      = /descripci[oó]n/i
const CANT_HEADER_RE      = /^cant\.?$/i
const SKU_HEADER_RE       = /sku|item|product|producto|articulo|art[ií]culo|style|n°\s*de\s*parte|no\.?\s*de\s*parte|código|codigo|parte|model(\s*#|\s*number|o)?/i
const QTY_HEADER_RE       = /qty|cantidad|quantity|piezas|pzs|pcs|pieces|unidades|units|req|cant\b|unit\s*qty/i
const SERIAL_HEADER_RE    = /serial\s*(number|#)?|n[°º]?\s*de\s*serie|n[uú]mero\s*de\s*serie|no\.?\s*de\s*serie/i

function rowToLine(row: PDFRow): string {
  return row.map(i => i.text).join(' ')
}

function normalizeSerial(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (isEmptyLike(s)) return null
  return s
}

/* ─── PDF: Grid extraction ───────────────────────────────────────────── */
export async function extractPDFGrid(file: File): Promise<PDFRow[]> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const allItems: PDFItem[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const tItem = item as { str: string; transform: number[] }
      if (!tItem.str.trim()) continue
      allItems.push({
        text: tItem.str.trim(),
        x:    Math.round(tItem.transform[4]),
        y:    Math.round(tItem.transform[5]),
        page: i,
      })
    }
  }

  allItems.sort((a, b) => (a.page !== b.page ? a.page - b.page : b.y - a.y) || a.x - b.x)

  const rows: PDFRow[] = []
  let currentRow: PDFRow = []
  let lastY: number | null = null
  let lastPage: number | null = null

  for (const item of allItems) {
    if (lastY !== null && (item.page !== lastPage || Math.abs(item.y - lastY) > 4)) {
      if (currentRow.length > 0) rows.push(currentRow)
      currentRow = []
    }
    currentRow.push(item)
    lastY = item.y
    lastPage = item.page
  }
  if (currentRow.length > 0) rows.push(currentRow)
  return rows
}

/* ─── Detect Ref# from PT ────────────────────────────────────────────── */
export function detectRefFromGrid(grid: PDFRow[]): string | null {
  // Scan first 30 rows for a reference number
  const text = grid.slice(0, 30).map(rowToLine).join(' ')
  const patterns = [
    /#\s*de\s*(?:orden\s*de\s*venta|orden|venta)\s*:?\s*([A-Z0-9][\w\-]*)/i,
    /\b(?:purchase\s*order|PO|P\.O\.)\s*#?\s*:?\s*([A-Z0-9][\w\-]*)/i,
    /\b(?:orden|referencia|ref|folio)\s*#?\s*:?\s*([A-Z0-9][\w\-]*)/i,
    /\bSO\s*([0-9]+)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m && m[1]) {
      // Clean up: add SO prefix if pattern matched SO
      if (p.source.includes('SO') && !m[1].toUpperCase().startsWith('SO')) {
        return 'SO' + m[1]
      }
      return m[1].trim()
    }
  }
  return null
}

export function detectRefFromExcel(wb: XLSX.WorkBook): string | null {
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return null
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  const topText = data.slice(0, 30)
    .map(r => (r || []).map(c => String(c ?? '')).join(' '))
    .join(' ')
  const patterns = [
    /#\s*de\s*(?:orden\s*de\s*venta|orden|venta)\s*:?\s*([A-Z0-9][\w\-]*)/i,
    /\b(?:purchase\s*order|PO|P\.O\.)\s*#?\s*:?\s*([A-Z0-9][\w\-]*)/i,
    /\b(?:orden|referencia|ref|folio)\s*#?\s*:?\s*([A-Z0-9][\w\-]*)/i,
    /\bSO\s*([0-9]+)/i,
  ]
  for (const p of patterns) {
    const m = topText.match(p)
    if (m && m[1]) {
      if (p.source.includes('SO') && !m[1].toUpperCase().startsWith('SO')) {
        return 'SO' + m[1]
      }
      return m[1].trim()
    }
  }
  return null
}

/* ─── PDF: Strategy B (Description format, SO2554 style) ─────────────── */
function extractDescriptionFormat(
  grid: PDFRow[],
  headerRowIdx: number,
  cantX: number,
  serialX: number | null,
): PTLineItem[] {
  const items: PTLineItem[] = []
  let pendingQty = 0
  let pendingSerial: string | null = null

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r]
    const fullText = rowToLine(row)
    if (/inspiring the world|presente orden|page\s+\d/i.test(fullText)) continue
    if (/^(sub\s*total|total|iva|tax|envío)/i.test(fullText.trim())) continue

    const cantItems = row.filter(i => i.x >= cantX - 20)
    const descItems = row.filter(i => i.x < cantX - 20)

    if (cantItems.length > 0) {
      const cantText = cantItems[0].text.replace(/[^\d]/g, '')
      const qty = parseInt(cantText) || 0
      if (qty > 0) pendingQty = qty

      // Try to capture serial from the same row if serialX is known
      if (serialX !== null) {
        const serialItems = row.filter(i => Math.abs(i.x - serialX) < 40)
        if (serialItems.length > 0) {
          const s = serialItems.map(i => i.text).join(' ').trim()
          pendingSerial = s || null
        }
      }
    } else if (descItems.length > 0) {
      const text = descItems.map(i => i.text).join(' ').trim()
      const sku = normalizeSKU(text)
      if (sku && isValidSku(sku) && pendingQty > 0) {
        items.push({ sku, qty: pendingQty, serialNumber: pendingSerial })
        pendingQty = 0
        pendingSerial = null
      }
    }
  }
  return items
}

/* ─── PDF: Main extractor ────────────────────────────────────────────── */
async function extractItemsFromPDF(file: File): Promise<PTExtraction> {
  const grid = await extractPDFGrid(file)
  const ref = detectRefFromGrid(grid)

  // Scan rows looking for header signatures
  for (let r = 0; r < grid.length; r++) {
    const lineText = rowToLine(grid[r]).toLowerCase()

    // Strategy B: DESCRIPCIÓN + CANT
    if (DESC_HEADER_RE.test(lineText) && /\bcant\b/.test(lineText)) {
      let cantX: number | null = null
      let serialX: number | null = null
      for (const item of grid[r]) {
        if (CANT_HEADER_RE.test(item.text)) cantX = item.x
        if (SERIAL_HEADER_RE.test(item.text)) serialX = item.x
      }
      if (cantX !== null) {
        const items = extractDescriptionFormat(grid, r, cantX, serialX)
        if (items.length > 0) return { ref, items }
      }
    }

    // Strategy A: SKU + QTY [+ SERIAL] columns
    if (SKU_HEADER_RE.test(lineText) && QTY_HEADER_RE.test(lineText)) {
      let skuX: number | null = null
      let qtyX: number | null = null
      let serialX: number | null = null
      for (const item of grid[r]) {
        const t = item.text.toLowerCase()
        if (SKU_HEADER_RE.test(t)) skuX = item.x
        if (QTY_HEADER_RE.test(t)) qtyX = item.x
        if (SERIAL_HEADER_RE.test(t)) serialX = item.x
      }
      if (skuX !== null && qtyX !== null) {
        const items: PTLineItem[] = []
        for (let r2 = r + 1; r2 < grid.length; r2++) {
          const skuItems    = grid[r2].filter(i => Math.abs(i.x - skuX!) < 30)
          const qtyItems    = grid[r2].filter(i => Math.abs(i.x - qtyX!) < 30)
          const serialItems = serialX !== null
            ? grid[r2].filter(i => Math.abs(i.x - serialX!) < 40)
            : []
          const sku = normalizeSKU(skuItems.map(i => i.text).join(' '))
          const qtyStr = qtyItems.map(i => i.text).join(' ').replace(/[^\d.]/g, '')
          const serialStr = serialItems.length > 0
            ? serialItems.map(i => i.text).join(' ').trim()
            : null
          if (sku && isValidSku(sku) && qtyStr) {
            const qty = parseInt(qtyStr) || 0
            if (qty > 0) items.push({ sku, qty, serialNumber: normalizeSerial(serialStr) })
          }
        }
        if (items.length > 0) return { ref, items }
      }
    }
  }

  // Fallback: regex line scan
  const fallback: PTLineItem[] = []
  for (const row of grid) {
    const line = rowToLine(row)
    const parts = line.split(/\s+/)
    if (parts.length >= 2) {
      const first = normalizeSKU(parts[0])
      const last = parts[parts.length - 1]
      if (first && isValidSku(first) && /^\d+$/.test(last)) {
        fallback.push({ sku: first, qty: parseInt(last), serialNumber: null })
      }
    }
  }
  return { ref, items: fallback }
}

/* ─── Excel extractor ────────────────────────────────────────────────── */
function extractItemsFromExcelWB(wb: XLSX.WorkBook): PTExtraction {
  const ref = detectRefFromExcel(wb)
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { ref, items: [] }

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  // Find header row
  let skuCol = -1
  let qtyCol = -1
  let serialCol = -1
  let headerRow = -1

  for (let r = 0; r < data.length; r++) {
    const row = data[r]
    if (!row) continue
    let foundSku = -1, foundQty = -1, foundSerial = -1
    for (let c = 0; c < row.length; c++) {
      const h = String(row[c] ?? '').toLowerCase()
      if (SKU_HEADER_RE.test(h) && foundSku === -1)     foundSku = c
      if (QTY_HEADER_RE.test(h) && foundQty === -1)     foundQty = c
      if (SERIAL_HEADER_RE.test(h) && foundSerial === -1) foundSerial = c
    }
    if (foundSku !== -1 && foundQty !== -1) {
      skuCol = foundSku
      qtyCol = foundQty
      serialCol = foundSerial
      headerRow = r
      break
    }
  }

  if (headerRow === -1) return { ref, items: [] }

  const items: PTLineItem[] = []
  for (let r = headerRow + 1; r < data.length; r++) {
    const row = data[r]
    if (!row) continue
    const sku = normalizeSKU(row[skuCol])
    const raw = String(row[qtyCol] ?? '').replace(/[^\d.]/g, '')
    if (sku && isValidSku(sku) && raw) {
      const qty = parseInt(raw) || 0
      if (qty > 0) {
        const serial = serialCol >= 0 ? normalizeSerial(row[serialCol]) : null
        items.push({ sku, qty, serialNumber: serial })
      }
    }
  }
  return { ref, items }
}

/* ─── Public API ─────────────────────────────────────────────────────── */
export async function extractReceiptItemsFromPT(file: File): Promise<PTExtraction> {
  const isPDF = file.name.toLowerCase().endsWith('.pdf')
  if (isPDF) return extractItemsFromPDF(file)

  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf)
  return extractItemsFromExcelWB(wb)
}
