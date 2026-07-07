// Extensiv 3PL Warehouse Manager — API proxy
// Deployed as a Supabase Edge Function (Deno runtime).
//
// Secrets required (set via: npx supabase secrets set KEY=value):
//   EXTENSIV_CLIENT_ID
//   EXTENSIV_CLIENT_SECRET
//   EXTENSIV_USER_LOGIN       (email registered with 3PL Central)
//   EXTENSIV_BASE_URL         (default: https://secure-wms.com)
//
// Request body from frontend:
//   { method: "GET"|"POST"|"PUT"|"DELETE", path: "/orders", query?: {...}, body?: {...} }

// @ts-ignore — Deno-only import, resolved at deploy time
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// @ts-ignore — Deno global available at runtime
declare const Deno: { env: { get(key: string): string | undefined } }

const CLIENT_ID     = Deno.env.get('EXTENSIV_CLIENT_ID')     ?? ''
const CLIENT_SECRET = Deno.env.get('EXTENSIV_CLIENT_SECRET') ?? ''
const USER_LOGIN    = Deno.env.get('EXTENSIV_USER_LOGIN')    ?? ''
const BASE_URL      = Deno.env.get('EXTENSIV_BASE_URL')      ?? 'https://secure-wms.com'

// CRM es consumidor casi 100% read-only de Extensiv. La ÚNICA escritura
// permitida es dar de alta items (SKUs) faltantes en el catálogo de un cliente
// (POST /customers/{id}/items) desde el Paso 1 del wizard de Entradas, y solo
// si EXTENSIV_WRITE_ENABLED='true'. Todo lo demás sigue bloqueado.
const WRITE_ENABLED = Deno.env.get('EXTENSIV_WRITE_ENABLED') === 'true'

// Allowlist de escritura: pares (método, patrón de path) explícitamente permitidos.
const WRITE_ALLOWLIST: Array<{ method: string; re: RegExp }> = [
  { method: 'POST', re: /^\/customers\/\d+\/items$/ },
]

function isWriteAllowed(method: string, path: string): boolean {
  return WRITE_ALLOWLIST.some(rule => rule.method === method && rule.re.test(path))
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type':                 'application/json',
}

// ── Token cache (55 min, stays warm between invocations within same isolate) ──
let _token: string | null = null
let _tokenExpiry = 0

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token
  if (!CLIENT_ID || !CLIENT_SECRET || !USER_LOGIN) {
    throw new Error('Extensiv credentials missing. Set EXTENSIV_CLIENT_ID, EXTENSIV_CLIENT_SECRET, EXTENSIV_USER_LOGIN as Supabase secrets.')
  }
  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
  const res = await fetch(`${BASE_URL}/AuthServer/api/Token`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Accept':        'application/json',
      'Authorization': `Basic ${basic}`,
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      user_login: USER_LOGIN,
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Extensiv auth failed (${res.status}): ${txt}`)
  }
  const data = await res.json()
  _token = data.access_token
  _tokenExpiry = Date.now() + Math.max(0, (data.expires_in ?? 3600) - 300) * 1000
  return _token!
}

interface ProxyBody {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path?:   string
  query?:  Record<string, string | number | boolean>
  body?:   unknown
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status:  405,
      headers: CORS_HEADERS,
    })
  }

  let payload: ProxyBody
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status:  400,
      headers: CORS_HEADERS,
    })
  }

  const { method = 'GET', path, query, body } = payload
  if (!path || typeof path !== 'string' || !path.startsWith('/')) {
    return new Response(JSON.stringify({ error: 'path is required and must start with /' }), {
      status:  400,
      headers: CORS_HEADERS,
    })
  }

  if (method !== 'GET' && !(WRITE_ENABLED && isWriteAllowed(method, path))) {
    return new Response(JSON.stringify({
      error: 'Extensiv proxy: escritura no permitida. Solo GET (y alta de items si está habilitada).',
    }), { status: 403, headers: CORS_HEADERS })
  }

  let token: string
  try {
    token = await getAccessToken()
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status:  500,
      headers: CORS_HEADERS,
    })
  }

  const url = new URL(`${BASE_URL}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
  }

  const upstream = await fetch(url.toString(), {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/hal+json',
      'Content-Type':  'application/hal+json; charset=utf-8',
    },
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  })

  const text = await upstream.text()
  // If Extensiv returned JSON, pass it through; otherwise wrap the text
  let responseBody: string
  try {
    JSON.parse(text)
    responseBody = text
  } catch {
    responseBody = JSON.stringify({ raw: text })
  }

  return new Response(responseBody, {
    status:  upstream.ok ? 200 : 502,
    headers: {
      ...CORS_HEADERS,
      'x-extensiv-status': String(upstream.status),
    },
  })
})
