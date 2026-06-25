// Edge function: extracción de Pick Tickets con visión vía OpenRouter (Deno runtime).
//
// El navegador renderiza cada página del PDF a JPEG y manda las imágenes aquí.
// Esta función las envía a un modelo de visión de OpenRouter y devuelve el JSON
// estructurado { ref, documentTotalQty, items: [{ sku, qty, serialNumber }] }.
//
// Endpoint: POST /functions/v1/openrouter-vision (desplegada como 'swift-responder')
// Body:     { images: string[] (data URLs jpeg), prompt?: string, clientHint?: string }
//
// Requiere JWT de un usuario autenticado del CRM.
// Secrets (supabase secrets set KEY=value):
//   OPENROUTER_API_KEY        (requerido)
//   OPENROUTER_VISION_MODEL   (opcional, default google/gemini-3-flash-preview)
// SUPABASE_URL y SUPABASE_ANON_KEY los inyecta la plataforma.

// @ts-ignore — Deno-only import, resuelto en deploy
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore — Deno global disponible en runtime
declare const Deno: { env: { get(key: string): string | undefined } }

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')      ?? ''
const VISION_MODEL       = Deno.env.get('OPENROUTER_VISION_MODEL') ?? 'google/gemini-3-flash-preview'
// Modelo estable de respaldo: si el modelo principal no existe / falla en OpenRouter,
// reintentamos con éste para que la extracción NO se rompa.
const FALLBACK_MODEL     = 'google/gemini-2.5-flash'
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')            ?? ''
const ANON_KEY           = Deno.env.get('SUPABASE_ANON_KEY')       ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type':                 'application/json',
}

const MAX_IMAGES = 8
const TIMEOUT_MS = 60_000

