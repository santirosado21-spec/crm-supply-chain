import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileSpreadsheet, RefreshCw, Printer, Info, Loader2, CloudDownload } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { RCDocument, newItem } from './components/RCDocument'
import type { RCState, RCItem } from './components/RCDocument'
import { useClientCatalog } from '../../hooks/useClientCatalog'
import { useServiciosAdicionales } from '../../hooks/useServiciosAdicionales'
import { supabase } from '../../lib/supabase'
import {
  getExtensivOrdersByCustomer,
  getExtensivReceiversByCustomer,
} from '../../lib/extensiv'

// ── Helpers ───────────────────────────────────────────────────────────────────
const today = new Date().toISOString().split('T')[0]

function emptyRC(): RCState {
  return {
    fecha: today,
    fechaVencimiento: '',
    refInterna: '',
    clienteNombre: '',
    clienteDireccion: '',
    clienteRfc: '',
    formaPago: 'Transferencia bancaria',
    condicionesPago: '30 días netos',
    banco: '',
    metodoPago: '03 - Transferencia electrónica de fondos',
    usoCfdi: 'G03 - Gastos en general',
    ctaBancaria: '',
    referencia: '',
    origenDestino: '',
    producto: '',
    piezas: '',
    pesoKg: '',
    items: [],
  }
}

const inputCls = 'px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f]/20 transition-colors'

