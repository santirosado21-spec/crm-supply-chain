import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  MapPin, Truck, ChevronDown, ChevronRight, RotateCcw,
  Calculator, CheckCircle, Printer, ExternalLink, Plus,
  Minus, ArrowRight, ArrowLeftRight, Package, X, Loader2, AlertCircle, Pencil,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useViajes } from '../../hooks/useViajes'
import { useAuthContext } from '../../context/AuthContext'
import { useClientCatalog } from '../../hooks/useClientCatalog'
import {
  UNIDADES as UNIDADES_FALLBACK, TIPOS_CLIENTE, HE_TARIFAS,
  OPERADORES_DEFAULT, MANIOBRISTAS_DEFAULT, GLOBALMAP_URL,
  type Unidad,
} from './cotizadorConstants'
import { useVehiculos } from '../../hooks/useVehiculos'
import { useOperadores } from '../../hooks/useOperadores'
import { calcularFlete, type CotizadorResult, type Parada, type Contenedor, type ManiobristaAsignado } from './cotizadorCalc'
import { isBaseManiobrista } from '../../lib/tmsCatalog'
import { CotizadorTabsProvider, useCotizadorTabs } from './CotizadorTabsContext'
import { CotizadorTabsBar } from './CotizadorTabsBar'

// ── Helpers ───────────────────────────────────────────────────────────────────
const mxn = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

// v2: bump key para invalidar listas viejas guardadas en localStorage
const STORAGE_KEY_OPS = 'sc_operadores_v2'
function loadOperadores(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_OPS) || 'null') ?? OPERADORES_DEFAULT }
  catch { return OPERADORES_DEFAULT }
}

const uniqueNames = (names: string[]) =>
  Array.from(new Set(names.map(n => n.trim()).filter(Boolean)))

const isManiobristaNombre = (nombre: string, notas?: string | null) =>
  isBaseManiobrista(nombre, notas)

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp = 'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-[#1e3a5f] focus:bg-white focus:ring-1 focus:ring-[#1e3a5f]/20 transition-colors'
const lbl = 'block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5'
const sec = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4'
const secTitle = 'flex items-center gap-2 text-sm font-bold text-[#1e3a5f] mb-4'

