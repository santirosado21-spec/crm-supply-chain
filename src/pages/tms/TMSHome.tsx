import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LayoutDashboard, Truck, UserCheck, Route, PieChart, Calculator, CalendarClock, ArrowRight, Clock, DollarSign, TrendingUp } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { useViajes } from '../../hooks/useViajes'
import { useVehiculos } from '../../hooks/useVehiculos'
import { useOperadores } from '../../hooks/useOperadores'
import { isBaseManiobrista } from '../../lib/tmsCatalog'

interface Tool {
  to: string
  title: string
  description: string
  icon: typeof Truck
  category: 'ops' | 'tms' | 'com'
}

const tools: Tool[] = [
  { to: '/tms/dashboard', title: 'Dashboard',  description: 'KPIs de flota, viajes activos y métricas operativas.', icon: LayoutDashboard, category: 'ops' },
  { to: '/tms/vehiculos', title: 'Vehículos',  description: 'Inventario de flota, mantenimientos y servicios.',     icon: Truck,           category: 'tms' },
  { to: '/tms/operadores',title: 'Operadores', description: 'Directorio de operadores, licencias y documentos.',   icon: UserCheck,       category: 'tms' },
  { to: '/tms/viajes',    title: 'Viajes',     description: 'Registro de viajes, asignaciones y estatus.',          icon: Route,           category: 'tms' },
  { to: '/tms/costos',    title: 'Costos',     description: 'Análisis de costos de transporte por viaje/ruta.',     icon: PieChart,        category: 'tms' },
  { to: '/cotizador',     title: 'Cotizador',  description: 'Cotizador de fletes locales y foráneos.',              icon: Calculator,      category: 'com' },
  { to: '/tramites',      title: 'Trámites',   description: 'Vencimientos, verificaciones y trámites pendientes.',  icon: CalendarClock,   category: 'com' },
]

// Identidad visual unificada: todas las categorías comparten el navy
// brand. La diferenciación visual viene del label, no del color.
const categories = [
  { key: 'ops', label: 'Operaciones', color: '#1e3a5f' },
  { key: 'tms', label: 'Transporte',  color: '#1e3a5f' },
  { key: 'com', label: 'Comercial',   color: '#1e3a5f' },
] as const

export function TMSHome() {
  const navigate = useNavigate()
  const { viajes } = useViajes()
  const { vehiculos } = useVehiculos()
  const { operadores } = useOperadores()

  const pendientes = viajes.filter(v => v.estado === 'pendiente' || v.estado === 'asignado').length
  const enRuta = viajes.filter(v => v.estado === 'en_transito').length
  const ingreso = viajes.reduce((sum, v) => sum + (v.ingreso_cliente || 0), 0)
  const margen = viajes.reduce((sum, v) => sum + (v.margen || 0), 0)
  const operadoresBase = operadores.filter(o => !isBaseManiobrista(o.nombre, o.notas)).length
  const maniobristas = operadores.filter(o => isBaseManiobrista(o.nombre, o.notas)).length

  const indicadores = [
    { label: 'Pendientes', value: pendientes, icon: Clock, color: '#b45309', bg: '#fffbeb' },
    { label: 'En ruta', value: enRuta, icon: Route, color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Ingreso', value: `$${ingreso.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`, icon: DollarSign, color: '#0e7490', bg: '#ecfeff' },
    { label: 'Margen', value: `$${margen.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`, icon: TrendingUp, color: margen >= 0 ? '#15803d' : '#b91c1c', bg: margen >= 0 ? '#f0fdf4' : '#fef2f2' },
    { label: 'Vehículos', value: vehiculos.length, icon: Truck, color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Operadores', value: `${operadoresBase}/${maniobristas}`, icon: UserCheck, color: '#1e3a5f', bg: '#eef2f7' },
  ]

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg, #f5f7fa)' }}>
      <Header />
      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1e3a5f] mb-6 transition-colors"
          >
            <ArrowLeft size={16} /> Volver al inicio
          </button>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[#1e3a5f]">TMS Transportes</h1>
            <p className="text-sm text-gray-500 mt-1">Transport Management System · Flotas, viajes y cotizaciones</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
            {indicadores.map(({ label, value, icon: Icon, color, bg }) => (
              <button
                key={label}
                onClick={() => navigate(label === 'Operadores' ? '/tms/operadores' : label === 'Vehículos' ? '/tms/vehiculos' : '/tms/viajes')}
                className="text-left bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                    <Icon size={17} style={{ color }} />
                  </span>
                  <ArrowRight size={14} className="text-gray-300" />
                </div>
                <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">{label}</p>
              </button>
            ))}
          </div>

          {categories.map(cat => {
            const catTools = tools.filter(t => t.category === cat.key)
            return (
              <div key={cat.key} className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1 h-4 rounded-full" style={{ background: cat.color }} />
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{cat.label}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {catTools.map(tool => {
                    const Icon = tool.icon
                    return (
                      <button
                        key={tool.to}
                        onClick={() => navigate(tool.to)}
                        className="group text-left bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all p-5"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: cat.color + '10' }}>
                            <Icon size={20} style={{ color: cat.color }} />
                          </div>
                          <ArrowRight size={16} className="text-gray-300 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 mb-1">{tool.title}</h3>
                        <p className="text-xs text-gray-500 leading-relaxed">{tool.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