// ── Main page ─────────────────────────────────────────────────────────────────
export function RCPage() {
  const { clientes: CLIENTES_BITACORA } = useClientCatalog()
  const { getByClientePeriodo } = useServiciosAdicionales()

  const [clienteF, setClienteF] = useState('')
  const [fechaDesde, setFechaDesde] = useState(today)
  const [fechaHasta, setFechaHasta] = useState(today)
  const [rcState, setRcState] = useState<RCState | null>(null)
  const [generated, setGenerated] = useState(false)
  const [loadingExt, setLoadingExt] = useState(false)
  const [extError, setExtError] = useState('')
  const [extensivId, setExtensivId] = useState<number | null>(null)
  const [loadingExtId, setLoadingExtId] = useState(false)

  // ── Fetch extensiv_customer_id directly from Supabase when client changes ──
  useEffect(() => {
    setExtensivId(null)
    setExtError('')
    if (!clienteF) return
    setLoadingExtId(true)
    supabase
      .from('clients')
      .select('extensiv_customer_id')
      .eq('name', clienteF)
      .eq('is_active', true)
      // maybeSingle: no lanza con 0 filas (cliente sin match) ni con varias
      // (nombres duplicados) — .single() reventaba la promesa en ambos casos.
      .maybeSingle()
      .then(
        ({ data, error }) => {
          setExtensivId(data?.extensiv_customer_id ?? null)
          if (error) setExtError('No se pudo verificar el cliente en Extensiv')
          setLoadingExtId(false)
        },
        () => { setExtError('No se pudo verificar el cliente en Extensiv'); setLoadingExtId(false) },
      )
  }, [clienteF])

  // ── Generate RC from Extensiv API ───────────────────────────────────────
  const handleGenerateFromExtensiv = async () => {
    const cliente = CLIENTES_BITACORA.find(c => c.nombre === clienteF)
    if (!cliente) return

    if (!extensivId) {
      setExtError(`El cliente "${clienteF}" no tiene un ID de Extensiv configurado. Configúralo en la tabla clients.`)
      return
    }

    setLoadingExt(true)
    setExtError('')

    try {
      // Fetch orders, receivers, and tarifarios in parallel
      const [orders, receivers, tarifasRes] = await Promise.all([
        getExtensivOrdersByCustomer(extensivId, fechaDesde, fechaHasta),
        getExtensivReceiversByCustomer(extensivId, fechaDesde, fechaHasta),
        supabase
          .from('tarifarios')
          .select('concepto, precio, categoria')
          .eq('cliente_codigo', cliente.codigo)
          .eq('activo', true),
      ])

      // Build tariff lookup — normalize to lowercase for fuzzy matching
      const tarifas = (tarifasRes.data ?? []) as { concepto: string; precio: number; categoria: string }[]
      const findTarifa = (keywords: string[]): number => {
        for (const kw of keywords) {
          const match = tarifas.find(t => t.concepto.toLowerCase().includes(kw.toLowerCase()))
          if (match) return match.precio
        }
        return 0
      }

      // Tariff prices for this client
      const precioSalidaTarima = findTarifa(['salida por tarima', 'salida', 'out'])
      const precioEntradaTarima = findTarifa(['entrada por tarima', 'entrada', 'in '])
      const precioPicking = findTarifa(['picking por pieza', 'picking'])
      const precioProcesamiento = findTarifa(['procesamiento', 'surtido de orden'])

      // Map orders to RC items with pricing
      let itemNo = 0
      const orderItems: RCItem[] = orders.map((o) => {
        itemNo++
        const units = o.numUnits1 || 1
        // Each order = salida tarimas + picking
        const costoSalida = precioSalidaTarima * Math.ceil(units / 30) // ~30 pzas por tarima approx
        const costoPicking = precioPicking * units
        const costoProcesamiento = precioProcesamiento * units
        const costoVenta = costoSalida + costoPicking + costoProcesamiento

        return {
          id: `ord-${o.orderId}`,
          no: itemNo,
          concepto: `Salida — ${o.referenceNum || o.poNum || `#${o.orderId}`} (${units} pzas)${o.routingInfo?.shipTo ? ` → ${o.routingInfo.shipTo}` : ''}`,
          cantidad: 1,
          proveedor: o.routingInfo?.carrier || '',
          folioFactura: '',
          costoProveedor: 0,
          costoVenta: Math.round(costoVenta * 100) / 100,
          profit: Math.round(costoVenta * 100) / 100,
        }
      })

      // Map receivers to RC items with pricing
      const receiverItems: RCItem[] = receivers.map((r) => {
        itemNo++
        const units = r.numUnits1 || 1
        const costoEntrada = precioEntradaTarima * Math.ceil(units / 30)
        const costoVenta = costoEntrada

        return {
          id: `rcv-${r.receiverId}`,
          no: itemNo,
          concepto: `Entrada — ${r.referenceNum || r.poNum || `#${r.receiverId}`} (${units} pzas)`,
          cantidad: 1,
          proveedor: '',
          folioFactura: '',
          costoProveedor: 0,
          costoVenta: Math.round(costoVenta * 100) / 100,
          profit: Math.round(costoVenta * 100) / 100,
        }
      })

      // Servicios adicionales from Supabase
      let svcItems: RCItem[] = []
      const servicios = await getByClientePeriodo(cliente.codigo, fechaDesde, fechaHasta)
      svcItems = servicios.map((svc) => {
        itemNo++
        return {
          id: svc.id,
          no: itemNo,
          concepto: `${svc.concepto}${svc.descripcion ? ' — ' + svc.descripcion : ''}`,
          cantidad: Number(svc.cantidad),
          proveedor: '',
          folioFactura: '',
          costoProveedor: 0,
          costoVenta: svc.subtotal,
          profit: svc.subtotal,
        }
      })

      const allItems = [...orderItems, ...receiverItems, ...svcItems]

      // Total weight/units summary
      const totalPiezas = orders.reduce((s, o) => s + o.numUnits1, 0) + receivers.reduce((s, r) => s + r.numUnits1, 0)
      const totalPeso = orders.reduce((s, o) => s + o.totalWeight, 0) + receivers.reduce((s, r) => s + r.totalWeight, 0)

      // Shipping destinations
      const destinos = [...new Set(orders.filter(o => o.routingInfo?.shipTo).map(o => o.routingInfo!.shipTo!))]

      setRcState({
        ...emptyRC(),
        clienteNombre: clienteF,
        fecha: fechaDesde,
        refInterna: `Extensiv ${fechaDesde} — ${fechaHasta}`,
        origenDestino: destinos.join(', '),
        piezas: totalPiezas > 0 ? String(totalPiezas) : '',
        pesoKg: totalPeso > 0 ? String(Math.round(totalPeso * 100) / 100) : '',
        items: allItems.length > 0 ? allItems : [newItem(1)],
      })
      setGenerated(true)
    } catch (e) {
      setExtError(e instanceof Error ? e.message : 'Error al consultar Extensiv')
    } finally {
      setLoadingExt(false)
    }
  }

  // ── Blank RC ──────────────────────────────────────────────────────────────
  const handleBlank = () => {
    setRcState({ ...emptyRC(), clienteNombre: clienteF, items: [newItem(1)] })
    setGenerated(true)
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  const handlePDF = () => {
    const style = document.createElement('style')
    style.id = 'rc-print-inject'
    style.textContent = `
      @media print {
        .rc-no-print { display: none !important; }
        body { background: white !important; margin: 0 !important; }
        #rc-document {
          box-shadow: none !important;
          border-radius: 0 !important;
          border: none !important;
          margin: 0 !important;
          width: 100% !important;
        }
        .rc-print-wrapper {
          padding: 0 !important;
          margin: 0 !important;
          overflow: visible !important;
        }
      }
    `
    document.head.appendChild(style)
    window.print()
    window.addEventListener('afterprint', () => {
      document.getElementById('rc-print-inject')?.remove()
    }, { once: true })
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  const handleExcel = () => {
    if (!rcState) return

    const { items, clienteNombre, fecha, fechaVencimiento, refInterna,
      clienteDireccion, clienteRfc, formaPago, condicionesPago,
      banco, metodoPago, usoCfdi, ctaBancaria,
      referencia, origenDestino, producto, piezas, pesoKg } = rcState

    const subtotal = items.reduce((s, it) => s + it.costoVenta, 0)
    const iva = subtotal * 0.16
    const total = subtotal + iva

    const rows: (string | number | null)[][] = [
      ['RENDICIÓN DE CUENTAS', null, null, null, null, null, null, null],
      [],
      ['FECHA:', fecha, null, null, 'REF. INTERNA:', refInterna, null, null],
      ['VENCIMIENTO:', fechaVencimiento, null, null, null, null, null, null],
      [],
      ['── DATOS DEL CLIENTE ──', null, null, null, '── DATOS DE PAGO ──', null, null, null],
      ['CLIENTE:', clienteNombre, null, null, 'FORMA DE PAGO:', formaPago, null, null],
      ['DIRECCIÓN:', clienteDireccion, null, null, 'CONDICIONES:', condicionesPago, null, null],
      ['R.F.C.:', clienteRfc, null, null, 'BANCO:', banco, null, null],
      [null, null, null, null, 'MÉTODO DE PAGO:', metodoPago, null, null],
      [null, null, null, null, 'USO DE CFDI:', usoCfdi, null, null],
      [null, null, null, null, 'CTA BANCARIA:', ctaBancaria, null, null],
      [],
      ['── LOGÍSTICA ──', null, null, null, null, null, null, null],
      ['REFERENCIA:', referencia, null, 'ORIGEN-DESTINO:', origenDestino, null, 'PRODUCTO:', producto],
      ['PIEZAS:', piezas, null, 'PESO (KG):', pesoKg, null, null, null],
      [],
      ['No.', 'Concepto', 'Cant.', 'Proveedor', 'Folio Fact.', 'Costo Proveedor', 'Profit', 'Costo Venta'],
      ...items.map(it => [
        it.no, it.concepto, it.cantidad, it.proveedor,
        it.folioFactura, it.costoProveedor, it.profit, it.costoVenta,
      ]),
      [],
      [null, null, null, null, null, null, 'SUBTOTAL:', subtotal],
      [null, null, null, null, null, null, 'IVA (16%):', iva],
      [null, null, null, null, null, null, 'TOTAL:', total],
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rendición de Cuentas')

    const fileName = `RC_${clienteNombre || 'SCC'}_${fecha}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const hasExtensivId = !!extensivId

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <div className="print:hidden">
        <Header />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="print:hidden">
          <Sidebar />
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6 rc-print-wrapper">

          {/* ── Page header ─────────────────────────────────────────────── */}
          <div className="rc-no-print flex items-start justify-between mb-6 flex-wrap gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f]">Rendición de Cuentas</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Genera el documento formal de costos desde Extensiv o en blanco
              </p>
            </div>
            {generated && rcState && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => { setRcState(null); setGenerated(false); setExtError('') }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <RefreshCw size={14} /> Nueva RC
                </button>
                <button
                  onClick={handlePDF}
                  className="flex items-center gap-1.5 text-sm text-white bg-[#dc3545] hover:opacity-90 px-4 py-2 rounded-lg font-medium transition-opacity"
                  style={{ boxShadow: '0 2px 6px rgba(220,53,69,0.3)' }}
                >
                  <Printer size={14} /> Exportar PDF
                </button>
                <button
                  onClick={handleExcel}
                  className="flex items-center gap-1.5 text-sm text-white bg-[#28a745] hover:opacity-90 px-4 py-2 rounded-lg font-medium transition-opacity"
                  style={{ boxShadow: '0 2px 6px rgba(40,167,69,0.3)' }}
                >
                  <FileSpreadsheet size={14} /> Exportar Excel
                </button>
              </div>
            )}
          </div>

          {/* ── Selector card ────────────────────────────────────────────── */}
          {!generated && (
            <div className="rc-no-print bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 max-w-3xl">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4">
                Filtros de búsqueda
              </p>

              <div className="flex flex-wrap gap-4 items-end">
                {/* Client */}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Cliente
                  </label>
                  <select
                    className={`${inputCls} w-full`}
                    value={clienteF}
                    onChange={e => { setClienteF(e.target.value); setExtError('') }}
                  >
                    <option value="">— Seleccionar cliente —</option>
                    {CLIENTES_BITACORA.map(c => (
                      <option key={c.codigo} value={c.nombre}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Date from */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={fechaDesde}
                    onChange={e => setFechaDesde(e.target.value)}
                  />
                </div>

                {/* Date to */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={fechaHasta}
                    onChange={e => setFechaHasta(e.target.value)}
                  />
                </div>
              </div>

              {/* Extensiv status hint */}
              {clienteF && (
                <div className={`mt-4 flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                  hasExtensivId
                    ? 'text-green-700 bg-green-50 border border-green-100'
                    : 'text-amber-700 bg-amber-50 border border-amber-100'
                }`}>
                  <Info size={14} className="shrink-0" />
                  {hasExtensivId
                    ? `Cliente vinculado a Extensiv (ID: ${extensivId}). Puedes generar la RC desde la API.`
                    : `Este cliente no tiene ID de Extensiv. Solo puedes crear un documento en blanco.`}
                </div>
              )}

              {/* Error message */}
              {extError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <Info size={14} className="shrink-0 text-red-400" />
                  {extError}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleGenerateFromExtensiv}
                  disabled={!clienteF || !hasExtensivId || loadingExt || loadingExtId}
                  className="flex items-center gap-2 bg-[#1e3a5f] hover:opacity-90 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-opacity"
                  style={{ boxShadow: '0 2px 8px rgba(30,58,95,0.3)' }}
                >
                  {loadingExt
                    ? <><Loader2 size={15} className="animate-spin" /> Consultando Extensiv...</>
                    : <><CloudDownload size={15} /> Generar desde Extensiv</>
                  }
                </button>
                <button
                  onClick={handleBlank}
                  disabled={!clienteF}
                  className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
                >
                  <Download size={15} /> Documento en blanco
                </button>
              </div>
            </div>
          )}

          {/* ── Document ─────────────────────────────────────────────────── */}
          {generated && rcState && (
            <>
              {/* Info banner above document (hidden on print) */}
              <div className="rc-no-print flex items-center gap-2 text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 max-w-4xl">
                <Info size={14} className="text-amber-500 shrink-0" />
                Todos los campos son editables — haz clic para modificar antes de exportar.
                El Profit se calcula automáticamente (Costo Venta − Costo Proveedor).
              </div>

              <div className="max-w-4xl">
                <RCDocument
                  state={rcState}
                  onChange={patch => setRcState(prev => prev ? { ...prev, ...patch } : prev)}
                />
              </div>

              {/* Action buttons below document */}
              <div className="rc-no-print flex items-center gap-3 mt-5 max-w-4xl">
                <button
                  onClick={handlePDF}
                  className="flex items-center gap-2 text-sm text-white bg-[#dc3545] hover:opacity-90 px-5 py-2.5 rounded-xl font-semibold transition-opacity"
                  style={{ boxShadow: '0 2px 6px rgba(220,53,69,0.3)' }}
                >
                  <Printer size={15} /> Exportar PDF / Imprimir
                </button>
                <button
                  onClick={handleExcel}
                  className="flex items-center gap-2 text-sm text-white bg-[#28a745] hover:opacity-90 px-5 py-2.5 rounded-xl font-semibold transition-opacity"
                  style={{ boxShadow: '0 2px 6px rgba(40,167,69,0.3)' }}
                >
                  <FileSpreadsheet size={15} /> Exportar Excel (.xlsx)
                </button>
              </div>
            </>
          )}

        </main>
      </div>
    </div>
  )
}