// ── Toggle pill ───────────────────────────────────────────────────────────────
function Toggle({ active, onToggle, label, icon }: { active: boolean; onToggle: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${active ? 'bg-[#1e3a5f] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
        }`}
    >
      {icon ?? (active ? <ArrowLeftRight size={14} /> : <ArrowRight size={14} />)}
      {label}
    </button>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────
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

// ── Desglose row ──────────────────────────────────────────────────────────────
function DR({ label, value, highlight, sub }: {
  label: string; value: string; highlight?: boolean; sub?: boolean
}) {
  return (
    <div className={`flex justify-between items-center py-2 ${highlight ? 'font-bold' : ''} ${sub ? 'opacity-70' : ''}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-[#1e3a5f] text-base' : 'text-gray-800'}`}>{value}</span>
    </div>
  )
}

// ── PDF generation with jsPDF ────────────────────────────────────────────────
async function generarPDF(c: CotizadorResult) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  let y = 0

  // Header corporativo
  doc.setFillColor(30, 58, 95)
  doc.rect(0, 0, 210, 42, 'F')
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('SupplyChain', 20, 20)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 180, 180)
  doc.text('MÉXICO', 20, 27)
  doc.setFontSize(9)
  doc.setTextColor(200, 200, 200)
  doc.text('COTIZACIÓN', 160, 15)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('#' + c.id, 160, 24)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(200, 200, 200)
  doc.text(c.fecha, 160, 32)

  y = 52

  // Precio destacado
  doc.setFillColor(196, 30, 58)
  doc.roundedRect(15, y, 180, 30, 3, 3, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)
  doc.text('PRECIO FINAL AL CLIENTE', 105, y + 8, { align: 'center' })
  doc.setFontSize(26)
  doc.setFont('helvetica', 'bold')
  doc.text('$' + c.precioFinal.toLocaleString() + ' MXN', 105, y + 21, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('($' + c.precioPorKm + ' por kilómetro)', 105, y + 28, { align: 'center' })

  y += 38

  // Info ruta
  doc.setFillColor(248, 248, 248)
  doc.roundedRect(15, y, 180, 24, 2, 2, 'F')
  doc.setTextColor(30, 58, 95)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const rutaTexto = c.esMultiparadas
    ? c.origen + ' → ' + c.paradas.filter(p => p.nombre).map(p => p.nombre).join(' → ')
    : c.origen + '  →  ' + c.destino
  doc.text(rutaTexto, 105, y + 10, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  const rutaDetalle = c.kmTotal.toLocaleString() + ' km  •  ' + c.dias + ' día(s)  •  ' +
    (c.viajeRedondo ? 'Viaje Redondo' : 'Solo Ida') +
    (c.esMultiparadas ? '  •  ' + c.paradas.length + ' paradas' : '')
  doc.text(rutaDetalle, 105, y + 18, { align: 'center' })

  y += 32

  // Datos cliente y unidad
  doc.setTextColor(30, 58, 95)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Cliente', 20, y)
  doc.text('Unidad Asignada', 115, y)
  y += 3
  doc.setDrawColor(220, 220, 220)
  doc.line(20, y, 100, y)
  doc.line(115, y, 195, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  doc.text(c.cliente || 'Sin especificar', 20, y)
  doc.text(c.unidad.placa + ' - ' + c.unidad.modelo, 115, y)
  y += 5
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.text('Tipo: ' + c.tipoCliente, 20, y)
  doc.text(c.unidad.tipo + ' | ' + c.unidad.combustible, 115, y)
  if (c.operador) { y += 5; doc.text('Operador: ' + c.operador, 20, y) }

  y += 10

  // Contenedores / carga
  if ((c.contenedores && c.contenedores.length > 0) || c.descripcionCarga) {
    doc.setTextColor(30, 58, 95)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Contenido / Carga', 20, y)
    y += 3
    doc.setDrawColor(220, 220, 220)
    doc.line(20, y, 195, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(50, 50, 50)
    if (c.contenedores.length > 0) {
      doc.text(c.contenedores.map(ct => ct.cantidad + 'x ' + ct.tipo).join('  •  '), 20, y)
      y += 5
    }
    if (c.descripcionCarga) {
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(8)
      doc.text('Descripción: ' + c.descripcionCarga, 20, y)
      y += 5
    }
    y += 5
  }

  // Desglose de costos
  doc.setTextColor(30, 58, 95)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Desglose de Costos', 20, y)
  y += 3
  doc.setDrawColor(30, 58, 95)
  doc.line(20, y, 195, y)
  y += 6

  const costos: [string, number][] = [
    ['Combustible (' + c.litros + ' litros)', c.costoCombustible],
    ['Casetas / Peajes', c.casetas],
  ]
  if (c.incluyeBonos) {
    costos.push(['Viáticos', c.viaticos])
    costos.push(['Bonos operador', c.bonosBase])
  } else if (c.viaticos > 0) {
    costos.push(['Viáticos extras', c.viaticos])
  }
  if (c.maniobra > 0) {
    const labelManiobra = c.maniobrista
      ? `Maniobra · ${c.maniobrista} (${c.maniobraDetalle.personas} pers)`
      : `Maniobra (${c.maniobraDetalle.personas} pers)`
    costos.push([labelManiobra, c.maniobra])
  }
  if (c.horasExtra > 0) costos.push(['Días Especiales', c.horasExtra])
  if (c.dadiva > 0) costos.push(['Dádiva GN', c.dadiva])
  costos.push(['Depreciación de unidad', c.depreciacion])
  costos.push(['Gastos fijos (GPS, renta, seguro)', c.gastosFijos])

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  costos.forEach((item, i) => {
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(15, y - 3, 180, 7, 'F') }
    doc.setTextColor(60, 60, 60)
    doc.text(item[0], 20, y)
    doc.text('$' + item[1].toLocaleString(), 190, y, { align: 'right' })
    y += 7
  })

  y += 3

  // Totales
  doc.setFillColor(30, 58, 95)
  doc.roundedRect(15, y, 180, 11, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Costo Total de Operación', 25, y + 7)
  doc.text('$' + c.costoTotal.toLocaleString(), 185, y + 7, { align: 'right' })
  y += 14

  // Margen
  doc.setFillColor(219, 234, 254)
  doc.roundedRect(15, y, 180, 9, 2, 2, 'F')
  doc.setTextColor(30, 64, 175)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Markup (' + c.margenPct + '%)', 25, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.text('+$' + c.ganancia.toLocaleString(), 185, y + 6, { align: 'right' })
  y += 11

  // Ganancia
  doc.setFillColor(220, 252, 231)
  doc.roundedRect(15, y, 180, 9, 2, 2, 'F')
  doc.setTextColor(22, 101, 52)
  doc.setFont('helvetica', 'bold')
  doc.text('Ganancia Neta', 25, y + 6)
  doc.text('+$' + c.ganancia.toLocaleString(), 185, y + 6, { align: 'right' })

  // Pie de página
  doc.setFillColor(30, 58, 95)
  doc.rect(0, 282, 210, 15, 'F')
  doc.setTextColor(200, 200, 200)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('Cotización válida por 7 días  •  Precios en Pesos Mexicanos (MXN)  •  Sujeto a disponibilidad', 105, 289, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('SupplyChain México', 105, 294, { align: 'center' })

  doc.save('Cotizacion_' + c.id + '_SupplyChain.pdf')
}

// ── Result panel ──────────────────────────────────────────────────────────────
function ResultPanel({ result, onAddToBitacora, onReset }: {
  result: CotizadorResult
  onAddToBitacora: (precioOverride: number) => Promise<void>
  onReset: () => void
}) {
  const [added, setAdded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [precioOverride, setPrecioOverride] = useState(result.precioFinal)
  const [editandoPrecio, setEditandoPrecio] = useState(false)
  const [inputPrecio, setInputPrecio] = useState(String(result.precioFinal))

  useEffect(() => {
    setPrecioOverride(result.precioFinal)
    setInputPrecio(String(result.precioFinal))
    setEditandoPrecio(false)
    setAdded(false)
  }, [result.precioFinal])

  const gananciaEfectiva = precioOverride - result.costoTotal
  const margenEfectivoPct = Math.round((gananciaEfectiva / result.costoTotal) * 100)

  const redondear = () => {
    const redondeado = Math.ceil(precioOverride / 100) * 100
    setPrecioOverride(redondeado)
    setInputPrecio(String(redondeado))
  }

  const confirmarEdicion = () => {
    const val = parseInt(inputPrecio.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(val) && val > 0) {
      setPrecioOverride(val)
      setInputPrecio(String(val))
    }
    setEditandoPrecio(false)
  }

  const handleAdd = async () => {
    if (saving || added) return
    setSaving(true)
    setSaveError('')
    try {
      await onAddToBitacora(precioOverride)
      setAdded(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'No se pudo registrar el viaje.')
    } finally {
      setSaving(false)
    }
  }

  const rutaDisplay = result.esMultiparadas
    ? result.origen + ' → ' + result.paradas.filter(p => p.nombre).map(p => p.nombre).join(' → ')
    : `${result.origen} ⟷ ${result.destino}`

  return (
    <div id="cotizacion-result" className="flex flex-col gap-4">
      {/* Price hero */}
      <div className="rounded-2xl p-6 text-center text-white" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d4f7c 100%)' }}>
        <p className="text-xs font-bold tracking-widest text-blue-200 mb-1 uppercase">Precio Final al Cliente</p>
        {editandoPrecio ? (
          <div className="flex items-center justify-center gap-2 mt-1">
            <input
              type="text"
              inputMode="numeric"
              className="text-3xl font-extrabold text-center bg-white/10 border border-white/30 rounded-xl px-3 py-1 text-white w-48 focus:outline-none focus:border-white/60"
              value={inputPrecio}
              onChange={e => setInputPrecio(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter') confirmarEdicion(); if (e.key === 'Escape') setEditandoPrecio(false) }}
              autoFocus
            />
            <button onClick={confirmarEdicion} className="text-green-300 hover:text-white transition-colors" title="Confirmar">
              <CheckCircle size={20} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <p className="text-5xl font-extrabold tracking-tight">{mxn(precioOverride)}</p>
            <button
              onClick={() => { setInputPrecio(String(precioOverride)); setEditandoPrecio(true) }}
              title="Editar precio"
              className="text-blue-300 hover:text-white transition-colors"
            >
              <Pencil size={16} />
            </button>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 mt-2">
          <p className="text-blue-200 text-sm font-medium">{mxn(result.precioPorKm)}/km</p>
          <button
            onClick={redondear}
            title="Redondear al siguiente centenar"
            className="text-xs bg-white/10 hover:bg-white/20 text-blue-100 px-2 py-0.5 rounded-lg font-semibold transition-colors"
          >
            ↑ Redondear
          </button>
        </div>
      </div>

      {/* Route card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
        <p className="font-bold text-gray-800 text-base">{rutaDisplay}</p>
        <p className="text-xs text-gray-500 mt-1">
          {result.kmTotal.toLocaleString()} km · {result.dias} día{result.dias !== 1 ? 's' : ''} · {result.viajeRedondo ? 'Redondo' : 'Solo ida'}
          {result.esMultiparadas && ` · ${result.paradas.length} paradas`}
        </p>
        {result.operador && (
          <p className="text-xs text-[#1e3a5f] font-semibold mt-1">Operador: {result.operador}</p>
        )}
      </div>

      {/* Contenedores */}
      {(result.contenedores.length > 0 || result.descripcionCarga) && (
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-2">Contenido / Carga</p>
          {result.contenedores.length > 0 && (
            <p className="text-sm text-blue-800 font-semibold">
              {result.contenedores.map(c => `${c.cantidad}x ${c.tipo}`).join(' · ')}
            </p>
          )}
          {result.descripcionCarga && (
            <p className="text-xs text-blue-600 mt-1">{result.descripcionCarga}</p>
          )}
        </div>
      )}

      {/* Breakdown */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Desglose de costos</p>
        </div>
        <div className="px-4 py-2 divide-y divide-gray-50">
          <DR label={`⛽ Combustible (${result.litros}L)`} value={mxn(result.costoCombustible)} />
          <DR label="🛣️ Casetas" value={mxn(result.casetas)} />
          {result.viaticos > 0 && (
            <DR
              label={
                (result.viaticosExtras ?? 0) > 0
                  ? `🍽️ Viáticos (incluye ${mxn(result.viaticosExtras ?? 0)} extras)`
                  : '🍽️ Viáticos'
              }
              value={mxn(result.viaticos)}
            />
          )}
          {result.incluyeBonos && result.bonosBase > 0 && <DR label="👤 Bonos operador" value={mxn(result.bonosBase)} />}
          {result.maniobra > 0 && (
            <DR
              label={
                result.maniobrista
                  ? `🏗️ Maniobra · ${result.maniobrista} (${result.maniobraDetalle.personas} pers)`
                  : `🏗️ Maniobra (${result.maniobraDetalle.personas} pers)`
              }
              value={mxn(result.maniobra)}
              highlight
            />
          )}
          {result.horasExtra > 0 && <DR label="⏰ Días especiales" value={mxn(result.horasExtra)} highlight />}
          {result.dadiva > 0 && <DR label="🤝 Dádiva GN" value={mxn(result.dadiva)} highlight />}
          <DR label="📉 Depreciación" value={mxn(result.depreciacion)} sub />
          <DR label="🏢 Gastos fijos (GPS · Renta · Seguro)" value={mxn(result.gastosFijos)} sub />
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Costo Total SCC</span>
            <span className="text-sm font-bold text-gray-800">{mxn(result.costoTotal)}</span>
          </div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-blue-700 font-semibold">📊 Markup ({margenEfectivoPct}%)</span>
            <span className="text-xs text-blue-700 font-semibold">+{mxn(gananciaEfectiva)}</span>
          </div>
        </div>
        <div className="px-4 py-3 bg-[#1e3a5f] flex justify-between items-center">
          <span className="text-sm font-bold text-white uppercase tracking-wide">PRECIO FINAL</span>
          <span className="text-xl font-extrabold text-white">{mxn(precioOverride)}</span>
        </div>
        <div className="px-4 py-2 bg-green-50 border-t border-green-100 flex justify-between items-center">
          <span className="text-xs text-green-700 font-semibold">💵 Ganancia</span>
          <span className="text-sm font-bold text-green-700">{mxn(gananciaEfectiva)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {!added ? (
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#1e3a5f] hover:opacity-90 text-white text-sm font-bold rounded-xl transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ boxShadow: '0 2px 8px rgba(30,58,95,0.35)' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {saving ? 'Registrando viaje...' : 'Confirmar cotización y registrar viaje'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full py-3 bg-green-50 border border-green-200 text-green-700 text-sm font-bold rounded-xl">
            <CheckCircle size={16} /> Cotización confirmada y viaje registrado
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            <AlertCircle size={14} /> {saveError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => generarPDF({ ...result, precioFinal: precioOverride, ganancia: gananciaEfectiva })}
            className="flex items-center justify-center gap-1.5 py-2.5 border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Printer size={14} /> Descargar PDF
          </button>
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-1.5 py-2.5 border border-gray-300 text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={14} /> Nueva cotización
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
// Wrapper exporta el provider de tabs. La lógica vive en CotizadorPageInner.
export function CotizadorPage() {
  return (
    <CotizadorTabsProvider>
      <CotizadorPageInner />
    </CotizadorTabsProvider>
  )
}

function CotizadorPageInner() {
  const { user } = useAuthContext()
  const { clientes: clientesCatalogo, loading: loadingClientes } = useClientCatalog()
  const { createViaje } = useViajes()
  const { vehiculos: dbVehiculos } = useVehiculos({ esPropio: true })
  const { operadores: dbOperadores } = useOperadores({ esPropio: true })

  // Multi-tab: el state inicial se hidrata desde la tab activa (sessionStorage).
  const {
    activeTab, activeTabId,
    setFormStateForActive, setResultForActive, markActiveSaved,
  } = useCotizadorTabs()
  const initialFs = useRef(activeTab.formState).current
  const initialResult = useRef(activeTab.result).current

  // Use Supabase vehicles if available, fallback to hardcoded
  const UNIDADES: Unidad[] = dbVehiculos.length > 0
    ? dbVehiculos.map(v => ({ clave: v.clave, placa: v.placa, modelo: v.modelo, tipo: v.tipo, combustible: v.combustible === 'Diesel' ? 'Diésel' as const : 'Gasolina' as const, rendimiento: v.rendimiento, depreciacion: v.depreciacion }))
    : [...UNIDADES_FALLBACK]

  const operadores = uniqueNames([
    ...OPERADORES_DEFAULT,
    ...(dbOperadores.length > 0
      ? dbOperadores.filter(o => !isManiobristaNombre(o.nombre, o.notas)).map(o => o.nombre)
      : loadOperadores()),
  ])
  const maniobristas = uniqueNames([
    ...MANIOBRISTAS_DEFAULT,
    ...dbOperadores.filter(o => isManiobristaNombre(o.nombre, o.notas)).map(o => o.nombre),
  ])

  // ── Form state (hidratado desde la tab activa) ─────────────────────────────
  const [origen, setOrigen] = useState(initialFs.origen)
  const [destino, setDestino] = useState(initialFs.destino)
  const [viajeRedondo, setViajeRedondo] = useState(initialFs.viajeRedondo)
  const [kmIda, setKmIda] = useState<number>(initialFs.kmIda)
  const [casetasIda, setCasetasIda] = useState<number>(initialFs.casetasIda)
  const [casetasRegreso, setCasetasRegreso] = useState<number>(initialFs.casetasRegreso)
  const [horasIda, setHorasIda] = useState<number>(initialFs.horasIda)
  const [minutosIda, setMinutosIda] = useState<number>(initialFs.minutosIda)

  // Multi-stop
  const [modoMultiparadas, setModoMultiparadas] = useState(initialFs.modoMultiparadas)
  const [paradas, setParadas] = useState<Parada[]>(initialFs.paradas)
  const [kmRegreso, setKmRegreso] = useState<number>(initialFs.kmRegreso)
  const [casetasRegresoMulti, setCasetasRegresoMulti] = useState<number>(initialFs.casetasRegresoMulti)
  const [horasRegreso, setHorasRegreso] = useState<number>(initialFs.horasRegreso)
  const [minutosRegreso, setMinutosRegreso] = useState<number>(initialFs.minutosRegreso)

  const [referenciaExtensiv, setReferenciaExtensiv] = useState(initialFs.referenciaExtensiv)
  const [referenciaSAC, setReferenciaSAC] = useState(initialFs.referenciaSAC)
  const [cliente, setCliente] = useState(initialFs.cliente)
  const [tipoCliente, setTipoCliente] = useState(initialFs.tipoCliente)
  const [unidadClave, setUnidadClave] = useState(initialFs.unidadClave)
  const [operador, setOperador] = useState(initialFs.operador)

  // Contenedores
  const [contenedores, setContenedores] = useState<Contenedor[]>(initialFs.contenedores)
  const [contCantidad, setContCantidad] = useState<number>(initialFs.contCantidad)
  const [contTipo, setContTipo] = useState(initialFs.contTipo)
  const [descripcionCarga, setDescripcionCarga] = useState(initialFs.descripcionCarga)

  // Maniobra — se cobra por persona: costo por persona × número de personas.
  const [mExtra, setMExtra] = useState<number>(initialFs.maniobraExtra)      // costo por persona
  const [mPersonas, setMPersonas] = useState<number>(initialFs.maniobraPersonas)
  // Lista de maniobristas asignados (mezcla interno/externo en el mismo viaje).
  const [maniobristasList, setManiobristasList] = useState<ManiobristaAsignado[]>(initialFs.maniobristas)
  // UI inline pickers (no persistidos a la tab — solo del estado del form):
  const [addInternoSel, setAddInternoSel] = useState<string>('')
  const [addExternoName, setAddExternoName] = useState<string>('')

  // Viáticos extras (ad-hoc, además de los calculados por bonos)
  const [viaticosExtras, setViaticosExtras] = useState<number>(initialFs.viaticosExtras)

  // Dádiva: efectivo extra al operador por contingencia Guardia Nacional.
  // Costo operativo más: suma a costoTotal/precioFinal y aparece en el PDF cliente.
  const [dadiva, setDadiva] = useState<number>(initialFs.dadiva)

  // Bonos
  const [incluyeBonos, setIncluyeBonos] = useState(initialFs.incluyeBonos)
  const [bonoSueldo, setBonoSueldo] = useState(initialFs.bonoSueldo)
  const [bonoKmCarga, setBonoKmCarga] = useState(initialFs.bonoKmCarga)
  const [bonoKmVacio, setBonoKmVacio] = useState(initialFs.bonoKmVacio)
  const [bonoComida, setBonoComida] = useState(initialFs.bonoComida)

  // Días especiales
  const [dMatutino, setDMatutino] = useState<number>(initialFs.dMatutino)
  const [dNocturno, setDNocturno] = useState<number>(initialFs.dNocturno)
  const [dSabado, setDSabado] = useState<number>(initialFs.dSabado)
  const [dDomingo, setDDomingo] = useState<number>(initialFs.dDomingo)
  const [dFestivo, setDFestivo] = useState<number>(initialFs.dFestivo)

  // Result
  const [result, setResult] = useState<CotizadorResult | null>(initialResult)
  const [error, setError] = useState('')

  // ── Maniobristas helpers ──────────────────────────────────────────────────
  const addManiobristaInterno = useCallback(() => {
    const nombre = addInternoSel.trim()
    if (!nombre) return
    if (maniobristasList.some(m => m.nombre.toLowerCase() === nombre.toLowerCase())) {
      setAddInternoSel('')
      return
    }
    setManiobristasList(prev => [
      ...prev,
      { id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nombre, esExterno: false },
    ])
    setAddInternoSel('')
  }, [addInternoSel, maniobristasList])

  const addManiobristaExterno = useCallback(() => {
    const nombre = addExternoName.trim()
    if (!nombre) return
    if (maniobristasList.some(m => m.nombre.toLowerCase() === nombre.toLowerCase())) {
      setAddExternoName('')
      return
    }
    setManiobristasList(prev => [
      ...prev,
      { id: `me-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nombre, esExterno: true },
    ])
    setAddExternoName('')
  }, [addExternoName, maniobristasList])

  const removeManiobrista = useCallback((id: string) => {
    setManiobristasList(prev => prev.filter(m => m.id !== id))
  }, [])

  // ── Multi-tab sync ─────────────────────────────────────────────────────────
  // Cuando el usuario cambia de pestaña, hidratamos los useState desde la nueva
  // tab. Durante esa hidratación hay que evitar que el efecto de snapshot
  // sobrescriba la tab vieja con los valores que estamos restaurando.
  const isRestoringRef = useRef(false)
  const prevTabIdRef = useRef(activeTabId)

  useEffect(() => {
    if (prevTabIdRef.current === activeTabId) return
    prevTabIdRef.current = activeTabId
    isRestoringRef.current = true
    const fs = activeTab.formState
    setOrigen(fs.origen); setDestino(fs.destino); setViajeRedondo(fs.viajeRedondo)
    setKmIda(fs.kmIda); setCasetasIda(fs.casetasIda); setCasetasRegreso(fs.casetasRegreso)
    setHorasIda(fs.horasIda); setMinutosIda(fs.minutosIda)
    setModoMultiparadas(fs.modoMultiparadas); setParadas(fs.paradas)
    setKmRegreso(fs.kmRegreso); setCasetasRegresoMulti(fs.casetasRegresoMulti)
    setHorasRegreso(fs.horasRegreso); setMinutosRegreso(fs.minutosRegreso)
    setCliente(fs.cliente); setTipoCliente(fs.tipoCliente)
    setUnidadClave(fs.unidadClave); setOperador(fs.operador)
    setReferenciaExtensiv(fs.referenciaExtensiv); setReferenciaSAC(fs.referenciaSAC)
    setContenedores(fs.contenedores); setContCantidad(fs.contCantidad)
    setContTipo(fs.contTipo); setDescripcionCarga(fs.descripcionCarga)
    setMExtra(fs.maniobraExtra); setMPersonas(fs.maniobraPersonas)
    setManiobristasList(fs.maniobristas)
    setAddInternoSel(''); setAddExternoName('')
    setViaticosExtras(fs.viaticosExtras); setDadiva(fs.dadiva)
    setIncluyeBonos(fs.incluyeBonos)
    setBonoSueldo(fs.bonoSueldo); setBonoKmCarga(fs.bonoKmCarga)
    setBonoKmVacio(fs.bonoKmVacio); setBonoComida(fs.bonoComida)
    setDMatutino(fs.dMatutino); setDNocturno(fs.dNocturno)
    setDSabado(fs.dSabado); setDDomingo(fs.dDomingo); setDFestivo(fs.dFestivo)
    setResult(activeTab.result)
    setError('')
    // Liberar el flag después del commit de este render.
    queueMicrotask(() => { isRestoringRef.current = false })
  }, [activeTabId, activeTab])

  // Snapshot del form actual a la tab activa. Skip durante restore.
  useEffect(() => {
    if (isRestoringRef.current) return
    setFormStateForActive({
      origen, destino, viajeRedondo,
      kmIda, casetasIda, casetasRegreso, horasIda, minutosIda,
      modoMultiparadas, paradas,
      kmRegreso, casetasRegresoMulti, horasRegreso, minutosRegreso,
      cliente, tipoCliente, unidadClave, operador,
      referenciaExtensiv, referenciaSAC,
      contenedores, contCantidad, contTipo, descripcionCarga,
      maniobraExtra: mExtra, maniobraPersonas: mPersonas, maniobristas: maniobristasList,
      viaticosExtras, dadiva,
      incluyeBonos, bonoSueldo, bonoKmCarga, bonoKmVacio, bonoComida,
      dMatutino, dNocturno, dSabado, dDomingo, dFestivo,
    })
  }, [
    origen, destino, viajeRedondo,
    kmIda, casetasIda, casetasRegreso, horasIda, minutosIda,
    modoMultiparadas, paradas,
    kmRegreso, casetasRegresoMulti, horasRegreso, minutosRegreso,
    cliente, tipoCliente, unidadClave, operador,
    referenciaExtensiv, referenciaSAC,
    contenedores, contCantidad, contTipo, descripcionCarga,
    mExtra, mPersonas, maniobristasList,
    viaticosExtras, dadiva,
    incluyeBonos, bonoSueldo, bonoKmCarga, bonoKmVacio, bonoComida,
    dMatutino, dNocturno, dSabado, dDomingo, dFestivo,
    setFormStateForActive,
  ])

  // Result también se sincroniza a la tab.
  useEffect(() => {
    if (isRestoringRef.current) return
    setResultForActive(result)
  }, [result, setResultForActive])

  // ── Multi-stop helpers ────────────────────────────────────────────────────
  const agregarParada = () => {
    setParadas(p => [...p, { id: Date.now(), nombre: '', km: 0, casetas: 0, horas: 0, minutos: 0 }])
  }

  const eliminarParada = (id: number) => {
    if (paradas.length > 1) setParadas(p => p.filter(x => x.id !== id))
  }

  const actualizarParada = (id: number, campo: keyof Parada, valor: string) => {
    setParadas(prev => prev.map(p =>
      p.id === id
        ? { ...p, [campo]: campo === 'nombre' ? valor : (parseFloat(valor) || 0) }
        : p
    ))
  }

  const toggleMultiparadas = () => {
    const next = !modoMultiparadas
    setModoMultiparadas(next)
    if (next && paradas.length === 0) agregarParada()
  }

  // ── Contenedor helpers ────────────────────────────────────────────────────
  const agregarContenedor = () => {
    if (!contCantidad || !contTipo.trim()) return
    setContenedores(prev => [...prev, { cantidad: contCantidad, tipo: contTipo.trim() }])
    setContCantidad(0)
    setContTipo('')
  }

  // ── Live totals ─────────────────────────────────────────────────────────────
  const totalKm = useMemo(() => {
    if (modoMultiparadas) {
      let t = paradas.reduce((s, p) => s + (p.km || 0), 0)
      if (viajeRedondo) t += kmRegreso
      return t
    }
    return viajeRedondo && kmIda ? kmIda * 2 : kmIda
  }, [modoMultiparadas, paradas, kmIda, viajeRedondo, kmRegreso])

  const totalCasetas = useMemo(() => {
    if (modoMultiparadas) {
      let t = paradas.reduce((s, p) => s + (p.casetas || 0), 0)
      if (viajeRedondo) t += casetasRegresoMulti
      return t
    }
    return casetasIda + (viajeRedondo ? casetasRegreso : 0)
  }, [modoMultiparadas, paradas, casetasIda, casetasRegreso, viajeRedondo, casetasRegresoMulti])

  const horasExtra = dMatutino * HE_TARIFAS.MATUTINO + dNocturno * HE_TARIFAS.NOCTURNO +
    dSabado * HE_TARIFAS.SABADO + dDomingo * HE_TARIFAS.DOMINGO + dFestivo * HE_TARIFAS.FESTIVO

  // ── Calculate ───────────────────────────────────────────────────────────────
  const handleCalcular = useCallback(() => {
    setError('')
    if (!origen.trim()) { setError('Ingresa el origen.'); return }
    if (!modoMultiparadas && !destino.trim()) { setError('Ingresa el destino.'); return }
    if (modoMultiparadas && paradas.every(p => !p.nombre)) { setError('Ingresa al menos un destino en las paradas.'); return }
    if (!totalKm) { setError('Ingresa los kilómetros.'); return }
    if (!unidadClave) { setError('Selecciona una unidad.'); return }

    const unidad = UNIDADES.find(u => u.clave === unidadClave) as Unidad
    const res = calcularFlete({
      origen, destino, kmIda, casetasIda, casetasRegreso,
      horasIda, minutosIda, viajeRedondo,
      modoMultiparadas, paradas, kmRegreso, casetasRegresoMulti,
      horasRegreso, minutosRegreso,
      unidad, tipoCliente, operador, cliente,
      referenciaExtensiv, referenciaSAC,
      contenedores, descripcionCarga,
      maniobraExtra: mExtra, maniobraPersonas: mPersonas,
      maniobristas: maniobristasList,
      viaticosExtras,
      dadiva,
      incluyeBonos, bonoSueldo, bonoKmCarga, bonoKmVacio, bonoComida,
      dMatutino, dNocturno, dSabado, dDomingo, dFestivo,
    })
    setResult(res)
    setTimeout(() => document.getElementById('cotizacion-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }, [
    origen, destino, kmIda, casetasIda, casetasRegreso, horasIda, minutosIda,
    viajeRedondo, modoMultiparadas, paradas, kmRegreso, casetasRegresoMulti,
    horasRegreso, minutosRegreso, unidadClave, tipoCliente, operador, cliente,
    referenciaExtensiv, referenciaSAC,
    contenedores, descripcionCarga, totalKm,
    mExtra, mPersonas, maniobristasList, viaticosExtras, dadiva, incluyeBonos,
    bonoSueldo, bonoKmCarga, bonoKmVacio, bonoComida,
    dMatutino, dNocturno, dSabado, dDomingo, dFestivo,
  ])

  // ── Crear viaje desde cotización ─────────────────────────────────────────────
  const handleAddToBitacora = useCallback(async (precioFinalOverride: number) => {
    if (!result) throw new Error('Primero calcula una cotización.')
    const notas = [
      `Cotización #${result.id}`,
      result.cliente ? `Cliente: ${result.cliente}` : null,
      result.operador ? `Operador: ${result.operador}` : null,
      result.maniobrista ? `Maniobrista: ${result.maniobrista}` : null,
      result.referenciaExtensiv ? `Txn Extensiv: ${result.referenciaExtensiv}` : null,
      result.referenciaSAC      ? `Ref SAC: ${result.referenciaSAC}`           : null,
      `${result.dias} día(s)`,
      `${result.unidad.modelo} (${result.unidad.placa})`,
      result.descripcionCarga ? `Carga: ${result.descripcionCarga}` : null,
      result.maniobra > 0 ? `[MANIOBRA: ${mxn(result.maniobra)} · ${result.maniobraDetalle.personas} pers]` : null,
      result.dadiva > 0 ? `[DADIVA: ${mxn(result.dadiva)}]` : null,
      precioFinalOverride !== result.precioFinal ? `[PRECIO AJUSTADO: ${mxn(precioFinalOverride)}]` : null,
    ].filter(Boolean).join(' · ')

    // Ligar el cliente real (el <select> del Cotizador guarda el NOMBRE) para
    // que el viaje nazca completo y Transportes NO tenga que recapturarlo.
    const cli = clientesCatalogo.find(c => c.nombre === result.cliente)
    const referenciaManual =
      result.referenciaSAC?.trim() || result.referenciaExtensiv?.trim() || `Cotización #${result.id}`

    const viaje = await createViaje({
      operacion_id: null,
      vehiculo_id: null,
      operador_id: null,
      proveedor_nombre: null,
      origen: result.origen,
      destino: result.destino,
      km_estimados: result.kmTotal,
      km_reales: 0,
      // Confirmar la cotización deja el viaje como 'confirmado' — visible de
      // inmediato en la sección de viajes confirmados de Transportes. No es
      // facturable hasta que Transportes lo marque Completado/Entregado.
      estado: 'confirmado',
      fecha_programada: new Date().toISOString().split('T')[0],
      fecha_salida: null,
      fecha_llegada: null,
      fecha_completado: null,
      costo_combustible: result.costoCombustible ?? 0,
      costo_casetas: result.casetas ?? 0,
      costo_viaticos: result.viaticos ?? 0,
      costo_proveedor: 0,
      costo_total: (result.costoCombustible ?? 0) + (result.casetas ?? 0) + (result.viaticos ?? 0) + (result.maniobra ?? 0) + (result.dadiva ?? 0),
      ingreso_cliente: precioFinalOverride,
      margen: precioFinalOverride - result.costoTotal,
      motive_dispatch_id: null,
      motive_status: '',
      notas,
      creado_por: user?.name ?? user?.email ?? 'Cotizador',
      // Cliente ligado desde el catálogo (nombre → id/código). La referencia
      // queda como manual (Ref SAC / Txn Extensiv / folio de cotización).
      cliente_id: cli?.id ?? null,
      cliente_codigo: cli?.codigo ?? null,
      referencia_origen: cli ? 'manual' : null,
      extensiv_transaction_type: null,
      extensiv_transaction_id: null,
      extensiv_customer_id: null,
      referencia_manual: cli ? referenciaManual : null,
      facturado_en_proforma_id: null,
    })
    // Multi-tab: marca esta pestaña como guardada (badge ✓ + banner solo-lectura).
    if (viaje?.id) markActiveSaved(viaje.id)
  }, [result, user, createViaje, markActiveSaved, clientesCatalogo])

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setResult(null); setError('')
    setOrigen(''); setDestino(''); setKmIda(0); setCasetasIda(0)
    setCasetasRegreso(0); setHorasIda(0); setMinutosIda(0)
    setModoMultiparadas(false); setParadas([]); setKmRegreso(0)
    setCasetasRegresoMulti(0); setHorasRegreso(0); setMinutosRegreso(0)
    setContenedores([]); setContCantidad(0); setContTipo(''); setDescripcionCarga('')
    setReferenciaExtensiv(''); setReferenciaSAC('')
    setMExtra(0); setMPersonas(1)
    setManiobristasList([]); setAddInternoSel(''); setAddExternoName('')
    setDMatutino(0); setDNocturno(0)
    setDSabado(0); setDDomingo(0); setDFestivo(0)
    setIncluyeBonos(false); setViaticosExtras(0); setDadiva(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const numInp = (val: number, set: (n: number) => void, extra = '') =>
    <input type="number" min={0} value={val || ''} placeholder="0"
      onChange={e => set(Number(e.target.value) || 0)}
      className={`${inp} ${extra}`} />

  const tabSaved = activeTab.savedViajeId !== null

  return (
    <div className="flex flex-col h-dvh bg-gray-50">
      <div className="cotiz-no-print"><Header /></div>
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="cotiz-no-print"><Sidebar /></div>

        <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pb-24">
          <div className="cotiz-no-print">
            <CotizadorTabsBar />
          </div>
          {tabSaved && (
            <div className="cotiz-no-print mx-3 sm:mx-6 mt-3 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center justify-between gap-3 text-sm">
              <span className="text-green-800">
                ✓ Esta cotización ya fue guardada como viaje{' '}
                <span className="font-mono text-xs">#{activeTab.savedViajeId?.slice(0, 8)}</span>.
                Los cambios no se actualizan automáticamente al viaje.
              </span>
              <span className="text-[11px] text-green-700">Usa <strong>Duplicar</strong> arriba para crear otra similar.</span>
            </div>
          )}
          <div className="p-3 sm:p-6">
          {/* ── Header ── */}
          <div className="cotiz-no-print flex items-start justify-between mb-6 flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f]">Cotizador de Fletes</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Calcula el precio real de cada viaje con todos los costos operativos
              </p>
            </div>
            <a
              href={GLOBALMAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#28a745] hover:opacity-90 text-white text-sm font-bold rounded-xl transition-opacity"
              style={{ boxShadow: '0 2px 6px rgba(40,167,69,0.35)' }}
            >
              <ExternalLink size={14} /> Abrir GlobalMap
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
            {/* ── LEFT: Form ── */}
            <div className="cotiz-no-print">

              {/* 1. Ruta */}
              <div className={sec}>
                <p className={secTitle}><MapPin size={16} /> Datos de la ruta</p>

                <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4 text-xs text-blue-700 leading-relaxed">
                  💡 Abre <strong>GlobalMap</strong> (botón arriba), calcula la ruta y copia aquí los km, casetas y tiempo.
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className={lbl}>Origen</label>
                    <input type="text" className={inp} placeholder="Ej: Ciudad de México"
                      value={origen} onChange={e => setOrigen(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Destino final</label>
                    <input type="text" className={inp} placeholder="Ej: Mérida, Yucatán"
                      value={destino} onChange={e => setDestino(e.target.value)}
                      disabled={modoMultiparadas} />
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <Toggle active={viajeRedondo} onToggle={() => setViajeRedondo(p => !p)}
                    label={viajeRedondo ? 'Viaje Redondo' : 'Solo Ida'} />
                  <Toggle active={modoMultiparadas} onToggle={toggleMultiparadas}
                    label="Múltiples Paradas" icon={<MapPin size={14} />} />
                  {totalKm > 0 && (
                    <span className="text-xs text-gray-500 font-medium">
                      Total: <strong>{totalKm.toLocaleString()} km</strong>
                    </span>
                  )}
                </div>

                {/* Viaje Simple — 1 col en móvil, 3 en tablet+ */}
                {!modoMultiparadas && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <label className={`${lbl} text-center block`}>KM (ida)</label>
                      <input type="number" min={0} value={kmIda || ''} placeholder="0"
                        onChange={e => setKmIda(Number(e.target.value) || 0)}
                        className="w-full text-center text-2xl font-bold bg-transparent border-none outline-none text-[#1e3a5f]" />
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <label className={`${lbl} text-center block`}>Casetas $</label>
                      <div className="flex items-center gap-1 justify-center">
                        <div className="text-center">
                          <input type="number" min={0} value={casetasIda || ''} placeholder="0"
                            onChange={e => setCasetasIda(Number(e.target.value) || 0)}
                            className="w-16 text-center text-lg font-bold bg-white border border-gray-200 rounded-lg outline-none px-1 py-1 focus:border-[#1e3a5f]" />
                          <div className="text-[10px] text-gray-400 mt-0.5">Ida</div>
                        </div>
                        {viajeRedondo && <>
                          <span className="text-gray-400 text-sm font-bold">+</span>
                          <div className="text-center">
                            <input type="number" min={0} value={casetasRegreso || ''} placeholder="0"
                              onChange={e => setCasetasRegreso(Number(e.target.value) || 0)}
                              className="w-16 text-center text-lg font-bold bg-white border border-gray-200 rounded-lg outline-none px-1 py-1 focus:border-[#1e3a5f]" />
                            <div className="text-[10px] text-gray-400 mt-0.5">Regreso</div>
                          </div>
                        </>}
                      </div>
                      {totalCasetas > 0 && <p className="text-[11px] text-green-600 font-semibold text-center mt-1">Total: ${totalCasetas.toLocaleString()}</p>}
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <label className={`${lbl} text-center block`}>Tiempo (ida)</label>
                      <div className="flex items-center justify-center gap-1">
                        <input type="number" min={0} value={horasIda || ''} placeholder="0"
                          onChange={e => setHorasIda(Number(e.target.value) || 0)}
                          className="w-12 text-center text-lg font-bold bg-white border border-gray-200 rounded-lg outline-none px-1 py-1 focus:border-[#1e3a5f]" />
                        <span className="text-gray-500 font-bold text-sm">:</span>
                        <input type="number" min={0} max={59} value={minutosIda || ''} placeholder="00"
                          onChange={e => setMinutosIda(Number(e.target.value) || 0)}
                          className="w-12 text-center text-lg font-bold bg-white border border-gray-200 rounded-lg outline-none px-1 py-1 focus:border-[#1e3a5f]" />
                      </div>
                      <div className="text-center text-[10px] text-gray-400 mt-1">hrs : min</div>
                    </div>
                  </div>
                )}

                {/* Múltiples Paradas */}
                {modoMultiparadas && (
                  <div>
                    <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 mb-3">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold text-[#1e3a5f] text-sm">🚚 Paradas del Viaje</span>
                        <button className="flex items-center gap-1 px-3 py-1.5 bg-[#1e3a5f] text-white text-xs font-bold rounded-lg hover:opacity-90"
                          onClick={agregarParada}>
                          <Plus size={12} /> Agregar Parada
                        </button>
                      </div>

                      {paradas.map((p, index) => (
                        <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-3 mb-2">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-[#1e3a5f] text-xs">📍 Parada {index + 1}</span>
                            {paradas.length > 1 && (
                              <button onClick={() => eliminarParada(p.id)}
                                className="text-red-500 hover:text-red-700 p-1">
                                <X size={14} />
                              </button>
                            )}
                          </div>
                          <input type="text" className={`${inp} mb-2 text-xs`} placeholder="Nombre del destino"
                            value={p.nombre} onChange={e => actualizarParada(p.id, 'nombre', e.target.value)} />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[9px] text-gray-500 block">KM</label>
                              <input type="number" className={`${inp} text-center text-xs`} placeholder="0"
                                value={p.km || ''} onChange={e => actualizarParada(p.id, 'km', e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 block">Casetas $</label>
                              <input type="number" className={`${inp} text-center text-xs`} placeholder="0"
                                value={p.casetas || ''} onChange={e => actualizarParada(p.id, 'casetas', e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[9px] text-gray-500 block">Tiempo</label>
                              <div className="flex items-center gap-1">
                                <input type="number" className="w-10 text-center text-xs px-1 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="0"
                                  value={p.horas || ''} onChange={e => actualizarParada(p.id, 'horas', e.target.value)} />
                                <span className="text-gray-400 text-xs">:</span>
                                <input type="number" className="w-10 text-center text-xs px-1 py-2 bg-gray-50 border border-gray-200 rounded-lg" placeholder="00"
                                  min={0} max={59}
                                  value={p.minutos || ''} onChange={e => actualizarParada(p.id, 'minutos', e.target.value)} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Totales multiparadas */}
                      <div className="grid grid-cols-3 gap-3 text-center mt-3 pt-3 border-t-2 border-blue-300">
                        <div>
                          <span className="text-[10px] text-gray-500">Total KM</span>
                          <div className="text-lg font-extrabold text-[#1e3a5f]">{totalKm.toLocaleString()} km</div>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-500">Total Casetas</span>
                          <div className="text-lg font-extrabold text-[#1e3a5f]">${totalCasetas.toLocaleString()}</div>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-500">Total Tiempo</span>
                          <div className="text-lg font-extrabold text-[#1e3a5f]">
                            {(() => {
                              let mins = paradas.reduce((s, p) => s + ((p.horas || 0) * 60) + (p.minutos || 0), 0)
                              if (viajeRedondo) mins += (horasRegreso * 60) + minutosRegreso
                              return `${Math.floor(mins / 60)}h ${mins % 60}m`
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Regreso si viaje redondo */}
                    {viajeRedondo && (
                      <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                        <span className="font-bold text-amber-800 text-sm">↩️ Datos del Regreso (al origen)</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                          <div>
                            <label className={lbl}>KM Regreso</label>
                            {numInp(kmRegreso, setKmRegreso)}
                          </div>
                          <div>
                            <label className={lbl}>Casetas Regreso $</label>
                            {numInp(casetasRegresoMulti, setCasetasRegresoMulti)}
                          </div>
                          <div>
                            <label className={lbl}>Tiempo Regreso</label>
                            <div className="flex gap-1 items-center">
                              <input type="number" className="w-12 text-center text-sm px-1 py-2 bg-white border border-gray-200 rounded-lg" placeholder="0"
                                min={0} value={horasRegreso || ''} onChange={e => setHorasRegreso(Number(e.target.value) || 0)} />
                              <span className="text-gray-400">:</span>
                              <input type="number" className="w-12 text-center text-sm px-1 py-2 bg-white border border-gray-200 rounded-lg" placeholder="00"
                                min={0} max={59} value={minutosRegreso || ''} onChange={e => setMinutosRegreso(Number(e.target.value) || 0)} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Referencias internas (opcionales) — se guardan en notas del viaje */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
                  <div>
                    <label className={lbl}># transacción Extensiv (opcional)</label>
                    <input type="text" className={inp} placeholder="Ej. EXT-123456"
                      value={referenciaExtensiv} onChange={e => setReferenciaExtensiv(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Referencia correo SAC (opcional)</label>
                    <input type="text" className={inp} placeholder="Ej. TICKET-789"
                      value={referenciaSAC} onChange={e => setReferenciaSAC(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* 2. Cliente y Unidad — 1 col móvil, 2 desktop */}
              <div className={sec}>
                <p className={secTitle}><Truck size={16} /> Cliente y Unidad</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Nombre del cliente</label>
                    <select className={inp} value={cliente} onChange={e => setCliente(e.target.value)}>
                      <option value="">{loadingClientes ? 'Cargando clientes...' : '— Seleccionar cliente —'}</option>
                      {clientesCatalogo.map(c => (
                        <option key={`${c.codigo}-${c.nombre}`} value={c.nombre}>
                          {c.codigo} — {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Tipo de cliente / margen</label>
                    <select className={inp} value={tipoCliente} onChange={e => setTipoCliente(e.target.value)}>
                      {TIPOS_CLIENTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Unidad *</label>
                    <select className={inp} value={unidadClave} onChange={e => setUnidadClave(e.target.value)}>
                      <option value="">— Seleccionar unidad —</option>
                      {UNIDADES.map(u => (
                        <option key={u.clave} value={u.clave}>
                          {u.placa} — {u.modelo} ({u.tipo})
                        </option>
                      ))}
                    </select>
                    {unidadClave && (() => {
                      const u = UNIDADES.find(x => x.clave === unidadClave)!
                      return (
                        <p className="text-[10px] text-gray-400 mt-1">
                          {u.combustible} · {u.rendimiento} km/L · dep. ${u.depreciacion.toFixed(2)}/día
                        </p>
                      )
                    })()}
                  </div>
                  <div>
                    <label className={lbl}>Operador</label>
                    <select className={inp} value={operador} onChange={e => setOperador(e.target.value)}>
                      <option value="">Sin asignar</option>
                      {operadores.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className={lbl}>Maniobristas (varios permitidos)</label>
                    {/* Chips de asignados */}
                    {maniobristasList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {maniobristasList.map(m => (
                          <span
                            key={m.id}
                            className={`inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1 py-1 text-[11px] font-semibold border ${m.esExterno ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-[#1e3a5f]'}`}
                          >
                            {m.nombre}
                            <span className={`text-[9px] font-normal opacity-70`}>
                              {m.esExterno ? '· externo' : '· interno'}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeManiobrista(m.id)}
                              className="ml-0.5 rounded-full hover:bg-white/70 p-0.5"
                              title="Quitar"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Add interno */}
                    <div className="flex gap-1.5 mb-1.5">
                      <select
                        className={`${inp} flex-1`}
                        value={addInternoSel}
                        onChange={e => setAddInternoSel(e.target.value)}
                      >
                        <option value="">+ Agregar interno…</option>
                        {maniobristas
                          .filter(m => !maniobristasList.some(x => x.nombre.toLowerCase() === m.toLowerCase()))
                          .map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={addManiobristaInterno}
                        disabled={!addInternoSel}
                        className="px-3 rounded-xl bg-[#1e3a5f] text-white text-xs font-bold disabled:opacity-40"
                        title="Agregar este interno"
                      >+</button>
                    </div>
                    {/* Add externo */}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        className={`${inp} flex-1`}
                        value={addExternoName}
                        onChange={e => setAddExternoName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManiobristaExterno() } }}
                        placeholder="+ Agregar externo (nombre libre)…"
                      />
                      <button
                        type="button"
                        onClick={addManiobristaExterno}
                        disabled={!addExternoName.trim()}
                        className="px-3 rounded-xl bg-amber-500 text-white text-xs font-bold disabled:opacity-40"
                        title="Agregar este externo"
                      >+</button>
                    </div>
                    {maniobristasList.length === 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Sin maniobristas asignados. Puedes mezclar internos y externos en el mismo viaje.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={lbl}>Viáticos extras ($)</label>
                    {numInp(viaticosExtras, setViaticosExtras)}
                    <p className="text-[10px] text-gray-400 mt-1">Peajes adicionales, propinas, imprevistos</p>
                  </div>
                  <div>
                    <label className={lbl}>Dádiva ($) — Guardia Nacional</label>
                    {numInp(dadiva, setDadiva)}
                    <p className="text-[10px] text-gray-400 mt-1">Contingencia Guardia Nacional. Se suma al costo y se cobra al cliente (con margen).</p>
                  </div>
                </div>
              </div>

              {/* 3. Contenedores / Carga */}
              <Collapsible title="Contenido / Carga (opcional)" icon={<Package size={16} />}>
                {contenedores.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {contenedores.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                        <span className="text-lg font-extrabold text-[#1e3a5f]">{c.cantidad}x</span>
                        <span className="text-sm font-semibold text-gray-700 flex-1">{c.tipo}</span>
                        <button onClick={() => setContenedores(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-red-400 hover:text-red-600"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[80px_1fr_auto] gap-2">
                  <input type="number" className={inp} placeholder="Cant." min={1}
                    value={contCantidad || ''} onChange={e => setContCantidad(Number(e.target.value) || 0)} />
                  <input type="text" className={inp} placeholder="Tipo (ej: Caja 40', Tarimas, Bultos...)"
                    value={contTipo} onChange={e => setContTipo(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarContenedor() } }} />
                  <button className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-600"
                    onClick={agregarContenedor}>+ Agregar</button>
                </div>
                <input type="text" className={`${inp} mt-2`} placeholder="Descripción de la carga (opcional)"
                  value={descripcionCarga} onChange={e => setDescripcionCarga(e.target.value)} />
              </Collapsible>

              {/* 4. Maniobra */}
              <Collapsible title="Maniobra (opcional)" icon="🏗️">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>Costo por persona ($)</label>
                    {numInp(mExtra, setMExtra)}
                  </div>
                  <div>
                    <label className={lbl}>Número de personas</label>
                    {numInp(mPersonas, setMPersonas)}
                  </div>
                  <div>
                    <label className={lbl}>Total maniobra</label>
                    <p className="text-xl font-bold text-[#1e3a5f] pt-1.5">
                      {mxn(Math.round(mExtra * (mPersonas || 1)))}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">La maniobra se cobra por persona: cuánto cobra cada persona × número de personas. Se cobra al cliente con margen.</p>
              </Collapsible>

              {/* 5. Bonos operador */}
              <Collapsible title="Bonos al Operador (opcional)" icon="💰">
                <label className="flex items-center gap-2 cursor-pointer mb-4">
                  <input type="checkbox" checked={incluyeBonos} onChange={e => setIncluyeBonos(e.target.checked)}
                    className="w-4 h-4 accent-[#1e3a5f]" />
                  <span className="text-sm text-gray-700 font-medium">Incluir bonos en el cálculo</span>
                </label>
                {incluyeBonos && (
                  <div className="grid grid-cols-2 gap-3 pl-3 border-l-2 border-[#1e3a5f]/20">
                    <div><label className={lbl}>Sueldo por día ($)</label>{numInp(bonoSueldo, setBonoSueldo)}</div>
                    <div><label className={lbl}>Comida por comida ($)</label>{numInp(bonoComida, setBonoComida)}</div>
                    <div><label className={lbl}>Bono km cargado ($/km)</label>{numInp(bonoKmCarga, setBonoKmCarga)}</div>
                    <div><label className={lbl}>Bono km vacío ($/km)</label>{numInp(bonoKmVacio, setBonoKmVacio)}</div>
                  </div>
                )}
              </Collapsible>

              {/* 6. Días especiales */}
              <Collapsible title="Días Especiales / Bonos Extra" icon="⏰">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Matutino', rate: HE_TARIFAS.MATUTINO, val: dMatutino, set: setDMatutino },
                    { label: 'Nocturno', rate: HE_TARIFAS.NOCTURNO, val: dNocturno, set: setDNocturno },
                    { label: 'Sábado', rate: HE_TARIFAS.SABADO, val: dSabado, set: setDSabado },
                    { label: 'Domingo', rate: HE_TARIFAS.DOMINGO, val: dDomingo, set: setDDomingo },
                    { label: 'Festivo', rate: HE_TARIFAS.FESTIVO, val: dFestivo, set: setDFestivo },
                    { label: 'TOTAL', rate: 0, val: 0, set: () => { } },
                  ].map((item, i) => i < 5 ? (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                      <p className="text-[11px] text-gray-500 font-semibold mb-0.5">{item.label}</p>
                      <p className="text-[11px] text-green-600 font-bold mb-2">${item.rate.toLocaleString()}/día</p>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => item.set(Math.max(0, item.val - 1))} className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600">
                          <Minus size={10} />
                        </button>
                        <span className="w-8 text-center text-lg font-bold text-[#1e3a5f]">{item.val}</span>
                        <button onClick={() => item.set(item.val + 1)} className="w-6 h-6 rounded-full bg-[#1e3a5f] hover:opacity-80 flex items-center justify-center text-white">
                          <Plus size={10} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key="total" className="bg-amber-50 rounded-xl p-3 text-center border border-amber-200 flex flex-col items-center justify-center">
                      <p className="text-[11px] text-amber-600 font-semibold mb-1">TOTAL EXTRA</p>
                      <p className="text-xl font-extrabold text-amber-600">{mxn(horasExtra)}</p>
                    </div>
                  ))}
                </div>
              </Collapsible>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              {/* Calculate button */}
              <button
                onClick={handleCalcular}
                className="w-full flex items-center justify-center gap-3 py-4 bg-[#1e3a5f] hover:opacity-90 text-white text-base font-extrabold rounded-2xl transition-opacity"
                style={{ boxShadow: '0 4px 14px rgba(30,58,95,0.4)' }}
              >
                <Calculator size={20} /> CALCULAR COTIZACIÓN
              </button>
            </div>

            {/* ── RIGHT: Result ── */}
            <div>
              {result ? (
                <ResultPanel
                  result={result}
                  onAddToBitacora={handleAddToBitacora}
                  onReset={handleReset}
                />
              ) : (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <Calculator size={28} className="text-gray-300" />
                  </div>
                  <p className="font-semibold text-gray-500 mb-1">Sin cotización</p>
                  <p className="text-xs text-gray-400">
                    Llena los datos de la ruta y haz clic en<br />
                    <strong>CALCULAR COTIZACIÓN</strong>
                  </p>
                  <div className="mt-5 pt-5 border-t border-gray-100 text-left">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Costos que incluye el cálculo:</p>
                    {[
                      `⛽ Combustible (precio/litro actual)`,
                      `🛣️ Casetas ida + regreso`,
                      `📉 Depreciación de la unidad`,
                      `🏢 Gastos fijos: GPS, renta, seguro`,
                      `💰 Bonos y viáticos del operador`,
                      `⏰ Días especiales (sábado, festivo…)`,
                      `🏗️ Maniobras`,
                      `📦 Contenedores / Carga`,
                    ].map(item => (
                      <p key={item} className="text-xs text-gray-500 py-1 border-b border-gray-50">{item}</p>
                    ))}
                  </div>
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
