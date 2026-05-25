// Webhook público de tracking de carriers (Deno runtime).
//
// Endpoint: POST /functions/v1/carrier-tracking-webhook?provider=skydropx|fedex
//
// Flujo:
//   1. Valida la firma HMAC del provider (si hay secret configurado).
//   2. Parsea el payload según el provider.
//   3. Inserta un shipment_tracking_events.
//   4. Actualiza guias_paqueteria.tracking_status (+ actual_delivery_date si
//      el paquete fue entregado).
//
// Secrets opcionales (npx supabase secrets set KEY=value):
//   SKYDROPX_WEBHOOK_SECRET
//   FEDEX_WEBHOOK_SECRET
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma.

// @ts-ignore — Deno-only imports, resueltos en deploy
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore — Deno global
declare const Deno: { env: { get(key: string): string | undefined } }

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SKYDROPX_SECRET = Deno.env.get('SKYDROPX_WEBHOOK_SECRET') ?? ''
const FEDEX_SECRET    = Deno.env.get('FEDEX_WEBHOOK_SECRET') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type':                 'application/json',
}

// Estado normalizado del CRM.
type TrackingStatus = 'comprado' | 'en_transito' | 'entregado' | 'excepcion' | 'devuelto'

interface ParsedEvent {
  tracking_number: string
  status:          TrackingStatus
  status_detail:   string
  location:        string
  occurred_at:     string | null
}

// Mapeo de estados crudos → enum del CRM.
function normalizeStatus(raw: string): TrackingStatus {
  const s = raw.toLowerCase()
  if (/(deliver|entreg)/.test(s))               return 'entregado'
  if (/(return|devuel|rechaz)/.test(s))         return 'devuelto'
  if (/(exception|excep|fail|incident|delay)/.test(s)) return 'excepcion'
  if (/(transit|tránsito|transito|out.?for|pickup|recolec)/.test(s)) return 'en_transito'
  return 'comprado'
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Comparación en tiempo constante — evita timing attacks sobre la firma.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── Parsers por provider ─────────────────────────────────────────────────────
function parseSkydropx(json: Record<string, unknown>): ParsedEvent | null {
  const data = (json.data ?? json) as Record<string, unknown>
  const attrs = (data.attributes ?? data) as Record<string, unknown>
  const tracking = String(attrs.tracking_number ?? json.tracking_number ?? '')
  if (!tracking) return null
  const rawStatus = String(attrs.status ?? attrs.tracking_status ?? json.status ?? '')
  return {
    tracking_number: tracking,
    status:          normalizeStatus(rawStatus),
    status_detail:   String(attrs.status_detail ?? rawStatus),
    location:        String(attrs.location ?? ''),
    occurred_at:     (attrs.updated_at as string) ?? new Date().toISOString(),
  }
}

function parseFedex(json: Record<string, unknown>): ParsedEvent | null {
  // FedEx Track Notification payload.
  const results = json.completeTrackResults as Array<Record<string, unknown>> | undefined
  const track = results?.[0]?.trackResults as Array<Record<string, unknown>> | undefined
  const tr = track?.[0]
  const tni = (tr?.trackingNumberInfo ?? {}) as Record<string, unknown>
  const tracking = String(tni.trackingNumber ?? json.trackingNumber ?? '')
  if (!tracking) return null
  const latest = (tr?.latestStatusDetail ?? {}) as Record<string, unknown>
  const rawStatus = String(latest.statusByLocale ?? latest.description ?? json.status ?? '')
  return {
    tracking_number: tracking,
    status:          normalizeStatus(rawStatus),
    status_detail:   rawStatus,
    location:        '',
    occurred_at:     new Date().toISOString(),
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS })
  }

  const url = new URL(req.url)
  const provider = (url.searchParams.get('provider') ?? '').toLowerCase()
  const rawBody = await req.text()

  // Autenticidad: el endpoint es público (los carriers no mandan JWT de
  // Supabase), así que la ÚNICA defensa es la firma HMAC. Fail-closed: sin un
  // secret configurado para el provider, o sin una firma válida presente, la
  // petición se rechaza. Nunca se acepta un payload sin verificar.
  const secret = provider === 'skydropx' ? SKYDROPX_SECRET
               : provider === 'fedex'    ? FEDEX_SECRET : ''
  if (!secret) {
    return new Response(
      JSON.stringify({ error: 'Webhook signature secret not configured for this provider' }),
      { status: 503, headers: CORS },
    )
  }
  const sigHeader = (req.headers.get('x-webhook-signature')
    ?? req.headers.get('x-signature') ?? '').replace(/^sha256=/, '')
  const expected = await hmacHex(secret, rawBody)
  if (!sigHeader || !timingSafeEqual(sigHeader, expected)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: CORS })
  }

  let json: Record<string, unknown>
  try { json = JSON.parse(rawBody) }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS }) }

  const event = provider === 'fedex' ? parseFedex(json) : parseSkydropx(json)
  if (!event) {
    return new Response(JSON.stringify({ error: 'No tracking number in payload' }), { status: 422, headers: CORS })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Localiza la guía por tracking number.
  const { data: guia } = await supabase
    .from('guias_paqueteria')
    .select('id')
    .eq('tracking_number', event.tracking_number)
    .maybeSingle()

  if (!guia) {
    return new Response(JSON.stringify({ ok: false, note: 'Guía no encontrada', tracking: event.tracking_number }),
      { status: 200, headers: CORS })
  }

  // Inserta el evento de tracking. Si falla, devuelve 500 para que el carrier
  // reintente — no se debe perder el evento en silencio.
  const evtRes = await supabase.from('shipment_tracking_events').insert({
    guia_id:       guia.id,
    provider,
    status:        event.status,
    status_detail: event.status_detail,
    location:      event.location,
    occurred_at:   event.occurred_at,
    raw_payload:   json,
  })
  if (evtRes.error) {
    console.error('[webhook] insert tracking event failed:', evtRes.error.message)
    return new Response(JSON.stringify({ error: 'Failed to record tracking event' }),
      { status: 500, headers: CORS })
  }

  // Actualiza la guía.
  const update: Record<string, unknown> = { tracking_status: event.status }
  if (event.status === 'entregado') {
    update.actual_delivery_date = (event.occurred_at ?? new Date().toISOString()).slice(0, 10)
  }
  const updRes = await supabase.from('guias_paqueteria').update(update).eq('id', guia.id)
  if (updRes.error) {
    console.error('[webhook] update guia failed:', updRes.error.message)
    return new Response(JSON.stringify({ error: 'Failed to update guia status' }),
      { status: 500, headers: CORS })
  }

  return new Response(JSON.stringify({ ok: true, guia_id: guia.id, status: event.status }), { headers: CORS })
})
