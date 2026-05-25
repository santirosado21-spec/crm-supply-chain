// FedEx REST API — proxy edge function (Deno runtime).
//
// Centraliza la autenticación OAuth2 de FedEx y expone tres acciones al CRM:
//   rates → POST /rate/v1/rates/quotes
//   ship  → POST /ship/v1/shipments
//   track → POST /track/v1/trackingnumbers
//
// Secrets requeridos (npx supabase secrets set KEY=value):
//   FEDEX_CLIENT_ID
//   FEDEX_CLIENT_SECRET
//   FEDEX_ACCOUNT
//   FEDEX_BASE_URL   (opcional — default https://apis.fedex.com; sandbox: https://apis-sandbox.fedex.com)
//
// Request body desde el frontend:
//   { action: "auth" | "rates" | "ship" | "track", payload?: {...} }

// @ts-ignore — Deno-only import, resuelto en deploy
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore — Deno global disponible en runtime
declare const Deno: { env: { get(key: string): string | undefined } }

const CLIENT_ID     = Deno.env.get('FEDEX_CLIENT_ID')     ?? ''
const CLIENT_SECRET = Deno.env.get('FEDEX_CLIENT_SECRET') ?? ''
const ACCOUNT       = Deno.env.get('FEDEX_ACCOUNT')       ?? ''
const BASE_URL      = Deno.env.get('FEDEX_BASE_URL')      ?? 'https://apis.fedex.com'
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')        ?? ''
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')   ?? ''

// Verifica que la petición venga de un usuario autenticado del CRM. El proxy
// crea envíos FedEx reales y facturables — sin esta comprobación cualquiera
// con la URL pública podría gastar dinero en la cuenta de la empresa.
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type':                 'application/json',
}

// ── Token cache (50 min — el access_token de FedEx vive 60 min) ──
let _token: string | null = null
let _tokenExpiry = 0

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('FedEx credentials missing. Set FEDEX_CLIENT_ID, FEDEX_CLIENT_SECRET, FEDEX_ACCOUNT as Supabase secrets.')
  }
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  if (!res.ok) {
    // Log server-side; el cuerpo del error de FedEx puede incluir client_id u
    // otros detalles de credenciales — no se devuelve al cliente.
    console.error(`[fedex-proxy] OAuth failed (${res.status}):`, await res.text())
    throw new Error('FedEx authentication failed')
  }
  const data = await res.json()
  _token = data.access_token
  // expires_in viene en segundos; renovamos 10 min antes.
  _tokenExpiry = Date.now() + Math.max(0, (data.expires_in ?? 3600) - 600) * 1000
  return _token!
}

const ENDPOINTS: Record<string, string> = {
  rates: '/rate/v1/rates/quotes',
  ship:  '/ship/v1/shipments',
  track: '/track/v1/trackingnumbers',
}

interface ProxyBody {
  action?:  'auth' | 'rates' | 'ship' | 'track'
  payload?: unknown
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS })
  }

  if (!(await isAuthenticated(req))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS })
  }

  let body: ProxyBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS_HEADERS })
  }

  const action = body.action ?? 'rates'

  // auth → solo verifica que el token se obtiene (health-check de credenciales).
  if (action === 'auth') {
    try {
      await getAccessToken()
      return new Response(JSON.stringify({ ok: true, account: ACCOUNT }), { headers: CORS_HEADERS })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        { status: 500, headers: CORS_HEADERS })
    }
  }

  const path = ENDPOINTS[action]
  if (!path) {
    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: CORS_HEADERS })
  }

  let token: string
  try {
    token = await getAccessToken()
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: CORS_HEADERS })
  }

  // Inyecta el accountNumber (secreto) en rates/ship — el frontend no lo conoce.
  let payload: Record<string, unknown> = (body.payload as Record<string, unknown>) ?? {}
  if ((action === 'rates' || action === 'ship') && ACCOUNT) {
    payload = { accountNumber: { value: ACCOUNT }, ...payload }
  }

  const upstream = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization':       `Bearer ${token}`,
      'Content-Type':        'application/json',
      'X-locale':            'es_MX',
    },
    body: JSON.stringify(payload),
  })

  const text = await upstream.text()
  let responseBody: string
  try { JSON.parse(text); responseBody = text }
  catch { responseBody = JSON.stringify({ raw: text }) }

  return new Response(responseBody, {
    status:  upstream.ok ? 200 : 502,
    headers: { ...CORS_HEADERS, 'x-fedex-status': String(upstream.status) },
  })
})
