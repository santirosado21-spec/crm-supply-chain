import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, Edit3, Trash2, Route, Send, CheckCircle2, AlertCircle, Loader2, Lock } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useViajes } from '../../hooks/useViajes'
import { useVehiculos } from '../../hooks/useVehiculos'
import { useOperadores } from '../../hooks/useOperadores'
import { useClients } from '../../hooks/useClients'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { supabase } from '../../lib/supabase'
import { ViajeForm, type ViajeFormData } from './components/ViajeForm'
import { ViajeStatusCell } from './components/ViajeStatusCell'
import type { Viaje, ViajeEstado } from '../../types/tms'
import { pushChargeToExtensiv, getChargeStatusForSources, type ChargeStatus } from '../../lib/extensivBilling'

const fmtMoney = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.split('T')[0].split('-')
  return `${day}/${m}/${y}`
}
const notaValue = (notas: string | null | undefined, label: string) => {
  if (!notas) return ''
  const match = notas.match(new RegExp(`${label}:\\s*([^·]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

export function ViajesPage() {
  const { user } = useAuthContext()
  const toast = useToast()
  const [estadoF, setEstadoF] = useState<ViajeEstado | ''>('')
  const [busqueda, setBusqueda] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Viaje | null>(null)

  const { viajes, loading, stats, createViaje, updateViaje, deleteViaje } = useViajes({ estado: estadoF || undefined })
  const { vehiculos } = useVehiculos()
  const { operadores } = useOperadores()
  const { clients, getClients } = useClients()
  useEffect(() => { getClients() }, [getClients])
  const clienteMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients])
  // Fallback a la nota "Cliente: X" para viajes legacy sin cliente_id real (creados antes de este fix).
  const clienteNombre = (v: Viaje) => (v.cliente_id ? clienteMap[v.cliente_id]?.name : undefined) ?? notaValue(v.notas, 'Cliente')

  // Sprint C · estado de charges Extensiv por viaje
  const [chargeStatus, setChargeStatus] = useState<Map<string, ChargeStatus[]>>(new Map())
  const [pushingId, setPushingId]       = useState<string | null>(null)
  const canBill = user?.role === 'admin' || user?.role === 'cobranza'

  // Lookup operations + extensiv_customer_id por operacion_id
  const [opExtensivMap, setOpExtensivMap] = useState<Record<string, { ref: string; customerId: number | null; transactionId: string | null }>>({})

  useEffect(() => {
    const opIds = viajes.filter(v => v.operacion_id).map(v => v.operacion_id!)
    if (opIds.length === 0) return
    supabase
      .from('operations')
      .select('id, referencia, extensiv_customer_id, extensiv_transaction_id')
      .in('id', opIds)
      .then(({ data }) => {
        if (!data) return
        const map: typeof opExtensivMap = {}
        for (const o of data as Array<{ id: string; referencia: string; extensiv_customer_id: number | null; extensiv_transaction_id: string | null }>) {
          map[o.id] = {
            ref:           o.referencia,
            customerId:    o.extensiv_customer_id,
            transactionId: o.extensiv_transaction_id,
          }
        }
        setOpExtensivMap(map)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viajes])

  // Refrescar charge status cuando cambian los viajes
  useEffect(() => {
    if (!canBill || viajes.length === 0) return
    const ids = viajes.map(v => v.id)
    getChargeStatusForSources('viajes', ids).then(setChargeStatus).catch(() => {})
  }, [viajes, canBill])

  // Lookup maps
  const vehiculoMap = Object.fromEntries(vehiculos.map(v => [v.id, v]))
  const operadorMap = Object.fromEntries(operadores.map(o => [o.id, o]))

  // opRefMap derivado del map enriquecido de Extensiv (compat con código existente)
  const opRefMap = useMemo(
    () => Object.fromEntries(Object.entries(opExtensivMap).map(([id, data]) => [id, data.ref])),
    [opExtensivMap],
  )

  const filtered = busqueda
    ? viajes.filter(v => {
        const q = busqueda.toLowerCase()
        const ref = v.operacion_id ? (opRefMap[v.operacion_id] || '') : ''
        const cliente = clienteNombre(v)
        const operador = notaValue(v.notas, 'Operador')
        return v.origen.toLowerCase().includes(q) ||
          v.destino.toLowerCase().includes(q) ||
          ref.toLowerCase().includes(q) ||
          cliente.toLowerCase().includes(q) ||
          operador.toLowerCase().includes(q) ||
          v.notas?.toLowerCase().includes(q)
      })
    : viajes

  // Push manual de charge a Extensiv para un viaje completado
  async function handlePushExtensiv(v: Viaje) {
    const opData = v.operacion_id ? opExtensivMap[v.operacion_id] : undefined
    if (!opData?.customerId) {
      toast.error('Sin cliente Extensiv', 'La operación de este viaje no tiene extensiv_customer_id. Edita la operación primero.')
      return
    }
    if (v.estado !== 'completado') {
      toast.error('Viaje no completado', 'Solo se pueden cobrar viajes en estado "completado".')
      return
    }
    if (!v.ingreso_cliente || v.ingreso_cliente <= 0) {
      toast.error('Sin precio cliente', 'El viaje no tiene ingreso_cliente registrado.')
      return
    }

    setPushingId(v.id)
    try {
      const isProveedor = !!v.proveedor_nombre
      const result = await pushChargeToExtensiv({
        sourceTable:     'viajes',
        sourceId:        v.id,
        customerId:      opData.customerId,
        chargeType:      isProveedor ? 'FLETE_EXTERNO' : 'FLETE_INTERNO',
        amount:          v.ingreso_cliente,
        description:     `Flete ${v.origen} → ${v.destino}${opData.ref ? ' · ' + opData.ref : ''}`,
        referenceNumber: opData.ref || v.id.slice(0, 8),
        shipmentId:      opData.transactionId ?? undefined,
      })

      if (result.ok) {
        toast.success('Charge enviado a Extensiv', `chargeId: ${result.extensivChargeId ?? '—'}`)
      } else {
        toast.error('No se pudo enviar', result.error ?? 'Error desconocido')
      }

      // Refrescar status local
      const ids = viajes.map(x => x.id)
      const fresh = await getChargeStatusForSources('viajes', ids)
      setChargeStatus(fresh)
    } catch (e) {
      toast.error('Error al pushear charge', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setPushingId(null)
    }
  }

  const handleSave = async (data: ViajeFormData) => {
    try {
      if (editTarget) {
        await updateViaje(editTarget.id, data)
      } else {
        await createViaje(data as Viaje)
      }
      setShowForm(false)
      setEditTarget(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  const handleStatusChange = async (id: string, nuevoEstado: ViajeEstado) => {
    try {
      if (nuevoEstado === 'en_transito') {
        await updateViaje(id, { estado: 'en_transito', fecha_salida: new Date().toISOString() })
      } else if (nuevoEstado === 'entregado') {
        await updateViaje(id, { estado: 'entregado', fecha_llegada: new Date().toISOString() })
      } else if (nuevoEstado === 'completado') {
        await updateViaje(id, { estado: 'completado', fecha_completado: new Date().toISOString() })
      } else {
        await updateViaje(id, { estado: nuevoEstado })
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al cambiar estado')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar este viaje?')) return
    try { await deleteViaje(id) } catch { /* silent */ }
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-3 sm:p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f]">Viajes</h1>
              <p className="text-xs text-gray-400 mt-0.5">Despacho y control de viajes de transporte</p>
            </div>
            <button onClick={() => { setEditTarget(null); setShowForm(true) }}
              className="h-10 px-4 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] transition-colors">
              <Plus size={16} /> Nuevo Viaje
            </button>
          </div>

          {/* KPIs — 2x2 en móvil, 4 columnas en tablet+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.total}</p>
              <p className="text-xs text-gray-400 mt-1">Total viajes</p>
            </div>
            <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-amber-600" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.enTransito}</p>
              <p className="text-xs text-gray-400 mt-1">En tránsito</p>
            </div>
            <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-green-600" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.completados}</p>
              <p className="text-xs text-gray-400 mt-1">Completados</p>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4 text-center">
              <p className={`text-2xl font-bold ${stats.margenTotal >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ fontFamily: 'Nunito, sans-serif' }}>
                {fmtMoney(stats.margenTotal)}
              </p>
              <p className="text-xs text-gray-400 mt-1">Margen total</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-3 mb-4 items-end flex-wrap">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Estado</label>
              <select value={estadoF} onChange={e => setEstadoF(e.target.value as ViajeEstado | '')}
                className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20">
                <option value="">Todos</option>
                <option value="confirmado">Confirmado</option>
                <option value="pendiente">Pendiente</option>
                <option value="asignado">Asignado</option>
                <option value="en_transito">En Tránsito</option>
                <option value="entregado">Entregado</option>
                <option value="completado">Completado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Buscar origen/destino/ref/cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 w-56" />
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Ref</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Ruta</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Vehículo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Operador / Prov.</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Km</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Costo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Margen</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-10 text-gray-400">Cargando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-10 text-gray-400">
                    <Route size={32} className="text-gray-200 mx-auto mb-2" />
                    No hay viajes registrados
                  </td></tr>
                ) : filtered.map(v => {
                  const veh = v.vehiculo_id ? vehiculoMap[v.vehiculo_id] : null
                  const op = v.operador_id ? operadorMap[v.operador_id] : null
                  const prov = v.proveedor_nombre
                  const ref = v.operacion_id ? opRefMap[v.operacion_id] : null
                  const cliente = clienteNombre(v)
                  const operadorNota = notaValue(v.notas, 'Operador')
                  const maniobristaNota = notaValue(v.notas, 'Maniobrista')

                  return (
                    <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1e3a5f]">{ref || '—'}</td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-700">{cliente || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-800">{v.origen}</div>
                        <div className="text-[10px] text-gray-400">→ {v.destino}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{veh ? `${veh.placa} · ${veh.tipo}` : '—'}</td>
                      <td className="px-4 py-3">
                        {prov ? (
                          <span className="text-xs text-orange-700">{prov}</span>
                        ) : op ? (
                          <span className="text-xs text-gray-700">{op.nombre}</span>
                        ) : operadorNota ? (
                          <span className="text-xs text-gray-700">
                            {operadorNota}
                            {maniobristaNota && <span className="block text-[10px] text-gray-400">Maniobra: {maniobristaNota}</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ViajeStatusCell estado={v.estado} onChange={(s) => handleStatusChange(v.id, s)} />
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">{v.km_estimados || '—'}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">{fmtMoney(v.costo_total)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-semibold ${v.margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmtMoney(v.margen)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(v.fecha_programada)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {v.facturado_en_proforma_id && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold"
                              title="Este viaje ya fue incluido en una proforma guardada"
                            >
                              <Lock size={10} /> Facturado
                            </span>
                          )}
                          {/* Sprint C · Extensiv Billing — solo si viaje completado y user puede facturar */}
                          {canBill && v.estado === 'completado' && (() => {
                            const charges = chargeStatus.get(v.id) ?? []
                            const sent    = charges.find(c => c.status === 'sent')
                            const failed  = charges.find(c => c.status === 'failed')
                            const isPushing = pushingId === v.id

                            if (sent) {
                              return (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700"
                                  title={`Enviado a Extensiv · chargeId ${sent.extensiv_charge_id}\n${new Date(sent.sent_at ?? '').toLocaleString('es-MX')}`}
                                >
                                  <CheckCircle2 size={12} /> Cobrado
                                </span>
                              )
                            }
                            return (
                              <button
                                onClick={() => handlePushExtensiv(v)}
                                disabled={isPushing}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${
                                  failed
                                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                    : 'bg-[#1e3a5f] text-white hover:opacity-90'
                                }`}
                                title={failed ? `Reintento (último error: ${failed.error_message})` : 'Enviar charge a Extensiv Billing'}
                              >
                                {isPushing
                                  ? <Loader2 className="animate-spin" size={11} />
                                  : failed ? <AlertCircle size={11} /> : <Send size={11} />
                                }
                                {failed ? 'Reintento' : 'Cobrar'}
                              </button>
                            )
                          })()}

                          <button onClick={() => { setEditTarget(v); setShowForm(true) }}
                            className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-[#1e3a5f] transition-colors" title="Editar">
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => handleDelete(v.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {showForm && (
            <ViajeForm
              onSave={handleSave}
              onClose={() => { setShowForm(false); setEditTarget(null) }}
              editData={editTarget}
            />
          )}
        </main>
      </div>
    </div>
  )
}
