// Webhook público de intake de leads (Deno runtime).
//
// Endpoint: POST /functions/v1/leads-intake-webhook
//
// Origen: el formulario "Solicita tu cotización" de supply-chain-mexico-web
// (repo separado: /Users/santiagorosado/Desktop/Landing Page mexico), vía un
// proxy serverless propio de ese sitio (api/lead-intake.js) que agrega el
// header Authorization. El navegador nunca ve el secret.
//
// Auth: shared secret simple (Bearer), no HMAC — a diferencia de
// carrier-tracking-webhook/extensiv-webhook (proveedores externos que firman
// su payload), aquí controlamos ambos extremos: el secret vive server-side
// en el proxy de la landing y aquí, nunca en el navegador.
//
// Flujo:
//   1. Valida el shared secret.
//   2. Parsea el payload del formulario (nombre, empresa, correo, telefono,
//      servicio, mensaje — nombres tal cual los usa el form real).
//   3. Inserta en `leads` con canal='landing_page', estatus='lead_entrante'.
//   4. Notifica al equipo comercial vía notify-task-email (best-effort).
//
// Secrets (npx supabase secrets set KEY=value):
//   LEADS_INTAKE_SECRET   — shared secret que valida el request entrante
//   COMERCIAL_ALERT_EMAIL — a quién avisar de leads nuevos sin asignar
//   EDGE_SHARED_SECRET    — ya existe, lo usa notify-task-email
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma.

// @ts-ignore — Deno-only imports, resueltos en deploy
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore — Deno global
declare const Deno: { env: { get(key: string): string | undefined } }

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY           = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const LEADS_INTAKE_SECRET   = Deno.env.get('LEADS_INTAKE_SECRET') ?? ''
const COMERCIAL_ALERT_EMAIL = Deno.env.get('COMERCIAL_ALERT_EMAIL') ?? ''
const EDGE_SHARED_SECRET    = Deno.env.get('EDGE_SHARED_SECRET') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type':                 'application/json',
}

// Comparación en tiempo constante — evita timing attacks sobre el secret.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Payload tal cual lo arma el formulario real (index.html + js/main.js de
// supply-chain-mexico-web) — no renombrar sin actualizar los dos repos.
interface LandingFormPayload {
  nombre?:    string
  empresa?:   string
  correo?:    string
  telefono?:  string
  servicio?:  string
  mensaje?:   string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS })
  }

  if (!LEADS_INTAKE_SECRET) {
    return new Response(JSON.stringify({ error: 'LEADS_INTAKE_SECRET not configured' }), { status: 503, headers: CORS })
  }
  const auth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!timingSafeEqual(auth, LEADS_INTAKE_SECRET)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
  }

  let body: LandingFormPayload
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS })
  }

  const nombre = (body.nombre ?? '').trim()
  const servicio = (body.servicio ?? '').trim()
  if (!nombre || !servicio) {
    return new Response(JSON.stringify({ error: 'Missing required fields: nombre, servicio' }), { status: 422, headers: CORS })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: lead, error: insertError } = await supabase
    .from('leads')
    .insert({
      nombre,
      empresa:           (body.empresa ?? '').trim() || null,
      correo:            (body.correo ?? '').trim() || null,
      telefono:          (body.telefono ?? '').trim() || null,
      canal:             'landing_page',
      servicio_interes:  servicio,
      notas_comerciales: (body.mensaje ?? '').trim() || null,
      estatus:           'lead_entrante',
      nivel_interes:      'frio',
      prioridad:         'media',
      created_by:        'landing-page-webhook',
    })
    .select()
    .single()

  if (insertError) {
    console.error('[leads-intake-webhook] insert failed:', insertError.message)
    return new Response(JSON.stringify({ error: 'Failed to create lead', detail: insertError.message }), { status: 500, headers: CORS })
  }

  // Aviso best-effort al equipo comercial — un fallo aquí no debe tirar el
  // 200 al formulario, el lead ya quedó guardado.
  if (COMERCIAL_ALERT_EMAIL && EDGE_SHARED_SECRET) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/notify-task-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${EDGE_SHARED_SECRET}` },
        body: JSON.stringify({
          to: COMERCIAL_ALERT_EMAIL,
          subject: `[Supply Chain] Nuevo lead desde la landing: ${nombre}`,
          html:
            `<p>Nuevo lead <strong>${nombre}</strong>${lead.empresa ? ` (${lead.empresa})` : ''} desde la landing page.</p>` +
            `<p>Servicio de interés: ${servicio}</p>` +
            `<p>Correo: ${lead.correo ?? '—'} · Teléfono: ${lead.telefono ?? '—'}</p>` +
            `<p>Asígnalo en el CRM: /comercial/leads/${lead.id}</p>`,
        }),
      })
    } catch (e) {
      console.error('[leads-intake-webhook] notify failed:', e)
    }
  }

  return new Response(JSON.stringify({ ok: true, lead_id: lead.id, ref: lead.ref }), { headers: CORS })
})
