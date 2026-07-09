import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { useVehiculos } from '../../../hooks/useVehiculos'
import { useOperadores } from '../../../hooks/useOperadores'
import { useClients } from '../../../hooks/useClients'
import { ExtensivOperationPicker } from '../../../components/features/ExtensivOperationPicker'
import type { ExtensivPickResult } from '../../../lib/extensiv'
import type { Viaje } from '../../../types/tms'
import { isBaseManiobrista, isCatalogOperador } from '../../../lib/tmsCatalog'

export interface ViajeFormData {
  operacion_id: string | null
  vehiculo_id: string | null
  operador_id: string | null
  proveedor_nombre: string | null
  origen: string
  destino: string
  km_estimados: number
  km_reales: number
  estado: 'pendiente' | 'asignado'
  fecha_programada: string | null
  costo_combustible: number
  costo_casetas: number
  costo_viaticos: number
  costo_proveedor: number
  ingreso_cliente: number
  notas: string
  creado_por: string
  cliente_id: string | null
  cliente_codigo: string | null
  referencia_origen: 'extensiv' | 'manual' | null
  extensiv_transaction_type: 'order' | 'receipt' | null
  extensiv_transaction_id: string | null
  extensiv_customer_id: number | null
  referencia_manual: string | null
}

/** Reconstruye el ExtensivPickResult inicial del picker a partir de un viaje ya guardado (modo editar). */
function initialPickResult(editData: Viaje | null | undefined): ExtensivPickResult | null {
  if (!editData?.referencia_origen) return null
  if (editData.referencia_origen === 'extensiv') {
    return {
      type: editData.extensiv_transaction_type ?? 'order',
      customerId: editData.extensiv_customer_id,
      customerName: null,
      transactionId: editData.extensiv_transaction_id,
      reference: null,
      poNum: null,
      creationDate: null,
    }
  }
  return {
    type: 'manual',
    customerId: null,
    customerName: null,
    transactionId: null,
    reference: editData.referencia_manual,
    poNum: null,
    creationDate: null,
  }
}

interface Props {
  onSave: (data: ViajeFormData) => void
  onClose: () => void
  editData?: Viaje | null
}

