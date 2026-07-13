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
import { isEmptyLike, sanitizeCellValue, normalizeSKU, looksLikeSKU, isValidSku, findPartialSkuCandidates, classifySku } from './skuValidation'
export { isEmptyLike, sanitizeCellValue, normalizeSKU, looksLikeSKU, isValidSku, findPartialSkuCandidates, classifySku }
// Parser de hojas (Excel/CSV) sin pdfjs — fuente única de tipos y regex de encabezado.
import {
  SKU_HEADER_RE, QTY_HEADER_RE, SERIAL_HEADER_RE, normalizeSerial,
  extractItemsFromWorkbook, detectRefFromExcel, parseDeliveryNoteLines,
  type PTLineItem, type PTExtraction,
} from './sheetParser'
export { detectRefFromExcel }
export type { PTLineItem, PTExtraction }

// Serve worker locally from /public to avoid CDN version-mismatch issues
// (cdnjs doesn't always mirror the exact pdfjs-dist version we have installed).
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export interface PDFItem { text: string; x: number; y: number; page: number }
export type PDFRow = PDFItem[]

/* ─── Patterns (PDF Strategy B; SKU/QTY/SERIAL vienen de sheetParser) ──── */
const DESC_HEADER_RE      = /descripci[oó]n/i
const CANT_HEADER_RE      = /^cant\.?$/i

function rowToLine(row: PDFRow): string {
  return row.map(i => i.text).join(' ')
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
    /#\s*de\s*(?:orden\s*de\s*venta|orden|venta)\s*:?\s*([A-Z0-9][\w-]*)/i,
    /\b(?:purchase\s*order|PO|P\.O\.)\s*#?\s*:?\s*([A-Z0-9][\w-]*)/i,
    /\b(?:orden|referencia|ref|folio)\s*#?\s*:?\s*([A-Z0-9][\w-]*)/i,
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

  // Estrategia C (líneas): Delivery Notes tipo LINET "<#> <CÓDIGO> <nombre> <cant> PC".
  // Determinista (no depende de visión). Solo aplica si encuentra items con unidad "PC".
  const dnItems = parseDeliveryNoteLines(grid.map(rowToLine))
  if (dnItems.length > 0) return { ref, items: dnItems }

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

/* ─── Public API ─────────────────────────────────────────────────────── */
export async function extractReceiptItemsFromPT(file: File): Promise<PTExtraction> {
  const isPDF = file.name.toLowerCase().endsWith('.pdf')
  if (isPDF) return extractItemsFromPDF(file)

  // Excel / CSV → sheetParser (sin pdfjs): exclusión de columnas de nombre,
  // qty-por-serial y agrupación por SKU.
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf)
  return extractItemsFromWorkbook(wb)
}
