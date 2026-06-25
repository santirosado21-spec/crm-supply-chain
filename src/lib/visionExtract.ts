/**
 * Extracción de Pick Tickets con visión (OpenRouter).
 *
 * Renderiza cada página del PDF a JPEG en el navegador (pdfjs-dist) y manda las
 * imágenes a la edge function `openrouter-vision`, que las pasa por un modelo de
 * visión. Devuelve la misma forma `PTExtraction` que el parser de texto, así que
 * encaja directo en el flujo de validación del Generador Receipt Import.
 *
 * El worker de pdfjs ya queda configurado al importar `ptParser.ts` (side-effect),
 * por eso reusamos sus helpers en lugar de re-setear `workerSrc`.
 */
import * as pdfjsLib from 'pdfjs-dist'
import { supabase } from './supabase'
import {
  normalizeSKU,
  looksLikeSKU,
  isValidSku,
  isEmptyLike,
  type PTExtraction,
  type PTLineItem,
} from './ptParser'

const MAX_PAGES    = 8
const MAX_WIDTH    = 1600
const JPEG_QUALITY = 0.8

interface VisionResponse {
  ok:     boolean
  data?:  unknown
  error?: string
  raw?:   string
  model?: string
}

/* ─── PDF → imágenes JPEG (data URLs) ──────────────────────────────────── */
async function renderPdfToImages(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pageCount = Math.min(pdf.numPages, MAX_PAGES)
  const images: string[] = []

  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(MAX_WIDTH / base.width, 3) // sin upscaling agresivo
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      // alpha:false → fondo blanco (JPEG no tiene alfa; sin esto sale negro y arruina el OCR)
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas')

      await page.render({ canvasContext: ctx, viewport, canvas }).promise
      images.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY))

      // Liberar memoria de inmediato (PTs grandes pueden agotar canvas en móvil)
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
    }
  } finally {
    await pdf.destroy()
  }

  return images
}

/* ─── Validación del payload externo (unknown → tipado, sin `any`) ─────── */
function coerceRef(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = (raw as Record<string, unknown>).ref
  const s = r == null ? '' : String(r).trim()
  return s && !isEmptyLike(s) ? s : null
}

// Si el modelo de visión concatena el código ORG (origin/manufacturer, 3 letras
// como CMC/USA/MEX/HUN/IND/TWN/GER/CHN/ITA/JPN) con el SKU porque la columna ORG
// vive justo al lado del Model #, limpiamos el leak — pero SOLO si quitar el
// prefijo deja un SKU que sigue siendo válido por sí mismo (empezando con letra
// seguida de un guión, p.ej. "ASPT-SL-...", "OP-HAA", "HS-...").
const ORG_PREFIX_RE = /^(CMC|USA|MEX|IND|TWN|HUN|GER|CHN|ITA|JPN)([A-Z][A-Z0-9]{0,8}-.*)$/
function stripOrgLeak(sku: string): string {
  const m = sku.match(ORG_PREFIX_RE)
  if (m && looksLikeSKU(m[2])) return m[2]
  return sku
}

function coerceTotal(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  const t = (raw as Record<string, unknown>).documentTotalQty
  const n = Math.trunc(Number(t))
  return Number.isFinite(n) && n > 0 ? n : null
}

function coerceItems(raw: unknown): PTLineItem[] {
  if (!raw || typeof raw !== 'object') return []
  const arr = (raw as Record<string, unknown>).items
  if (!Array.isArray(arr)) return []

  const out: PTLineItem[] = []
  for (const el of arr) {
    if (!el || typeof el !== 'object') continue
    const row = el as Record<string, unknown>

    const normalized = normalizeSKU(row.sku)
    if (!normalized) continue
    const sku = stripOrgLeak(normalized)
    // Filtro estricto: descarta palabras sueltas (fecha, total, shipped, lerma…).
    if (!isValidSku(sku)) continue

    const qty = Math.trunc(Number(row.qty))
    if (!Number.isFinite(qty) || qty <= 0) continue

    const serialRaw = row.serialNumber == null ? '' : String(row.serialNumber).trim()
    const serialNumber = serialRaw && !isEmptyLike(serialRaw) ? serialRaw : null

    out.push({ sku, qty, serialNumber })
  }
  return out
}

/* ─── API pública ──────────────────────────────────────────────────────── */
export async function extractReceiptItemsWithVision(
  file: File,
  clientHint?: string,
): Promise<PTExtraction> {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('La extracción con IA solo aplica a PDFs.')
  }

  const images = await renderPdfToImages(file)
  if (images.length === 0) {
    throw new Error('No se pudo renderizar el PDF para la extracción con IA.')
  }

  // Nombre histórico en Supabase: la función se desplegó como 'swift-responder'
  // (default que sugirió el dashboard). El código del archivo
  // supabase/functions/openrouter-vision/index.ts es lo que vive ahí.
  const { data, error } = await supabase.functions.invoke<VisionResponse>('swift-responder', {
    // prompt omitido → la edge function usa su DEFAULT_PROMPT; clientHint se anexa.
    body: clientHint ? { images, clientHint } : { images },
  })
  if (error) throw new Error(`Vision proxy error: ${error.message}`)
  if (!data?.ok) throw new Error(data?.error ?? 'Falló la extracción con IA.')

  return {
    ref: coerceRef(data.data),
    items: coerceItems(data.data),
    documentTotalQty: coerceTotal(data.data),
  }
}
