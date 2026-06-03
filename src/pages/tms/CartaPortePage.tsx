import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FileText, ChevronDown, ChevronRight, MapPin, Truck, User as UserIcon,
  Package, Save, FileDown, Code, Plus, X, AlertTriangle, Loader2, RotateCcw,
  Settings, History, Link2,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useCartasPorte } from '../../hooks/useCartasPorte'
import { useVehiculos } from '../../hooks/useVehiculos'
import { useOperadores } from '../../hooks/useOperadores'
import { useViajes } from '../../hooks/useViajes'
import type { Viaje } from '../../types/tms'
import {
  EMPTY_UBICACION, EMPTY_MERCANCIA, EMPTY_TRANSPORTE, EMPTY_FIGURA,
  type Ubicacion, type Mercancia, type Transporte, type Figura, type CartaPorte,
} from '../../types/cartaPorte'
import { generarCartaPortePDF } from '../../lib/cartaPortePdf'
import { generarCartaPorteXML } from '../../lib/cartaPorteXml'
import { CLAVES_UNIDAD } from '../../lib/satCatalogs'

interface EmisorConfig {
  rfc: string
  razon_social: string
  regimen_fiscal_sat: string
  cp_expedicion: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
// Parsea el campo `notas` que escribe el Cotizador en handleAddToBitacora.
// Formato esperado:
//   "Cotización #1234 · Cliente: Linet · Operador: Rubén · Maniobrista: X · 1 día(s) · Modelo (Placas) · Carga: 5 tarimas · [DADIVA: $200]"
function parseViajeNotas(notas: string | null | undefined): {
  cliente?: string
  carga?: string
} {
  if (!notas) return {}
  const out: { cliente?: string; carga?: string } = {}
  const m1 = notas.match(/Cliente:\s*([^·]+?)(?=\s*·|\s*$)/i)
  if (m1) out.cliente = m1[1].trim()
  const m2 = notas.match(/Carga:\s*([^·]+?)(?=\s*·|\s*$)/i)
  if (m2) out.carga = m2[1].trim()
  return out
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Styles ───────────────────────────────────────────────────────────────────
const inp = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-[#1e3a5f] focus:bg-white focus:ring-1 focus:ring-[#1e3a5f]/20 transition-colors'
const lbl = 'block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1'
const sec = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4'
const secTitle = 'flex items-center gap-2 text-sm font-bold text-[#1e3a5f] mb-4'

// ── Collapsible (espejo del patrón en CotizadorPage) ─────────────────────────
function Collapsible({ title, icon, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={sec}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="flex items-center justify-between w-full"
      >
        <span className={`${secTitle} mb-0`}>{icon}{title}</span>
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  )
}

// ── Inputs reusables ─────────────────────────────────────────────────────────
function UbicacionForm({ value, onChange }: { value: Ubicacion; onChange: (u: Ubicacion) => void }) {
  const setField = <K extends keyof Ubicacion>(k: K, v: Ubicacion[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className={lbl}>RFC</label>
        <input className={inp} maxLength={13} placeholder="XAXX010101000"
          value={value.rfc} onChange={e => setField('rfc', e.target.value.toUpperCase())} />
      </div>
      <div>
        <label className={lbl}>Nombre / Razón social</label>
        <input className={inp} value={value.nombre} onChange={e => setField('nombre', e.target.value)} />
      </div>
      <div>
        <label className={lbl}>Calle</label>
        <input className={inp} value={value.calle} onChange={e => setField('calle', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Número</label>
          <input className={inp} value={value.numext} onChange={e => setField('numext', e.target.value)} />
        </div>
        <div>
          <label className={lbl}>C.P.</label>
          <input className={inp} maxLength={5} placeholder="52004"
            value={value.cp} onChange={e => setField('cp', e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </div>
      </div>
      <div>
        <label className={lbl}>Colonia</label>
        <input className={inp} value={value.colonia} onChange={e => setField('colonia', e.target.value)} />
      </div>
      <div>
        <label className={lbl}>Municipio</label>
        <input className={inp} value={value.municipio} onChange={e => setField('municipio', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={lbl}>Estado</label>
        <input className={inp} value={value.estado} onChange={e => setField('estado', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={lbl}>Referencia (opcional)</label>
        <input className={inp} value={value.referencia ?? ''} onChange={e => setField('referencia', e.target.value)} />
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export function CartaPortePage() {
  const navigate = useNavigate()
  const { user } = useAuthContext()
  const toast = useToast()
  const { cartas, loading: loadingHist, createCartaPorte, updateCartaPorte } = useCartasPorte()
  const { vehiculos } = useVehiculos({ esPropio: true })
  const { operadores } = useOperadores({ esPropio: true })
  // Viajes: cargamos todos y filtramos client-side por estado (useViajes solo
  // permite UN estado por filter — filtrar acá es más simple y barato).
  const { viajes } = useViajes()
  const viajesConfirmables = useMemo(
    () => viajes.filter(v => ['asignado','en_transito','entregado','completado'].includes(v.estado)),
    [viajes],
  )

  // Emisor
  const [emisor, setEmisor] = useState<EmisorConfig | null>(null)
  const [emisorLoading, setEmisorLoading] = useState(true)

  // Form state
  const [remitente, setRemitente] = useState<Ubicacion>(EMPTY_UBICACION)
  const [destinatarios, setDestinatarios] = useState<Ubicacion[]>([{ ...EMPTY_UBICACION }])
  const [transporte, setTransporte] = useState<Transporte>(EMPTY_TRANSPORTE)
  const [unidadClave, setUnidadClave] = useState('')
  const [figura, setFigura] = useState<Figura>(EMPTY_FIGURA)
  const [operadorNombreSel, setOperadorNombreSel] = useState('')
  const [mercancias, setMercancias] = useState<Mercancia[]>([{ ...EMPTY_MERCANCIA }])
  const [notas, setNotas] = useState('')

  const [busy, setBusy] = useState(false)
  const [lastFolio, setLastFolio] = useState<string | null>(null)
  // Ligado a viaje (opcional, trazabilidad + auto-llenado)
  const [viajeId, setViajeId] = useState<string | null>(null)
  const viajeLigado = useMemo(
    () => viajes.find(v => v.id === viajeId) ?? null,
    [viajes, viajeId],
  )

  // Cargar emisor_config
  useEffect(() => {
    supabase.from('emisor_config').select('*').eq('id', 1).single().then(({ data, error }) => {
      if (data && !error) {
        setEmisor({
          rfc: (data as { rfc: string }).rfc,
          razon_social: (data as { razon_social: string }).razon_social,
          regimen_fiscal_sat: (data as { regimen_fiscal_sat: string }).regimen_fiscal_sat,
          cp_expedicion: (data as { cp_expedicion: string }).cp_expedicion,
        })
      }
      setEmisorLoading(false)
    })
  }, [])

  // Auto-completar placas desde unidad seleccionada
  useEffect(() => {
    if (!unidadClave) return
    const u = vehiculos.find(v => v.clave === unidadClave)
    if (u) {
      setTransporte(t => ({ ...t, placas: u.placa }))
    }
  }, [unidadClave, vehiculos])

  // Auto-completar nombre del operador desde catálogo
  useEffect(() => {
    if (!operadorNombreSel) return
    setFigura(f => ({ ...f, operadorNombre: operadorNombreSel }))
  }, [operadorNombreSel])

  // Totales
  const totalPesoBruto = useMemo(() => mercancias.reduce((s, m) => s + (m.pesoBruto || 0), 0), [mercancias])
  const totalPesoNeto  = useMemo(() => mercancias.reduce((s, m) => s + (m.pesoNeto  || 0), 0), [mercancias])

  const emisorIncompleto = !emisor || !emisor.rfc || emisor.rfc === 'XAXX010101000' || emisor.razon_social.includes('placeholder')

  // ── Mercancías helpers ────────────────────────────────────────────────────
  const addMercancia = () => setMercancias(prev => [...prev, { ...EMPTY_MERCANCIA }])
  const removeMercancia = (idx: number) => setMercancias(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  const updateMercancia = (idx: number, patch: Partial<Mercancia>) =>
    setMercancias(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))

  // ── Destinatarios helpers ─────────────────────────────────────────────────
  const addDestinatario = () => setDestinatarios(prev => [...prev, { ...EMPTY_UBICACION }])
  const removeDestinatario = (idx: number) => setDestinatarios(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  // ── Ligar a viaje + auto-llenado ──────────────────────────────────────────
  const prefillFromViaje = (v: Viaje) => {
    setViajeId(v.id)
    // Vehículo: placas, línea, peso bruto vehicular, selector unidad
    const veh = vehiculos.find(x => x.id === v.vehiculo_id)
    if (veh) {
      setTransporte(t => ({
        ...t,
        placas: veh.placa,
        linea: veh.es_propio
          ? (emisor?.razon_social ?? 'Supply Chain MX')
          : (veh.proveedor_nombre ?? t.linea),
        pesoBrutoVehicular: veh.capacidad_kg > 0 ? veh.capacidad_kg : t.pesoBrutoVehicular,
      }))
      setUnidadClave(veh.clave)
    }
    // Operador: nombre + licencia (RFC no — operadores no lo tiene aún)
    const op = operadores.find(x => x.id === v.operador_id)
    if (op) {
      setFigura(f => ({
        ...f,
        operadorNombre: op.nombre,
        operadorLicencia: op.licencia_numero || f.operadorLicencia,
      }))
      setOperadorNombreSel(op.nombre)
    }
    // Cliente + carga del campo notas del Cotizador
    const { cliente, carga } = parseViajeNotas(v.notas)
    if (cliente) {
      setDestinatarios(prev => {
        const next = [...prev]
        next[0] = { ...(next[0] ?? EMPTY_UBICACION), nombre: cliente, referencia: v.destino || (next[0]?.referencia ?? '') }
        return next
      })
    } else if (v.destino) {
      setDestinatarios(prev => {
        const next = [...prev]
        next[0] = { ...(next[0] ?? EMPTY_UBICACION), referencia: v.destino }
        return next
      })
    }
    if (carga) {
      setMercancias(prev => {
        const next = [...prev]
        next[0] = { ...(next[0] ?? EMPTY_MERCANCIA), descripcion: carga }
        return next
      })
    }
    // Referencia del remitente = origen del viaje
    if (v.origen) {
      setRemitente(r => ({ ...r, referencia: v.origen }))
    }
    toast.success('Datos auto-llenados del viaje', 'Revisa y completa lo que falta (RFCs, dirección, clave SAT).')
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setRemitente(EMPTY_UBICACION)
    setDestinatarios([{ ...EMPTY_UBICACION }])
    setTransporte(EMPTY_TRANSPORTE)
    setUnidadClave('')
    setFigura(EMPTY_FIGURA)
    setOperadorNombreSel('')
    setMercancias([{ ...EMPTY_MERCANCIA }])
    setNotas('')
    setLastFolio(null)
    setViajeId(null)
  }

  // ── Validación mínima ─────────────────────────────────────────────────────
  function validate(): string | null {
    if (emisorIncompleto) return 'Configura el emisor antes de generar.'
    if (!remitente.rfc || !remitente.cp)     return 'Remitente: RFC y C.P. son obligatorios.'
    if (destinatarios.length === 0)          return 'Agrega al menos un destinatario.'
    if (destinatarios.some(d => !d.rfc || !d.cp)) return 'Cada destinatario requiere RFC y C.P.'
    if (!transporte.placas)                  return 'Placas del vehículo son obligatorias.'
    if (transporte.pesoBrutoVehicular <= 0)  return 'Peso bruto vehicular obligatorio (SAT).'
    if (!figura.operadorRfc || !figura.operadorLicencia) return 'Figura del transporte: RFC y licencia del operador.'
    if (mercancias.length === 0)             return 'Agrega al menos una mercancía.'
    if (mercancias.some(m => !m.descripcion || m.pesoBruto <= 0)) {
      return 'Cada mercancía requiere descripción y peso bruto > 0.'
    }
    return null
  }

  // ── Guardar borrador ──────────────────────────────────────────────────────
  const handleSaveBorrador = async () => {
    setBusy(true)
    try {
      const cp = await createCartaPorte({
        fecha: new Date().toISOString(),
        status: 'borrador',
        emisor_rfc: emisor?.rfc ?? null,
        emisor_razon_social: emisor?.razon_social ?? null,
        emisor_regimen_fiscal: emisor?.regimen_fiscal_sat ?? null,
        emisor_cp_expedicion: emisor?.cp_expedicion ?? null,
        remitente,
        destinatarios,
        transporte,
        figura,
        mercancias,
        total_peso_bruto: totalPesoBruto,
        total_peso_neto: totalPesoNeto,
        xml_content: null,
        pdf_url: null,
        uuid_sat: null,
        notas,
        creado_por: user?.name ?? user?.email ?? 'TMS',
        viaje_id: viajeId,
      })
      setLastFolio(cp.folio)
      toast.success('Borrador guardado', `Folio ${cp.folio}`)
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Construye el objeto CartaPorte completo (sin id) para los generadores.
  // Si ya hay un borrador con folio, usamos ese — si no, generamos uno temporal solo para el archivo.
  const buildSnapshot = (): CartaPorte => ({
    id: '',
    folio: lastFolio ?? `CP-TMP-${Date.now()}`,
    fecha: new Date().toISOString(),
    status: 'borrador',
    emisor_rfc: emisor?.rfc ?? null,
    emisor_razon_social: emisor?.razon_social ?? null,
    emisor_regimen_fiscal: emisor?.regimen_fiscal_sat ?? null,
    emisor_cp_expedicion: emisor?.cp_expedicion ?? null,
    remitente,
    destinatarios,
    transporte,
    figura,
    mercancias,
    total_peso_bruto: totalPesoBruto,
    total_peso_neto: totalPesoNeto,
    xml_content: null,
    pdf_url: null,
    uuid_sat: null,
    notas,
    creado_por: user?.name ?? '',
    created_at: new Date().toISOString(),
    viaje_id: viajeId,
  })

  // ── Generar PDF ───────────────────────────────────────────────────────────
  const handleGenerarPDF = async () => {
    const err = validate()
    if (err) { toast.error('Faltan datos', err); return }
    setBusy(true)
    try {
      const snap = buildSnapshot()
      const blob = await generarCartaPortePDF(snap)
      downloadBlob(blob, `${snap.folio}.pdf`)
      toast.success('PDF generado', `${snap.folio}.pdf descargado`)
    } catch (e) {
      toast.error('Error generando PDF', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // ── Generar XML ───────────────────────────────────────────────────────────
  const handleGenerarXML = async () => {
    const err = validate()
    if (err) { toast.error('Faltan datos', err); return }
    setBusy(true)
    try {
      let snap = buildSnapshot()

      // Si no hay borrador guardado, guardarlo ahora para tener folio real y persistir XML.
      if (!lastFolio) {
        const cp = await createCartaPorte({
          fecha: snap.fecha,
          status: 'borrador',
          emisor_rfc: snap.emisor_rfc,
          emisor_razon_social: snap.emisor_razon_social,
          emisor_regimen_fiscal: snap.emisor_regimen_fiscal,
          emisor_cp_expedicion: snap.emisor_cp_expedicion,
          remitente, destinatarios, transporte, figura, mercancias,
          total_peso_bruto: totalPesoBruto,
          total_peso_neto: totalPesoNeto,
          xml_content: null,
          pdf_url: null,
          uuid_sat: null,
          notas,
          creado_por: user?.name ?? user?.email ?? 'TMS',
          viaje_id: viajeId,
        })
        setLastFolio(cp.folio)
        snap = { ...snap, id: cp.id, folio: cp.folio }
      }

      const xml = generarCartaPorteXML(snap)
      downloadBlob(new Blob([xml], { type: 'application/xml' }), `${snap.folio}.xml`)

      // Persistir el XML y marcar como exportada
      if (snap.id) {
        await updateCartaPorte(snap.id, { xml_content: xml, status: 'exportada' })
      }
      toast.success('XML CFDI 4.0 generado', `${snap.folio}.xml — sin timbrar`)
    } catch (e) {
      toast.error('Error generando XML', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // ── Cargar carta porte desde historial ───────────────────────────────────
  const loadFromHistory = (cp: CartaPorte) => {
    setRemitente(cp.remitente)
    setDestinatarios(cp.destinatarios.length > 0 ? cp.destinatarios : [{ ...EMPTY_UBICACION }])
    setTransporte(cp.transporte)
    setFigura(cp.figura)
    setMercancias(cp.mercancias.length > 0 ? cp.mercancias : [{ ...EMPTY_MERCANCIA }])
    setNotas(cp.notas ?? '')
    setLastFolio(cp.folio)
    setViajeId(cp.viaje_id ?? null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast.success('Carta porte cargada', `Folio ${cp.folio}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6 pb-24">
          {/* Header */}
          <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f] flex items-center gap-2">
                <FileText size={20} /> Carta Porte 3.1
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Genera Cartas Porte CFDI 4.0 con complemento Carta Porte 3.1 (sin timbrar). PDF visual + XML para PAC externo.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={resetForm}
                className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50">
                <RotateCcw size={14} /> Limpiar
              </button>
            </div>
          </div>

          {/* Banner emisor incompleto */}
          {!emisorLoading && emisorIncompleto && (
            <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <AlertTriangle size={18} className="shrink-0" />
                <span>El emisor SCC no está configurado. Es obligatorio para generar Cartas Porte válidas.</span>
              </div>
              <button
                onClick={() => navigate('/wms/emisor-config')}
                className="shrink-0 h-9 px-3 rounded-lg bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 hover:opacity-90"
              >
                <Settings size={13} /> Configurar emisor
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
            <div>
              {/* Emisor read-only */}
              {emisor && !emisorIncompleto && (
                <div className={sec}>
                  <p className={secTitle}><FileText size={16} /> Emisor (Supply Chain MX)</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-gray-400">RFC:</span> <span className="font-mono font-semibold">{emisor.rfc}</span></div>
                    <div><span className="text-gray-400">Régimen:</span> <span className="font-mono font-semibold">{emisor.regimen_fiscal_sat}</span></div>
                    <div className="col-span-2"><span className="text-gray-400">Razón social:</span> <span className="font-semibold">{emisor.razon_social}</span></div>
                    <div><span className="text-gray-400">CP expedición:</span> <span className="font-mono">{emisor.cp_expedicion}</span></div>
                  </div>
                  <Link to="/wms/emisor-config" className="text-[11px] text-[#1e3a5f] hover:underline mt-2 inline-flex items-center gap-1">
                    <Settings size={11} /> Editar emisor
                  </Link>
                </div>
              )}

              {/* Remitente */}
              <Collapsible title="Remitente / Origen" icon={<MapPin size={16} />} defaultOpen>
                <UbicacionForm value={remitente} onChange={setRemitente} />
              </Collapsible>

              {/* Destinatarios */}
              <Collapsible title={`Destinatarios / Destino (${destinatarios.length})`} icon={<MapPin size={16} />} defaultOpen>
                {destinatarios.map((d, i) => (
                  <div key={i} className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-600">Destinatario #{i + 1}</p>
                      {destinatarios.length > 1 && (
                        <button onClick={() => removeDestinatario(i)}
                          className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1">
                          <X size={12} /> Quitar
                        </button>
                      )}
                    </div>
                    <UbicacionForm value={d} onChange={u => setDestinatarios(prev => prev.map((x, idx) => idx === i ? u : x))} />
                  </div>
                ))}
                <button onClick={addDestinatario}
                  className="text-sm text-[#1e3a5f] font-bold flex items-center gap-1 hover:underline">
                  <Plus size={14} /> Agregar destinatario
                </button>
              </Collapsible>

              {/* Ligar a viaje (Cotizador) */}
              {viajeLigado ? (
                <div className={sec + ' !bg-blue-50 !border-blue-200'}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-2 min-w-0">
                      <Link2 size={18} className="text-[#1e3a5f] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1e3a5f]">
                          Ligado al viaje{' '}
                          <span className="font-mono text-xs">#{viajeLigado.id.slice(0, 8)}</span>
                        </p>
                        <p className="text-xs text-gray-700 mt-0.5">
                          <span className="font-semibold">{viajeLigado.origen || '—'}</span>
                          {' → '}
                          <span className="font-semibold">{viajeLigado.destino || '—'}</span>
                          {viajeLigado.km_estimados > 0 && (
                            <span className="text-gray-500"> · {viajeLigado.km_estimados} km</span>
                          )}
                          {parseViajeNotas(viajeLigado.notas).cliente && (
                            <span className="text-gray-500"> · cliente: {parseViajeNotas(viajeLigado.notas).cliente}</span>
                          )}
                          <span className="text-gray-400"> · {viajeLigado.estado}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViajeId(null)}
                      className="shrink-0 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 flex items-center gap-1.5 hover:bg-gray-50"
                      title="Solo quita el vínculo. Los datos del form NO se borran."
                    >
                      <X size={12} /> Quitar ligado
                    </button>
                  </div>
                </div>
              ) : (
                <div className={sec}>
                  <p className={secTitle}><Link2 size={16} /> Ligar a viaje confirmado (opcional)</p>
                  <p className="text-[11px] text-gray-500 mb-3">
                    Selecciona un viaje del Cotizador para auto-llenar placas, operador, cliente y carga.
                  </p>
                  <select
                    className={inp}
                    value=""
                    onChange={e => {
                      const v = viajesConfirmables.find(x => x.id === e.target.value)
                      if (v) prefillFromViaje(v)
                    }}
                  >
                    <option value="">
                      {viajesConfirmables.length === 0
                        ? '— No hay viajes confirmados disponibles —'
                        : `— Seleccionar viaje (${viajesConfirmables.length}) —`}
                    </option>
                    {viajesConfirmables
                      .slice()
                      .sort((a, b) => (b.fecha_programada ?? '').localeCompare(a.fecha_programada ?? ''))
                      .map(v => {
                        const cliente = parseViajeNotas(v.notas).cliente
                        const ruta = `${v.origen || '—'} → ${v.destino || '—'}`
                        const fecha = v.fecha_programada
                          ? new Date(v.fecha_programada).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
                          : ''
                        return (
                          <option key={v.id} value={v.id}>
                            #{v.id.slice(0, 8)} · {ruta}{cliente ? ` · ${cliente}` : ''}{fecha ? ` · ${fecha}` : ''} · {v.estado}
                          </option>
                        )
                      })}
                  </select>
                </div>
              )}

              {/* Transporte */}
              <Collapsible title="Datos del Transporte" icon={<Truck size={16} />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Unidad (autocompleta placas)</label>
                    <select className={inp} value={unidadClave} onChange={e => setUnidadClave(e.target.value)}>
                      <option value="">— Seleccionar unidad —</option>
                      {vehiculos.map(v => (
                        <option key={v.clave} value={v.clave}>{v.placa} — {v.modelo}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Placas</label>
                    <input className={inp} value={transporte.placas} onChange={e => setTransporte(t => ({ ...t, placas: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <label className={lbl}>Línea (transportista)</label>
                    <input className={inp} value={transporte.linea} onChange={e => setTransporte(t => ({ ...t, linea: e.target.value }))} />
                  </div>
                  <div>
                    <label className={lbl}>Remolque</label>
                    <input className={inp} value={transporte.remolque} onChange={e => setTransporte(t => ({ ...t, remolque: e.target.value }))} />
                  </div>
                  <div>
                    <label className={lbl}>Peso bruto vehicular (kg) *</label>
                    <input type="number" min={0} step={0.001} className={inp}
                      value={transporte.pesoBrutoVehicular || ''}
                      onChange={e => setTransporte(t => ({ ...t, pesoBrutoVehicular: Number(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <label className={lbl}>RFC permisionario (opcional)</label>
                    <input className={inp} maxLength={13} value={transporte.rfcPermisionario ?? ''}
                      onChange={e => setTransporte(t => ({ ...t, rfcPermisionario: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
              </Collapsible>

              {/* Figura del transporte */}
              <Collapsible title="Figura del Transporte (Operador)" icon={<UserIcon size={16} />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Operador (catálogo)</label>
                    <select className={inp} value={operadorNombreSel} onChange={e => setOperadorNombreSel(e.target.value)}>
                      <option value="">— Seleccionar operador —</option>
                      {operadores.map(o => <option key={o.id} value={o.nombre}>{o.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Nombre operador</label>
                    <input className={inp} value={figura.operadorNombre}
                      onChange={e => setFigura(f => ({ ...f, operadorNombre: e.target.value }))} />
                  </div>
                  <div>
                    <label className={lbl}>RFC operador *</label>
                    <input className={inp} maxLength={13} value={figura.operadorRfc}
                      onChange={e => setFigura(f => ({ ...f, operadorRfc: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <label className={lbl}>Número de licencia *</label>
                    <input className={inp} value={figura.operadorLicencia}
                      onChange={e => setFigura(f => ({ ...f, operadorLicencia: e.target.value }))} />
                  </div>
                </div>
              </Collapsible>

              {/* Mercancías */}
              <Collapsible title={`Mercancías (${mercancias.length})`} icon={<Package size={16} />} defaultOpen>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-1 font-bold text-gray-500">Descripción *</th>
                        <th className="text-left py-2 px-1 font-bold text-gray-500">Clave SAT *</th>
                        <th className="text-left py-2 px-1 font-bold text-gray-500">Unidad SAT</th>
                        <th className="text-right py-2 px-1 font-bold text-gray-500 w-20">Cantidad</th>
                        <th className="text-right py-2 px-1 font-bold text-gray-500 w-24">Peso bruto (kg) *</th>
                        <th className="text-right py-2 px-1 font-bold text-gray-500 w-24">Peso neto (kg)</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {mercancias.map((m, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1 px-1">
                            <input className={inp} placeholder="Descripción del producto"
                              value={m.descripcion} onChange={e => updateMercancia(i, { descripcion: e.target.value })} />
                          </td>
                          <td className="py-1 px-1">
                            <input className={inp} maxLength={8} placeholder="00000000"
                              value={m.claveSat} onChange={e => updateMercancia(i, { claveSat: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
                          </td>
                          <td className="py-1 px-1">
                            <select className={inp} value={m.unidad} onChange={e => updateMercancia(i, { unidad: e.target.value })}>
                              {Object.entries(CLAVES_UNIDAD).map(([k, v]) => (
                                <option key={k} value={k}>{k} · {v}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 px-1">
                            <input type="number" min={0} step={0.01} className={inp + ' text-right'}
                              value={m.cantidad || ''} onChange={e => updateMercancia(i, { cantidad: Number(e.target.value) || 0 })} />
                          </td>
                          <td className="py-1 px-1">
                            <input type="number" min={0} step={0.001} className={inp + ' text-right'}
                              value={m.pesoBruto || ''} onChange={e => updateMercancia(i, { pesoBruto: Number(e.target.value) || 0 })} />
                          </td>
                          <td className="py-1 px-1">
                            <input type="number" min={0} step={0.001} className={inp + ' text-right'}
                              value={m.pesoNeto || ''} onChange={e => updateMercancia(i, { pesoNeto: Number(e.target.value) || 0 })} />
                          </td>
                          <td className="py-1 px-1 text-center">
                            {mercancias.length > 1 && (
                              <button onClick={() => removeMercancia(i)} className="text-red-400 hover:text-red-600">
                                <X size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold">
                        <td colSpan={4} className="py-2 px-1 text-right text-gray-500 text-[11px] uppercase tracking-wider">Totales</td>
                        <td className="py-2 px-1 text-right text-[#1e3a5f]">{totalPesoBruto.toFixed(3)} kg</td>
                        <td className="py-2 px-1 text-right text-[#1e3a5f]">{totalPesoNeto.toFixed(3)} kg</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <button onClick={addMercancia}
                  className="mt-3 text-sm text-[#1e3a5f] font-bold flex items-center gap-1 hover:underline">
                  <Plus size={14} /> Agregar mercancía
                </button>
              </Collapsible>

              {/* Notas */}
              <div className={sec}>
                <p className={secTitle}><FileText size={16} /> Notas (opcional)</p>
                <textarea className={inp + ' resize-none'} rows={3}
                  value={notas} onChange={e => setNotas(e.target.value)} />
              </div>

              {/* Acciones */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sticky bottom-4 flex flex-wrap gap-2 justify-between items-center">
                <div className="text-xs text-gray-500">
                  {lastFolio
                    ? <>Folio actual: <span className="font-mono font-bold text-[#1e3a5f]">{lastFolio}</span></>
                    : <>Sin guardar — al exportar XML se asigna folio automático</>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleSaveBorrador} disabled={busy}
                    className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-bold text-[#1e3a5f] flex items-center gap-2 hover:bg-gray-50 disabled:opacity-50">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Guardar borrador
                  </button>
                  <button onClick={handleGenerarPDF} disabled={busy}
                    className="h-10 px-4 rounded-lg bg-[#c8373c] text-white text-sm font-bold flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
                    <FileDown size={14} /> Generar PDF
                  </button>
                  <button onClick={handleGenerarXML} disabled={busy}
                    className="h-10 px-4 rounded-lg bg-[#1e3a5f] text-white text-sm font-bold flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
                    <Code size={14} /> Generar XML CFDI
                  </button>
                </div>
              </div>
            </div>

            {/* Historial */}
            <div>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs font-bold text-gray-700">
                    <History size={14} /> Historial (90 días)
                  </p>
                  <span className="text-[11px] text-gray-400">{cartas.length}</span>
                </div>
                {loadingHist ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-blue-600 text-xs">
                    <Loader2 size={14} className="animate-spin" /> Cargando…
                  </div>
                ) : cartas.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8 px-4">
                    Sin cartas porte todavía. Las que generes aparecerán aquí.
                  </p>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
                    {cartas.map(cp => (
                      <button key={cp.id} onClick={() => loadFromHistory(cp)}
                        className="w-full text-left p-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[12px] text-[#1e3a5f]">{cp.folio}</span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            cp.status === 'borrador' ? 'bg-gray-100 text-gray-600'
                            : cp.status === 'exportada' ? 'bg-blue-100 text-blue-700'
                            : cp.status === 'timbrada' ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                          }`}>{cp.status}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                          {cp.destinatarios[0]?.nombre || 'Sin destinatario'}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(cp.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {' · '}
                          {cp.total_peso_bruto.toFixed(1)} kg
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