const inputCls = 'w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20'
const labelCls = 'text-xs font-semibold text-gray-500 mb-1 block'
const today = new Date().toISOString().split('T')[0]
const notaValue = (notas: string | null | undefined, label: string) => {
  if (!notas) return ''
  const match = notas.match(new RegExp(`${label}:\\s*([^·]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}
const withNota = (notas: string, label: string, value: string) => {
  const parts = notas.split('·').map(p => p.trim()).filter(Boolean)
    .filter(p => !p.toLowerCase().startsWith(`${label.toLowerCase()}:`))
  if (value.trim()) parts.push(`${label}: ${value.trim()}`)
  return parts.join(' · ')
}

export function ViajeForm({ onSave, onClose, editData }: Props) {
  const { vehiculos } = useVehiculos()
  const { operadores } = useOperadores()
  const { clients, getClients } = useClients()
  useEffect(() => { getClients() }, [getClients])

  const [operacionId] = useState(editData?.operacion_id ?? '')
  const [vehiculoId, setVehiculoId] = useState(editData?.vehiculo_id ?? '')
  const [operadorId, setOperadorId] = useState(editData?.operador_id ?? '')
  const [clienteId, setClienteId] = useState(editData?.cliente_id ?? '')
  const [pickResult, setPickResult] = useState<ExtensivPickResult | null>(() => initialPickResult(editData))
  const [maniobrista, setManiobrista] = useState(notaValue(editData?.notas, 'Maniobrista'))
  const [proveedorNombre, setProveedorNombre] = useState(editData?.proveedor_nombre ?? '')
  const [usaExterno, setUsaExterno] = useState(!!editData?.proveedor_nombre)
  const [origen, setOrigen] = useState(editData?.origen ?? '')
  const [destino, setDestino] = useState(editData?.destino ?? '')
  const [kmEstimados, setKmEstimados] = useState(String(editData?.km_estimados ?? '0'))
  const [fechaProgramada, setFechaProgramada] = useState(editData?.fecha_programada ?? today)
  const [costoCombustible, setCostoCombustible] = useState(String(editData?.costo_combustible ?? '0'))
  const [costoCasetas, setCostoCasetas] = useState(String(editData?.costo_casetas ?? '0'))
  const [costoViaticos, setCostoViaticos] = useState(String(editData?.costo_viaticos ?? '0'))
  const [costoProveedor, setCostoProveedor] = useState(String(editData?.costo_proveedor ?? '0'))
  const [ingresoCliente, setIngresoCliente] = useState(String(editData?.ingreso_cliente ?? '0'))
  const [notas, setNotas] = useState(editData?.notas ?? '')

  const costoTotal = (parseFloat(costoCombustible) || 0) + (parseFloat(costoCasetas) || 0) + (parseFloat(costoViaticos) || 0) + (parseFloat(costoProveedor) || 0)
  const margen = (parseFloat(ingresoCliente) || 0) - costoTotal
  const operadoresPropios = operadores.filter(o => o.es_propio && !isBaseManiobrista(o.nombre, o.notas))
  const maniobristas = operadores.filter(o => o.es_propio && isBaseManiobrista(o.nombre, o.notas))
  const operadorSeleccionado = operadoresPropios.find(o => o.id === operadorId)

  const canSave =
    origen.trim().length > 0
    && destino.trim().length > 0
    && !!clienteId
    && pickResult !== null
    && (pickResult.type !== 'manual' || !!pickResult.reference?.trim())
  const hasAssignment = vehiculoId || proveedorNombre

  const handleSubmit = () => {
    if (!canSave || !pickResult) return
    const cliente = clients.find(c => c.id === clienteId)
    const operadorNombre = operadorSeleccionado?.nombre ?? ''
    const operadorIdReal = operadorSeleccionado && !isCatalogOperador(operadorSeleccionado.id) ? operadorSeleccionado.id : null
    const notasFinales = [
      ['Operador', operadorNombre],
      ['Maniobrista', maniobrista],
    ].reduce((acc, [label, value]) => withNota(acc, label, value), notas)
    const isExt = pickResult.type === 'order' || pickResult.type === 'receipt'

    onSave({
      operacion_id: operacionId || null,
      vehiculo_id: usaExterno ? null : (vehiculoId || null),
      operador_id: usaExterno ? null : operadorIdReal,
      proveedor_nombre: usaExterno ? (proveedorNombre.trim() || null) : null,
      origen: origen.trim(),
      destino: destino.trim(),
      km_estimados: parseFloat(kmEstimados) || 0,
      km_reales: editData?.km_reales ?? 0,
      estado: hasAssignment ? 'asignado' : 'pendiente',
      fecha_programada: fechaProgramada || null,
      costo_combustible: parseFloat(costoCombustible) || 0,
      costo_casetas: parseFloat(costoCasetas) || 0,
      costo_viaticos: parseFloat(costoViaticos) || 0,
      costo_proveedor: parseFloat(costoProveedor) || 0,
      ingreso_cliente: parseFloat(ingresoCliente) || 0,
      notas: notasFinales,
      creado_por: 'Admin',
      cliente_id: clienteId,
      cliente_codigo: cliente?.codigo ?? null,
      referencia_origen: isExt ? 'extensiv' : 'manual',
      extensiv_transaction_type: isExt ? (pickResult.type as 'order' | 'receipt') : null,
      extensiv_transaction_id: isExt ? (pickResult.transactionId ?? null) : null,
      extensiv_customer_id: isExt ? (pickResult.customerId ?? null) : null,
      referencia_manual: isExt ? null : (pickResult.reference ?? null),
    })
  }

  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#1e3a5f]">{editData ? 'Editar Viaje' : 'Nuevo Viaje'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          {/* Cliente + vínculo (transacción Extensiv o referencia manual) — un único selector */}
          <div>
            <label className={labelCls}>Cliente y referencia *</label>
            <ExtensivOperationPicker
              value={pickResult}
              onChange={setPickResult}
              clients={clients}
              clientId={clienteId}
              onClientChange={id => { setClienteId(id); setPickResult(null) }}
              fromDays={7}
            />
          </div>

          {/* Origen / Destino */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Origen *</label>
              <input value={origen} onChange={e => setOrigen(e.target.value)} placeholder="CDMX / Almacén SC" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Destino *</label>
              <input value={destino} onChange={e => setDestino(e.target.value)} placeholder="Monterrey / Cliente" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Km estimados</label>
              <input type="number" min={0} value={kmEstimados} onChange={e => setKmEstimados(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha programada</label>
              <input type="date" value={fechaProgramada} onChange={e => setFechaProgramada(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Tipo de asignación */}
          <div>
            <label className={labelCls}>Asignación</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setUsaExterno(false)}
                className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-colors ${!usaExterno ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200'}`}>
                Flota propia
              </button>
              <button type="button" onClick={() => setUsaExterno(true)}
                className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-colors ${usaExterno ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                Proveedor externo
              </button>
            </div>
          </div>

          {usaExterno ? (
            <div>
              <label className={labelCls}>Proveedor</label>
              <input
                value={proveedorNombre}
                onChange={e => setProveedorNombre(e.target.value)}
                placeholder="Nombre del proveedor"
                className={inputCls}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Vehículo</label>
                <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {vehiculos.filter(v => v.es_propio).map(v => (
                    <option key={v.id} value={v.id}>{v.placa} — {v.modelo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Operador</label>
                <select value={operadorId} onChange={e => setOperadorId(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {operadoresPropios.map(o => (
                    <option key={o.id} value={o.id}>{o.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Maniobrista</label>
                <select value={maniobrista} onChange={e => setManiobrista(e.target.value)} className={inputCls}>
                  <option value="">Sin maniobrista</option>
                  {maniobristas.map(o => (
                    <option key={o.id} value={o.nombre}>{o.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Costos */}
          <div>
            <label className={`${labelCls} mb-2`}>Costos</label>
            <div className="grid grid-cols-2 gap-3">
              {usaExterno ? (
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-400 mb-0.5 block">Costo proveedor</label>
                  <input type="number" min={0} value={costoProveedor} onChange={e => setCostoProveedor(e.target.value)} className={inputCls} />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Combustible</label>
                    <input type="number" min={0} value={costoCombustible} onChange={e => setCostoCombustible(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Casetas</label>
                    <input type="number" min={0} value={costoCasetas} onChange={e => setCostoCasetas(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 mb-0.5 block">Viáticos</label>
                    <input type="number" min={0} value={costoViaticos} onChange={e => setCostoViaticos(e.target.value)} className={inputCls} />
                  </div>
                </>
              )}
              <div>
                <label className="text-[10px] text-gray-400 mb-0.5 block">Ingreso cliente</label>
                <input type="number" min={0} value={ingresoCliente} onChange={e => setIngresoCliente(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Resumen */}
          <div className="flex gap-3">
            <div className="flex-1 h-10 px-3 rounded-lg border border-gray-100 bg-gray-50 text-sm flex items-center font-semibold text-gray-700">
              Costo: {fmt(costoTotal)}
            </div>
            <div className={`flex-1 h-10 px-3 rounded-lg border text-sm flex items-center font-bold ${margen >= 0 ? 'border-green-100 bg-green-50 text-green-700' : 'border-red-100 bg-red-50 text-red-700'}`}>
              Margen: {fmt(margen)}
            </div>
          </div>

          <div>
            <label className={labelCls}>Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones (opcional)" className={inputCls} />
          </div>

          <button onClick={handleSubmit} disabled={!canSave}
            className="w-full h-10 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40">
            <Save size={16} /> {editData ? 'Guardar Cambios' : 'Crear Viaje'}
          </button>
        </div>
      </div>
    </div>
  )
}
