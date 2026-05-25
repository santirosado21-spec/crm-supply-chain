// Edge function: proxy de descarga de etiquetas de carrier (Deno runtime).
//
// El navegador no puede hacer fetch directo a los servidores de Skydropx /
// FedEx donde viven las etiquetas (CORS). Esta función descarga el archivo
// del lado del servidor y devuelve los bytes en base64.
//
// Endpoint: POST /functions/v1/label-proxy
// Body:     { action: "fetch-label", url: string }
//
// Requiere JWT de un usuario autenticado del CRM.
// SUPABASE_URL y SUPABASE_ANON_KEY los inyecta la plataforma.

// @ts-ignore — Deno-only import, resuelto en deploy
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore — Deno global disponible en runtime
declare const Deno: { env: { get(key: string): string | undefined } }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')      ?? ''
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type':                 'application/json',
}

const FETCH_TIMEOUT_MS = 15_000

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

// SSRF guard: la URL la provee el cliente. Solo http(s), nunca hosts internos.
function isSafeUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0' || h.endsWith('.local')) return false
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return false
  if (/^169\.254\./.test(h)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false
  return true
}

// Clasifica el formato por content-type y magic bytes.
function classifyFormat(contentType: string, b: Uint8Array): 'pdf' | 'image' | 'unsupported' {
  const ct = contentType.toLowerCase()
  const isPdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46           // %PDF
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47           // .PNG
  const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff                            // JPEG
  if (ct.includes('application/pdf') || isPdf) return 'pdf'
  if (ct.includes('image/png') || ct.includes('image/jpeg') || isPng || isJpg) return 'image'
  return 'unsupported'
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

  let body: { action?: string; url?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
      { status: 400, headers: CORS_HEADERS })
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url || !isSafeUrl(url)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid or disallowed URL' }),
      { status: 200, headers: CORS_HEADERS })
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(url, {
        signal:  ctrl.signal,
        headers: { 'User-Agent': 'SupplyChainMX-CRM/1.0 label-proxy' },
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) {
      console.error(`[label-proxy] upstream ${res.status} for ${url}`)
      return new Response(JSON.stringify({ ok: false, error: `upstream ${res.status}` }),
        { status: 200, headers: CORS_HEADERS })
    }
    const ab = await res.arrayBuffer()
    const format = classifyFormat(res.headers.get('content-type') ?? '', new Uint8Array(ab))
    return new Response(
      JSON.stringify({
        ok:          true,
        format,
        contentType: res.headers.get('content-type') ?? '',
        base64:      base64Encode(ab),
      }),
      { status: 200, headers: CORS_HEADERS },
    )
  } catch (e) {
    console.error('[label-proxy] fetch failed:', e instanceof Error ? e.message : String(e))
    return new Response(JSON.stringify({ ok: false, error: 'Failed to fetch label' }),
      { status: 200, headers: CORS_HEADERS })
  }
})
