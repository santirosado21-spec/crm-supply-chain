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
// Prompt canónico (sincronizado con src/lib/visionPrompt.ts vía el arnés de eval).
import { VISION_PROMPT } from './visionPrompt.ts'

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

const DEFAULT_PROMPT = VISION_PROMPT

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
