/**
 * Validación y normalización de SKUs — lógica PURA (sin pdfjs/xlsx).
 *
 * Vive separada de ptParser.ts para poder importarse en Node (tests) sin
 * arrastrar el build de pdfjs (que requiere DOMMatrix del browser). ptParser
 * re-exporta estas funciones para compatibilidad con los imports existentes.
 */

const SKU_CODE_RE = /^[A-Z0-9][A-Z0-9\-./]{1,}$/

// "Empty-like" placeholder text. Dashes WITHIN a valid SKU (HD-003R,
// ASPT-SL-ALLXN-12) are always preserved — only pure text placeholders
// such as "N/A" or "NONE" are treated as empty.
const EMPTY_VALUES_RE = /^(n\/?a|n\.a\.?|none|nan|null|sin\s*sku|no\s*aplica)$/i

export function isEmptyLike(text: string): boolean {
  return !text || EMPTY_VALUES_RE.test(text)
}

/*
  Final safety net used at export time: any cell that still contains an
  N/A-like string gets blanked, so the Extensiv import never sees "N/A".
*/
export function sanitizeCellValue<T>(v: T): T | '' {
  const s = String(v ?? '').trim()
  if (isEmptyLike(s)) return ''
  return v
}

export function normalizeSKU(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  // SKUs never contain whitespace — strip all (handles cases where PDF text
  // extraction splits a SKU like "ASPT-SL-ALLXN-12" into pieces joined with spaces).
  // Unifica variantes Unicode de guion (– — ‐ ‑ ‒ ― −) a un hyphen ASCII '-',
  // así "NTL49926–1" (en-dash de OCR) coincide con "NTL49926-1..." de Extensiv.
  const cleaned = s
    .replace(/\s+/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/^(\d+)\.0$/, '$1')
    .toUpperCase()
  if (isEmptyLike(cleaned)) return null
  return cleaned
}

export type SkuMatchKind = 'exact' | 'partial' | 'none'

/**
 * Busca SKUs registrados que sean una coincidencia PARCIAL del SKU del documento:
 * cuando uno es prefijo o subcadena del otro (ej. doc "NTL49926-1" ⊂ registrado
 * "NTL49926-1000"). Es el comportamiento de "Contiene" de Extensiv. Devuelve los
 * candidatos (hasta 12) para que el usuario confirme la equivalencia.
 * `catalog` debe venir ya normalizado (normalizeSKU).
 */
export function findPartialSkuCandidates(docSku: string, catalog: string[]): string[] {
  const MIN = 4
  if (!docSku || docSku.length < MIN) return []
  const out = new Set<string>()
  for (const r of catalog) {
    if (r === docSku || r.length < MIN) continue
    if (r.startsWith(docSku) || docSku.startsWith(r) || r.includes(docSku) || docSku.includes(r)) {
      out.add(r)
    }
  }
  // Prioriza prefijos (más fuertes) y limita el listado.
  return Array.from(out)
    .sort((a, b) => {
      const ap = a.startsWith(docSku) || docSku.startsWith(a) ? 0 : 1
      const bp = b.startsWith(docSku) || docSku.startsWith(b) ? 0 : 1
      return ap - bp || a.localeCompare(b)
    })
    .slice(0, 12)
}

export function looksLikeSKU(text: string): boolean {
  const t = text.replace(/\s+/g, '').trim().toUpperCase()
  if (t.length < 2 || t.length > 50) return false
  return SKU_CODE_RE.test(t)
}

// Palabras que NUNCA son un SKU por sí solas (encabezados, etiquetas, totales,
// ciudades, países, unidades…). Si un candidato es solo estas palabras, se descarta.
const SKU_STOPWORDS = new Set([
  'TOTAL', 'SUBTOTAL', 'SUB', 'TOTALES', 'IVA', 'TAX', 'FECHA', 'DATE', 'SHIPPED', 'SHIP', 'SHIPDATE',
  'BOOKING', 'INVOICE', 'ORDER', 'ORDEN', 'REFERENCIA', 'REF', 'FOLIO', 'PO', 'BILL', 'SOLD', 'SHIPPER',
  'QTY', 'QUANTITY', 'CANT', 'CANTIDAD', 'PCS', 'PZS', 'PIEZAS', 'PIECES', 'UNIT', 'UNITS', 'UNIDADES',
  'CTN', 'CTNS', 'CARTON', 'CARTONS', 'CAJAS', 'KGS', 'KG', 'LBS', 'PESO', 'WEIGHT', 'GROSS', 'NET', 'GW', 'NW',
  'CBM', 'CUMETER', 'METER', 'VOL', 'VOLUME', 'VOLUMEN', 'M3', 'TARIFF', 'HS', 'HSCODE', 'FRACCION', 'ARANCELARIA',
  'SKU', 'ITEM', 'PRODUCT', 'PRODUCTO', 'DESCRIPTION', 'DESCRIPCION', 'DESCRIPCIONES', 'DESCRIPTIONS',
  'SERIAL', 'MODEL', 'MODELO', 'PARTE', 'PART', 'NAME', 'NOMBRE', 'CODE', 'COO', 'MADE', 'ORIGIN', 'ORIGEN',
  'LERMA', 'MEXICO', 'MÉXICO', 'USA', 'CHINA', 'FROM', 'THE', 'AND', 'ORIGINAL', 'COPY', 'PACKING',
  'LIST', 'SLIP', 'PALLET', 'PALLETS', 'TARIMA', 'LOTE', 'LOT', 'PRICE', 'PRECIO', 'IMPORTE', 'AMOUNT',
])

// Etiquetas "duras": si un candidato CONTIENE alguno de estos tokens, no es un SKU
// (típico de filas de totales o columnas de peso). Ej: "TOTAL G.W.", "TOTAL VOL".
const SKU_HARD_LABELS = new Set([
  'TOTAL', 'SUBTOTAL', 'TOTALES', 'GROSS', 'NET', 'WEIGHT', 'PESO', 'IVA', 'TAX', 'CBM', 'VOLUMEN',
])

/**
 * Valida que un texto sea un SKU plausible según la definición operativa:
 * combina letras y números (o lleva separadores - . / _), NO es una palabra
 * suelta del documento (fecha, total, shipped, lerma, etc.).
 */
export function isValidSku(raw: string | null | undefined): boolean {
  if (raw == null) return false
  const s = String(raw).trim().toUpperCase()
  if (s.length < 3 || s.length > 50) return false
  // Charset permitido: alfanumérico + espacio y separadores - . / _
  if (!/^[A-Z0-9][A-Z0-9 ._/-]*$/.test(s)) return false
  const hasDigit = /[0-9]/.test(s)
  const hasSep = /[-._/]/.test(s)
  // Un SKU debe tener al menos un dígito O un separador; nunca es una palabra suelta.
  if (!hasDigit && !hasSep) return false
  const tokens = s.split(/[\s\-._/]+/).filter(Boolean)
  // Rechaza si NINGÚN token es "significativo": un token significativo tiene >1
  // carácter y no es palabra de parada. Esto descarta encabezados/etiquetas como
  // "UNIT QTY", "TOTAL QTY", "UNIT G.W." (G/W son letras sueltas) sin afectar
  // SKUs cortos como "OP-SM", "HS-BC", "LBR-DB".
  const meaningful = tokens.filter(t => t.length > 1 && !SKU_STOPWORDS.has(t))
  if (meaningful.length === 0) return false
  // Rechaza si contiene una etiqueta dura (filas de total / columnas de peso/volumen).
  if (tokens.some(t => SKU_HARD_LABELS.has(t))) return false
  return true
}
