import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, LayoutDashboard, BarChart3, UserCheck } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'

interface Tool {
  to: string
  title: string
  description: string
  icon: typeof LayoutDashboard
  category: 'operacion' | 'admin'
}

const tools: Tool[] = [
  {
    to: '/almacen/pizarron',
    title: 'Pizarrón Operaciones',
    description: 'Tablero en vivo del CEDIS — tareas en cola, en progreso y completadas.',
    icon: LayoutDashboard,
    category: 'operacion',
  },
  {
    to: '/almacen/distribucion',
    title: 'Distribución de tareas',
    description: 'Bandeja de solicitudes entrantes para distribuir al equipo.',
    icon: UserCheck,
    category: 'operacion',
  },
  {
    to: '/almacen/pizarron-admin',
    title: 'Pizarrón Admin',
    description: 'Administrar áreas, asignar personas (con o sin cuenta) y dar tiempos estimados.',
    icon: BarChart3,
    category: 'admin',
  },
]

const categories = [
  { key: 'operacion', label: 'Operación', color: '#1e3a5f' },
  { key: 'admin', label: 'Administración', color: '#1e3a5f' },
] as const

export function AlmacenHome() {
  const navigate = useNavigate()
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

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#1e3a5f]">Calendario Almacén</h1>
            <p className="text-sm text-gray-500 mt-1">
              Centro de operación del CEDIS — recibe, distribuye y ejecuta tareas
            </p>
          </div>

          {categories.map(cat => {
            const catTools = tools.filter(t => t.category === cat.key)
            if (catTools.length === 0) return null
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
