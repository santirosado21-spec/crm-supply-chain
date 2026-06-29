/**
 * Arnés de EVALUACIÓN REAL de extracción por visión (dev tool, fuera de src/).
 *
 * Prueba el prompt canónico (src/lib/visionPrompt.ts) + modelo contra los PDFs
 * reales de clientes, igual que producción: PDF → PNG (pdftoppm) → OpenRouter →
 * filtro isValidSku. Imprime PASS/FAIL y termina con código != 0 si algo falla,
 * para que los sub-agentes puedan iterar hasta que pase.
 *
 * Requisitos: OPENROUTER_API_KEY en el entorno, `pdftoppm` (poppler), y los PDFs
 * en la carpeta padre del repo.
 *
 * Correr:
 *   OPENROUTER_API_KEY=sk-... node --experimental-strip-types scripts/extraction-eval.ts
 *   (opcional) OPENROUTER_VISION_MODEL=google/gemini-3-flash-preview
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { normalizeSKU, isValidSku } from '../src/lib/skuValidation.ts'
import { VISION_PROMPT } from '../src/lib/visionPrompt.ts'
import { getClientImportHint } from '../src/lib/clientImportFormats.ts'

const API_KEY = process.env.OPENROUTER_API_KEY ?? ''
const MODEL = process.env.OPENROUTER_VISION_MODEL ?? 'google/gemini-3-flash-preview'
const FALLBACK = 'google/gemini-2.5-flash'
const PARENT = resolve(process.cwd(), '..')

if (!API_KEY) {
  console.error('✗ Falta OPENROUTER_API_KEY en el entorno.')
  process.exit(2)
}

interface Fixture {
  name: string; pdf: string; customer: string
  expectedTotal: number; expected: Record<string, number>
}

const FIXTURES: Fixture[] = [
  {
    name: 'Garrido (ITEM NO / PCS)',
    pdf: 'PL GARRIDO -EGSU1611675-MX.pdf',
    customer: 'GARRIDO',
    expectedTotal: 673,
    expected: { 'GA-47VOAKSAND': 54, 'GA-341VINTAGEBROWN': 48, 'GA-SP-S-9127': 130, 'GA-SP-S9127NEGRA': 441 },
  },
  {
    name: 'iFIT / NTMX (Product / Quantity)',
    pdf: 'Packing List NTMX-USA-45.pdf',
    customer: 'IFIT',
    expectedTotal: 119,
    expected: {
      NTEL16825: 6, NTEL71625: 20, NTEX14925: 4, NTEXTDF25: 3, NTL14125: 10,
      'NTL49926-1': 3, NTRW15125: 18, NTRW19425: 15, PFTL90924: 40,
    },
  },
  {
    name: 'LINET Delivery Note (Material Description = código, no nombre)',
    pdf: 'ExpDL_0030191411.pdf',
    customer: 'LINET',
    expectedTotal: 190,
    expected: {
      '1GE412055-2313': 36, '4PW171100LS': 36, '4PV340290000': 36,
      '11028700B0000': 72, '2G0PACK100004': 9, '2M1600000000': 1,
    },
  },
  {
    // Bill of Lading / waybill: NO es packing list → debe extraer 0 items.
    name: 'Maersk B/L (transporte, sin SKUs)',
    pdf: 'document.pdf',
    customer: 'LINET',
    expectedTotal: 0,
    expected: {},
  },
]

function pdfToImages(pdfPath: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'pt-eval-'))
  execSync(`pdftoppm -png -r 200 "${pdfPath}" "${join(dir, 'page')}"`, { stdio: 'ignore' })
  return readdirSync(dir).filter(f => f.endsWith('.png')).sort()
    .map(f => `data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}`)
}

async function callOpenRouter(images: string[], clientHint: string | undefined, model = MODEL): Promise<{ raw: string; model: string }> {
  const prompt = clientHint ? `${VISION_PROMPT}\n\n=== HINT FOR THIS SPECIFIC CLIENT (highest priority) ===\n${clientHint}` : VISION_PROMPT
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))] }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4000,
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    if (model !== FALLBACK) { console.warn(`  modelo ${model} falló (${res.status}); reintentando con ${FALLBACK}`); return callOpenRouter(images, clientHint, FALLBACK) }
    throw new Error(`OpenRouter ${res.status}: ${txt}`)
  }
  const data = await res.json()
  return { raw: data?.choices?.[0]?.message?.content ?? '', model }
}

function parseItems(raw: string): { sku: string; qty: number }[] {
  const fenced = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = fenced.indexOf('{'); const end = fenced.lastIndexOf('}')
  const obj = JSON.parse(start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced)
  const out: { sku: string; qty: number }[] = []
  for (const it of (obj.items ?? [])) {
    const sku = normalizeSKU(it.sku)
    if (!sku || !isValidSku(sku)) continue
    const qty = Math.trunc(Number(it.qty))
    if (Number.isFinite(qty) && qty > 0) out.push({ sku, qty })
  }
  return out
}

let failures = 0
for (const fx of FIXTURES) {
  const pdfPath = join(PARENT, fx.pdf)
  console.log(`\n=== ${fx.name} ===`)
  if (!existsSync(pdfPath)) { console.warn(`  ⚠ falta ${pdfPath}, se salta`); continue }
  try {
    const images = pdfToImages(pdfPath)
    const { raw, model } = await callOpenRouter(images, getClientImportHint(fx.customer))
    console.log(`  modelo usado: ${model}`)
    const items = parseItems(raw)
    const got: Record<string, number> = {}
    for (const it of items) got[it.sku] = (got[it.sku] ?? 0) + it.qty
    const sum = items.reduce((s, i) => s + i.qty, 0)

    const problems: string[] = []
    for (const [sku, qty] of Object.entries(fx.expected)) {
      if (got[sku] !== qty) problems.push(`SKU ${sku}: esperado ${qty}, obtuvo ${got[sku] ?? 'ausente'}`)
    }
    const extras = Object.keys(got).filter(k => !(k in fx.expected))
    if (extras.length) problems.push(`SKUs de más: ${extras.join(', ')}`)
    if (sum !== fx.expectedTotal) problems.push(`total: esperado ${fx.expectedTotal}, obtuvo ${sum}`)

    if (problems.length === 0) {
      console.log(`  ✓ PASS — ${items.length} líneas, total ${sum}`)
    } else {
      failures++
      console.log(`  ✗ FAIL:\n    - ${problems.join('\n    - ')}`)
      console.log(`    got: ${JSON.stringify(got)}`)
    }
  } catch (e) {
    failures++
    console.log(`  ✗ ERROR: ${e instanceof Error ? e.message : String(e)}`)
  }
}

console.log(`\n${failures === 0 ? '✓ TODOS LOS CASOS PASARON' : `✗ ${failures} CASO(S) FALLARON`}`)
process.exit(failures === 0 ? 0 : 1)
