import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Gauge,
  MapPin,
  Route,
  Truck,
  TrendingUp,
  UserCheck,
} from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useViajes } from '../../hooks/useViajes'
import { useVehiculos } from '../../hooks/useVehiculos'
import { useOperadores } from '../../hooks/useOperadores'
import type { Viaje, ViajeEstado } from '../../types/tms'

const fmtMoney = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

const estadoLabels: Record<ViajeEstado, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  asignado: 'Asignado',
  en_transito: 'En tránsito',
  entregado: 'Entregado',
  completado: 'Completado',
  cancelado: 'Cancelado',
}

const estadoColors: Record<ViajeEstado, string> = {
  pendiente: '#b45309',
  confirmado: '#0d9488',
  asignado: '#1d4ed8',
  en_transito: '#7c3aed',
  entregado: '#0e7490',
  completado: '#15803d',
  cancelado: '#b91c1c',
}

function topRoutes(viajes: Viaje[]) {
  const map = new Map<string, { label: string; count: number; margin: number }>()
  for (const v of viajes) {
    const label = `${v.origen} → ${v.destino}`
    const current = map.get(label) ?? { label, count: 0, margin: 0 }
    current.count += 1
    current.margin += v.margen || 0
    map.set(label, current)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.margin - a.margin).slice(0, 5)
}

export function TMSDashboard() {
  const { viajes } = useViajes()
  const { vehiculos } = useVehiculos()
  const { operadores } = useOperadores()

  const total = viajes.length
  const activos = viajes.filter(v => v.estado === 'en_transito').length
  const confirmados = viajes.filter(v => v.estado === 'confirmado').length
  const pendientes = viajes.filter(v => v.estado === 'pendiente' || v.estado === 'asignado').length
  const entregados = viajes.filter(v => v.estado === 'entregado').length
  const completados = viajes.filter(v => v.estado === 'completado').length
  const cancelados = viajes.filter(v => v.estado === 'cancelado').length
  const ingresoTotal = viajes.reduce((sum, v) => sum + (v.ingreso_cliente || 0), 0)
  const costoTotal = viajes.reduce((sum, v) => sum + (v.costo_total || 0), 0)
  const margenTotal = viajes.reduce((sum, v) => sum + (v.margen || 0), 0)
  const kmTotales = viajes.reduce((sum, v) => sum + (v.km_estimados || 0), 0)
  const margenPct = ingresoTotal > 0 ? Math.round((margenTotal / ingresoTotal) * 100) : 0
  const ocupacionFlota = vehiculos.length > 0 ? Math.round((activos / vehiculos.length) * 100) : 0
  const rutasFrecuentes = topRoutes(viajes)
  const maxRuta = Math.max(1, ...rutasFrecuentes.map(r => r.count))
  const estados = (Object.keys(estadoLabels) as ViajeEstado[]).map(estado => ({
    estado,
    label: estadoLabels[estado],
    color: estadoColors[estado],
    count: viajes.filter(v => v.estado === estado).length,
  }))

  const kpis = [
    { label: 'Confirmados',       value: confirmados,          icon: CheckCircle2, color: '#0d9488', bg: '#f0fdfa' },
    { label: 'Viajes activos',    value: activos,              icon: Route,        color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Pendientes',        value: pendientes,           icon: Clock,        color: '#b45309', bg: '#fffbeb' },
    { label: 'Entregados',        value: entregados,           icon: CheckCircle2, color: '#0e7490', bg: '#ecfeff' },
    { label: 'Completados',       value: completados,          icon: Truck,        color: '#15803d', bg: '#f0fdf4' },
    { label: 'Margen total',      value: fmtMoney(margenTotal), icon: TrendingUp,   color: margenTotal >= 0 ? '#15803d' : '#b91c1c', bg: margenTotal >= 0 ? '#f0fdf4' : '#fef2f2' },
    { label: 'Ingreso cliente',   value: fmtMoney(ingresoTotal), icon: DollarSign,  color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Costo operativo',   value: fmtMoney(costoTotal), icon: Gauge,        color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Km estimados',      value: kmTotales.toLocaleString('es-MX'), icon: MapPin, color: '#0e7490', bg: '#ecfeff' },
  ]

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6 space-y-6">
          <div className="animate-fade-up">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--brand-navy)' }}>
              TMS Dashboard
            </h1>
            <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>
              Resumen de transporte
            </p>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {kpis.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="animate-fade-up card card-hover p-4 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl" style={{ background: color }} />
                <div className="flex items-start justify-between mb-3 mt-1">
                  <div className="p-2 rounded-xl" style={{ background: bg }}>
                    <Icon size={15} style={{ color }} />
                  </div>
                </div>
                <p className="kpi-number text-[2rem]" style={{ color }}>{value}</p>
                <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-bold text-[#1e3a5f]">Salud operativa</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Distribución por estado y utilización de flota</p>
                </div>
                {cancelados > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700">
                    <AlertTriangle size={12} /> {cancelados} cancelado{cancelados !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total viajes</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#1e3a5f]">{total}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Margen</p>
                  <p className={`mt-1 text-2xl font-extrabold ${margenPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{margenPct}%</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Flota en ruta</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#1e3a5f]">{ocupacionFlota}%</p>
                </div>
              </div>

              <div className="space-y-3">
                {estados.map(({ estado, label, color, count }) => (
                  <div key={estado}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-600">{label}</span>
                      <span className="font-bold text-gray-500">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${total ? Math.max(4, (count / total) * 100) : 0}%`, background: color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-bold text-[#1e3a5f]">Capacidad</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Recursos disponibles para despacho</p>
                </div>
                <Truck size={18} className="text-gray-300" />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl bg-blue-50 p-4">
                  <Truck size={15} className="text-blue-700 mb-2" />
                  <p className="text-2xl font-extrabold text-blue-700">{vehiculos.length}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700/70">Vehículos</p>
                </div>
                <div className="rounded-xl bg-cyan-50 p-4">
                  <UserCheck size={15} className="text-cyan-700 mb-2" />
                  <p className="text-2xl font-extrabold text-cyan-700">{operadores.length}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700/70">Operadores</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Route size={15} className="text-[#1e3a5f]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Rutas frecuentes</h3>
                </div>
                <div className="space-y-3">
                  {rutasFrecuentes.length === 0 ? (
                    <p className="text-xs text-gray-400">Sin viajes registrados todavía</p>
                  ) : rutasFrecuentes.map(r => (
                    <div key={r.label}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-gray-700">{r.label}</p>
                        <span className="text-[10px] font-bold text-gray-400">{r.count} viaje{r.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-[#1e3a5f]" style={{ width: `${(r.count / maxRuta) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 text-center">
            <MapPin size={28} className="mx-auto mb-3 text-gray-300" />
            <h2 className="text-sm font-bold text-gray-500">Mapa de Flota en Vivo</h2>
            <p className="text-xs text-gray-400 mt-1">
              Conecta tu cuenta de Motive para ver ubicaciones GPS en tiempo real
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