const DEFAULT_PROMPT = `You are a precise data-extraction engine for warehouse packing lists, pick tickets and
commercial invoices, in Spanish or English, from MANY different clients and layouts.
Extract every product line item from the document image(s). Be format-agnostic: clients send
very different column names and layouts — identify the columns by MEANING, not by a fixed name.

Return ONLY a JSON object, no prose, no markdown, with EXACTLY this shape:
{ "ref": string | null, "documentTotalQty": number | null,
  "items": [ { "sku": string, "qty": number, "serialNumber": string | null } ] }

=== HOW TO FIND EACH FIELD ===

"ref": the order/reference/booking number. Synonyms: "# de orden de venta", "Orden", "Order #",
  "Order No", "Referencia", "Folio", "PO", "PO #", "PO No", "Purchase Order", "Booking No",
  "Invoice #", "Invoice No", or codes like "SO2554", "NTMX-USA-45". If several, prefer the
  order/PO/booking over the invoice. If none, null.

"items[].sku": the product/item CODE — an alphanumeric code (letters+digits, may contain
  hyphens, dots, slashes). Identify the SKU COLUMN by ANY of these header synonyms:
    SKU · Item · Item No · Item Number · Item # · Product · Producto · Article · Style ·
    Código · Codigo · No. de parte · N° de parte · Parte · Modelo · Model · Model # ·
    Model Number · "Model # & COO".
  The SKU is the CODE in that column — NOT the description prose next to it.
  Examples of real SKUs across clients: NTEL16825, NTL49926-1, PFTL90924 (under "Product");
    GA-47V OAK SAND, GA-341 VINTAGE BROWN, GA-SP-S-9127, GA-SP-S9127NEGRA (under "ITEM NO");
    ASPT-SL-ALLXN-13, OP-HAA, HS-OB-1004-01, IC-LFICGIC5-01 (under "Model #").
  A SKU usually has NO spaces, BUT some clients put a code WITH spaces in the item column
  (e.g. Garrido "GA-47V OAK SAND"). If the item-code column clearly contains spaces, capture
  the ENTIRE cell text as the SKU — do not split it and do not drop the trailing words.

"items[].qty": the quantity of product units. Identify the QTY COLUMN by header synonyms:
    Qty · Quantity · Cantidad · Cant · PCS · Pzs · Pieces · Piezas · Unidades · Units · Req ·
    Unit Qty · Unit QTY.
  Return an integer (round down decimals). Skip lines with qty 0 or blank.
  DISAMBIGUATION when several numeric columns exist:
    - Prefer the units/pieces column (Quantity / PCS / Unit Qty) over a carton COUNT.
    - NEVER use a "Cartons" RANGE like "1-6" / "7-26" (that is a carton-number range, not a qty).
    - When both "# of Pcs Shipped" and "Unit QTY" exist, prefer "Unit QTY".

"items[].serialNumber": the serial number if the row has one. Synonyms: Serial · Serial Number ·
  Serial # · Número de serie · N° de serie · No. de serie. One serial per line. Else null.

"documentTotalQty": the TOTAL quantity of units declared in the document, if printed. Look for a
  totals row/label like "Total Qty", "Total Pcs", "TOTAL", "Total Quantity", "Total CTNS" — return
  the number that corresponds to the SUM of the qty column (e.g. Garrido PCS total = 673; iFIT
  "Total Qty 119"). This is used to self-check completeness. If not printed, null.

=== COLUMNS YOU MUST IGNORE (never use as qty or sku) ===
- Weight: KGS, KG, G.W., N.W., Gross Weight, Net Weight, "TOTAL G.W.", "UNIT G.W.", Peso.
- Volume: CBM, "Cu Meter", "Total Cu Meter", M3, M³, Volumen, "TOTAL VOL".
- Carton size/count: "Carton Size", CTN, Cartons (and any "1-6" style range).
- Tariff/customs: "Tariff code", HS, HS code, "fracción arancelaria".
- Money: Price, Unit Price, Amount, Importe, Total, Subtotal, IVA, Tax.
- Rows that are totals/subtotals/headers/footers/signature lines.

=== CLIENT-SPECIFIC NOTES (apply when the layout matches) ===
- iFIT / NordicTrack / ICON HEALTH & FITNESS / SEKO (e.g. booking NTMX-USA-…):
  SKU = the code under "Product" (NTEL16825, NTL49926-1, PFTL90924). qty = "Quantity".
  IGNORE the "Cartons" range column (1-6, 7-26…), "Tariff code", "KGS", "Cu Meter".
- Garrido / GAREX / TARGET CONSULTING (bathroom cabinets, shower panels):
  SKU = "ITEM NO" (may contain spaces/variant words → keep whole). qty = "PCS".
  IGNORE "CTN", "UNIT G.W.", "TOTAL G.W.", "CARTON SIZE", "TOTAL VOL" and the "TOTAL" row.
- Life Fitness / Fitness for Life ("Model # & COO" layout): there is often an "ORG" column
  IMMEDIATELY LEFT of "Model #" holding a 3-letter origin code (CMC, USA, MEX, IND, TWN, HUN,
  GER, CHN, ITA, JPN). The ORG code is NOT part of the SKU. Read columns as separate vertical
  strips; do not concatenate adjacent columns.
    WRONG → "CMCASPT-SL-ALLXN-13" (ORG "CMC" leaked).  CORRECT → "ASPT-SL-ALLXN-13".
    WRONG → "USAOP-HAA" / "TWNIC-LFICGIC5-01".          CORRECT → "OP-HAA" / "IC-LFICGIC5-01".
  In this layout the cell is: <SKU code> / <UPPERCASE DESCRIPTION> / "Made in <COUNTRY>" —
  capture ONLY the code line. Prefer "Unit QTY" over "# of Pcs Shipped".
- SO2554-style pick tickets ("Descripción" + "Cant"): the SKU appears on its own line DIRECTLY
  UNDER the description prose; qty is in the "Cant" column.

=== FEW-SHOT EXAMPLES (input columns → expected JSON) ===
1) Garrido. Columns: ITEM NO | DESCRIPTION | PCS | CTN | UNIT G.W. | TOTAL G.W. | CARTON SIZE | TOTAL VOL.
   Rows: "GA-47V OAK SAND | BATHROOM CABINET | 54 | 54 | 44 | 2376 | 88*55*58 | 15.12", … , "TOTAL | | 673 | …"
   →
   { "ref": "2026MG1CLJ012", "documentTotalQty": 673, "items": [
       {"sku":"GA-47V OAK SAND","qty":54,"serialNumber":null},
       {"sku":"GA-341 VINTAGE BROWN","qty":48,"serialNumber":null},
       {"sku":"GA-SP-S-9127","qty":130,"serialNumber":null},
       {"sku":"GA-SP-S9127NEGRA","qty":441,"serialNumber":null} ] }
2) iFIT/NordicTrack. Columns: Cartons | Product | Descriptions | Tariff code | Quantity | KGS | Total KGS | Cu Meter | Total Cu Meter.
   Rows: "1-6 | NTEL16825 | ELLIPTICALS … | 9506910030 | 6 | 101.60 | 609.62 | .503 | 3.0", … , "Total Qty 119".
   →
   { "ref": "NTMX-USA-45", "documentTotalQty": 119, "items": [
       {"sku":"NTEL16825","qty":6,"serialNumber":null},
       {"sku":"NTEL71625","qty":20,"serialNumber":null},
       {"sku":"NTEX14925","qty":4,"serialNumber":null},
       {"sku":"NTEXTDF25","qty":3,"serialNumber":null},
       {"sku":"NTL14125","qty":10,"serialNumber":null},
       {"sku":"NTL49926-1","qty":3,"serialNumber":null},
       {"sku":"NTRW15125","qty":18,"serialNumber":null},
       {"sku":"NTRW19425","qty":15,"serialNumber":null},
       {"sku":"PFTL90924","qty":40,"serialNumber":null} ] }
3) Life Fitness. Columns: ORG | Model # & COO | # of Pcs Shipped | Unit QTY.
   Row: "CMC | ASPT-SL-ALLXN-13 / TREADMILL (EXERCISE EQUIP) / Made in CHINA | 2 | 2"
   → { "ref": null, "documentTotalQty": null, "items": [ {"sku":"ASPT-SL-ALLXN-13","qty":2,"serialNumber":null} ] }

=== GENERAL RULES ===
- Do NOT invent SKUs. If a code is unreadable, omit that line rather than guessing.
- Preserve hyphens and all characters within a SKU (ASPT-SL-ALLXN-12, HD-003R, NTL49926-1).
- One JSON item per product line. If the document has no line items, return
  { "ref": null, "documentTotalQty": null, "items": [] }.`

