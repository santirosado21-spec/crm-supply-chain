import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ScanBarcode, FileCheck, FileText, Users, ArrowRight, FileInput, RefreshCw, AlertTriangle, TrendingUp, Package, Wifi, Warehouse, UserCheck, LayoutDashboard, BarChart3, Calendar } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useWMSOperationsData } from '../../hooks/useWMSOperationsData'

interface Tool {
  to: string
  title: string
  description: string
  icon: typeof ScanBarcode
  category: 'sac' | 'facturacion' | 'catalogo' | 'almacen'
}

const tools: Tool[] = [
  {
    to: '/calendario',
    title: 'Calendario',
    description: 'Bandeja de tareas — crea y sigue solicitudes hacia almacén.',
    icon: Calendar,
    category: 'sac',
  },
  {
    to: '/sac/validador',
    title: 'Validador de SKUs',
    description: 'Cruza Pick Tickets contra inventario de Extensiv y detecta faltantes.',
    icon: ScanBarcode,
    category: 'sac',
  },
  {
    to: '/sac/receipt-generator',
    title: 'Generador Receipt',
    description: 'Genera el Excel Receipt_Import_Template para Extensiv desde un PT (PDF o Excel).',
    icon: FileInput,
    category: 'sac',
  },
  {
    to: '/rc',
    title: 'Generador de RC',
    description: 'Genera Relaciones de Cobro mensuales por cliente con servicios y operaciones.',
    icon: FileCheck,
    category: 'facturacion',
  },
  {
    to: '/clients',
    title: 'Clientes',
    description: 'Directorio de clientes del CEDIS.',
    icon: Users,
    category: 'catalogo',
  },
  {
    to: '/almacen',
    title: 'CEDIS Lerma',
    description: 'Vista operativa de posiciones, ocupación y layout de bodega.',
    icon: Warehouse,
    category: 'almacen',
  },
  {
    to: '/almacen/distribucion',
    title: 'Distribución',
    description: 'Inbox de tareas y distribución operativa para almacén.',
    icon: UserCheck,
    category: 'almacen',
  },
  {
    to: '/almacen/pizarron',
    title: 'Pizarrón',
    description: 'Tablero de operaciones del CEDIS para seguimiento diario.',
    icon: LayoutDashboard,
    category: 'almacen',
  },
  {
    to: '/almacen/pizarron-admin',
    title: 'Pizarrón Admin',
    description: 'Administración de tareas y configuración del pizarrón.',
    icon: BarChart3,
    category: 'almacen',
  },
]

// Identidad visual unificada: todas las categorías navy.
const categories = [
  { key: 'sac', label: 'SAC', color: '#1e3a5f' },
  { key: 'facturacion', label: 'Facturación', color: '#1e3a5f' },
  { key: 'catalogo', label: 'Catálogos', color: '#1e3a5f' },
  { key: 'almacen', label: 'Almacén', color: '#1e3a5f' },
] as const