// Verifica que la petición venga de un usuario autenticado del CRM.
async function isAuthenticated(req: Request): Promise<boolean> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt || !SUPABASE_URL || !ANON_KEY) return false
  try {
    const { data, error } = await createClient(SUPABASE_URL, ANON_KEY).auth.getUser(jwt)
    return !error && !!data.user
  } catch {
    return false
  }
}

// El modelo a veces envuelve el JSON en fences ```json … ``` o agrega prosa.
// Recortamos al primer { … último } antes de parsear.
function extractJson(raw: string): unknown {
  const fenced = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = fenced.indexOf('{')
  const end   = fenced.lastIndexOf('}')
  const slice = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced
  return JSON.parse(slice)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: CORS_HEADERS })
  }
  if (!(await isAuthenticated(req))) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }),
      { status: 401, headers: CORS_HEADERS })
  }
  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'OPENROUTER_API_KEY no configurada' }),
      { status: 200, headers: CORS_HEADERS })
  }

  let payload: { images?: unknown; prompt?: unknown; clientHint?: unknown }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      { status: 400, headers: CORS_HEADERS })
  }

  const images = Array.isArray(payload.images)
    ? payload.images
        .filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/'))
        .slice(0, MAX_IMAGES)
    : []
  const basePrompt = typeof payload.prompt === 'string' && payload.prompt.trim()
    ? payload.prompt
    : DEFAULT_PROMPT
  // Pista específica del cliente seleccionado (se ANEXA al prompt base, no lo reemplaza).
  const clientHint = typeof payload.clientHint === 'string' && payload.clientHint.trim()
    ? payload.clientHint.trim()
    : ''
  const prompt = clientHint
    ? `${basePrompt}\n\n=== HINT FOR THIS SPECIFIC CLIENT (highest priority) ===\n${clientHint}`
    : basePrompt

  if (images.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'No images provided' }),
      { status: 200, headers: CORS_HEADERS })
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  const callModel = (model: string) => fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: ctrl.signal,
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://crm-supply-chain.vercel.app',
      'X-Title':       'CRM Supply Chain — Receipt Generator',
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 4000,
    }),
  })

  try {
    let usedModel = VISION_MODEL
    let res = await callModel(usedModel)

    // Si el modelo principal falla (p.ej. slug inexistente), reintenta con el fallback.
    if (!res.ok && FALLBACK_MODEL !== VISION_MODEL) {
      const firstTxt = await res.text()
      console.error(`[openrouter-vision] modelo ${usedModel} falló ${res.status}: ${firstTxt}. Reintentando con ${FALLBACK_MODEL}.`)
      usedModel = FALLBACK_MODEL
      res = await callModel(usedModel)
    }

    if (!res.ok) {
      const txt = await res.text()
      console.error(`[openrouter-vision] upstream ${res.status}: ${txt}`)
      return new Response(JSON.stringify({ ok: false, error: `OpenRouter ${res.status}: ${txt}` }),
        { status: 200, headers: CORS_HEADERS })
    }

    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content ?? ''
    let parsed: unknown
    try {
      parsed = extractJson(content)
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Modelo no devolvió JSON válido', raw: content }),
        { status: 200, headers: CORS_HEADERS })
    }

    return new Response(JSON.stringify({ ok: true, data: parsed, model: usedModel }),
      { status: 200, headers: CORS_HEADERS })
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError'
      ? 'OpenRouter timeout'
      : (e instanceof Error ? e.message : String(e))
    console.error('[openrouter-vision] fetch failed:', msg)
    return new Response(JSON.stringify({ ok: false, error: msg }),
      { status: 200, headers: CORS_HEADERS })
  } finally {
    clearTimeout(timer)
  }
})