export function WMSHome() {
  const navigate = useNavigate()
  const ops = useWMSOperationsData()

  const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(n)

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1e3a5f] mb-4 transition-colors"
          >
            <ArrowLeft size={16} /> Volver al inicio
          </button>

          <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#1e3a5f]">Herramientas de WMS</h1>
              <p className="text-sm text-gray-500 mt-1">
                Resumen operativo del mes y herramientas de SAC / facturación
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill status={ops.status} lastFetch={ops.lastFetch} />
              <button
                onClick={ops.fetchNow}
                disabled={ops.status === 'loading'}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                <RefreshCw size={11} className={ops.status === 'loading' ? 'animate-spin' : ''} />
                Actualizar
              </button>
            </div>
          </div>

          {/* ─── KPIs del mes ─── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-4 rounded-full bg-[#1e3a5f]" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Resumen del mes</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI
                label="Proformas pendientes"
                value={ops.proformasPendientes}
                icon={FileText}
                color="#d97706"
              />
              <KPI
                label="RC en progreso"
                value={ops.rcEnProgreso}
                icon={FileCheck}
                color="#7c3aed"
                onClick={() => navigate('/rc')}
              />
              <KPI
                label="Servicios sin cobrar"
                value={ops.serviciosSinCobrar}
                icon={Package}
                color="#0891b2"
              />
              <KPI
                label="MXN facturado"
                value={fmtMXN(ops.proformasTotalMXN)}
                icon={TrendingUp}
                color="#059669"
                isText
              />
            </div>
          </div>

          {/* ─── Inventory health ─── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-4 rounded-full bg-[#1e3a5f]" />
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Salud de inventario</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-gray-500">Clientes activos</p>
                  <Users size={14} className="text-gray-300" />
                </div>
                <p className="text-2xl font-bold text-[#1e3a5f]">{ops.totalClientesActivos}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">en el CRM</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-gray-500">Con inventario</p>
                  <Package size={14} className="text-green-500" />
                </div>
                <p className="text-2xl font-bold text-green-600">{ops.clientesConInventario}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">activamente usando el CEDIS</p>
              </div>
              <div className={`bg-white rounded-xl border ${ops.clientesSinStock > 0 ? 'border-amber-200' : 'border-gray-100'} shadow-sm p-4`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-gray-500">Sin stock</p>
                  {ops.clientesSinStock > 0 && <AlertTriangle size={14} className="text-amber-500" />}
                </div>
                <p className={`text-2xl font-bold ${ops.clientesSinStock > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{ops.clientesSinStock}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">registrados pero sin inventario</p>
              </div>
            </div>
          </div>

          {/* ─── Top 5 clientes ─── */}
          {ops.topClientes.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1 h-4 rounded-full bg-[#1e3a5f]" />
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Top clientes por ocupación</h2>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/60 border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-gray-500">#</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-gray-500">Cliente</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-gray-500">Código</th>
                      <th className="text-right px-4 py-2 text-[10px] font-bold uppercase text-gray-500">Posiciones</th>
                      <th className="text-right px-4 py-2 text-[10px] font-bold uppercase text-gray-500">Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.topClientes.map((c, idx) => (
                      <tr key={c.customerId} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-xs text-gray-400 font-mono">{idx + 1}</td>
                        <td className="px-4 py-2 text-sm font-semibold text-gray-800">{c.customerName}</td>
                        <td className="px-4 py-2 text-xs font-mono text-gray-500">{c.codigo ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-sm text-[#1e3a5f] font-bold">{c.positions}</td>
                        <td className="px-4 py-2 text-right text-xs text-gray-600">{c.totalUnits.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Herramientas ─── */}
          {categories.map(cat => {
            const catTools = tools.filter(t => t.category === cat.key)
            return (
              <div key={cat.key} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1 h-4 rounded-full" style={{ background: cat.color }} />
                  <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                    {cat.label}
                  </h2>
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
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: cat.color + '10' }}
                          >
                            <Icon size={20} style={{ color: cat.color }} />
                          </div>
                          <ArrowRight
                            size={16}
                            className="text-gray-300 group-hover:text-gray-600 group-hover:translate-x-1 transition-all"
                          />
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
        </main>
      </div>
    </div>
  )
}

function KPI({
  label, value, icon: Icon, color, onClick, isText,
}: {
  label: string
  value: number | string
  icon: typeof ScanBarcode
  color: string
  onClick?: () => void
  isText?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left transition-all ${onClick ? 'hover:shadow-md hover:border-gray-200 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-gray-500">{label}</p>
        <Icon size={14} style={{ color }} />
      </div>
      <p className={`font-bold ${isText ? 'text-lg' : 'text-2xl'}`} style={{ color }}>{value}</p>
    </button>
  )
}

function StatusPill({ status, lastFetch }: { status: string; lastFetch: Date | null }) {
  const colors = {
    loading: { bg: '#f3f4f6', color: '#6b7280', label: 'Cargando...' },
    ready:   { bg: '#f0fdf4', color: '#16a34a', label: 'Actualizado' },
    cache:   { bg: '#fffbeb', color: '#d97706', label: 'Cache' },
    error:   { bg: '#fef2f2', color: '#dc2626', label: 'Error' },
  }[status] ?? { bg: '#f3f4f6', color: '#6b7280', label: status }

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-full"
      style={{ background: colors.bg }}
    >
      <Wifi size={10} style={{ color: colors.color }} />
      <span className="text-[10px] font-bold tracking-wider" style={{ color: colors.color }}>{colors.label}</span>
      {lastFetch && (
        <span className="text-[10px] text-gray-400">
          {lastFetch.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
}
