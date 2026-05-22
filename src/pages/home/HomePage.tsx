import type { ComponentType, CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Truck, Warehouse, ArrowRight, ClipboardList } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { useAuthContext } from '../../context/AuthContext'
import { canAccessModule, type AppModule } from '../../config/permissions'

type ModuleIcon = ComponentType<{ size?: number; style?: CSSProperties }>

interface ModuleCard {
  id: AppModule
  title: string
  subtitle: string
  description: string
  icon: ModuleIcon
  color: string
  accentColor: string
  onClick: () => void
  tools: string[]
}

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuthContext()

  const modules: ModuleCard[] = [
    {
      id: 'wms',
      title: 'Herramientas de WMS',
      subtitle: 'Warehouse Management',
      description: 'Herramientas de SAC para la operación del almacén: validación de SKUs, generación de receipts, RC y clientes.',
      icon: Package,
      color: '#1e3a5f',
      accentColor: '#eff6ff',
      onClick: () => navigate('/wms'),
      tools: ['Validador de SKUs', 'Generador Receipt', 'Generador de RC', 'Clientes'],
    },
    {
      id: 'tms',
      title: 'Transportes',
      subtitle: 'Transport Management System',
      description: 'Cotizador de fletes, dashboards de flotas, servicios de unidades y operaciones de transporte.',
      icon: Truck,
      color: '#1e3a5f',
      accentColor: '#eff6ff',
      onClick: () => navigate('/tms'),
      tools: ['Cotizador de fletes', 'Dashboard flotas', 'Servicios unidades', 'Bitácora operaciones'],
    },
    {
      id: 'almacen',
      title: 'Almacén',
      subtitle: 'CEDIS Lerma · Bodega 1',
      description: 'Visualización en tiempo real del layout del CEDIS: ocupación, elevaciones y estado de posiciones.',
      icon: Warehouse,
      color: '#1e3a5f',
      accentColor: '#eff6ff',
      onClick: () => navigate('/almacen'),
      tools: ['Planta', 'Elevaciones', 'Ocupación', 'Tabla de posiciones'],
    },
    {
      id: 'tasks',
      title: 'Task Tracker',
      subtitle: 'Coordinación · Tiempo · Costos',
      description: 'Asigna tareas entre SAC, Almacén y Transportes con disponibilidad tipo Calendly. Mide tiempo real para asignar costos por cliente.',
      icon: ClipboardList,
      color: '#1e3a5f',
      accentColor: '#eff6ff',
      onClick: () => navigate('/tasks'),
      tools: ['Bandeja de tareas', 'Calendario semanal', 'Plantillas recurrentes', 'Equipo y horarios'],
    },
  ]

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg, #f5f7fa)' }}>
      <Header />
      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y">
        <div className="max-w-7xl mx-auto px-6 py-10">
          {/* Welcome — logo HD en white card, grande y visible.
               Padding reducido para que el logo ocupe más espacio (zoom in). */}
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="bg-white rounded-2xl shadow-md px-6 py-3 sm:px-10 sm:py-4 inline-flex items-center justify-center">
              <img
                src="/hd-logo.png"
                alt="Supply Chain MX"
                className="h-28 sm:h-40 w-auto object-contain select-none"
              />
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Selecciona el módulo al que deseas acceder
            </p>
          </div>

          {/* Module cards — todas las tiles del mismo tamaño exacto vía auto-rows-fr + h-full + flex column */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-3 auto-rows-fr">
            {modules.filter(m => canAccessModule(user?.role, m.id)).map(m => {
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  onClick={m.onClick}
                  className="group login-frame text-left rounded-2xl shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 h-full flex flex-col p-1"
                >
                  {/* Marco animado tipo login (gradient navy↔red en flujo). El
                       interior blanco mantiene la legibilidad de cada tile. */}
                  <div className="bg-white rounded-[calc(1rem-4px)] flex flex-col flex-1 overflow-hidden">
                  {/* Header strip — gradient navy ↔ red en TODOS los módulos
                       (mismos colores que el borde animado para combinar). */}
                  <div
                    className="h-1.5 w-full shrink-0"
                    style={{ background: 'linear-gradient(90deg, #1e3a5f 0%, #1e3a5f 35%, #c8373c 65%, #c8373c 100%)' }}
                  />

                  <div className="p-5 flex flex-col flex-1">
                    {/* Icon — color unificado navy con accent red claro */}
                    <div className="flex items-start mb-3 shrink-0">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #fef2f2 100%)' }}
                      >
                        <Icon size={28} style={{ color: '#1e3a5f' }} />
                      </div>
                    </div>

                    {/* Title — min-h fija para que 1-línea y 2-líneas ocupen el mismo espacio */}
                    <h2 className="text-base font-bold text-gray-900 mb-1 leading-tight min-h-[2.6rem] line-clamp-2">
                      {m.title}
                    </h2>
                    {/* Subtitle — wrap a 2 líneas con leading apretado en lugar de truncate
                         para que "Transport Management System", "Rate shopping · Auto-pick · Etiquetas"
                         y "Coordinación · Tiempo · Costos" no se corten en cards angostas (xl:grid-cols-5).
                         min-h-[2rem] reserva espacio para 2 líneas en todas las cards (consistencia) */}
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-3 min-h-[2rem] leading-[1rem] line-clamp-2 text-[#1e3a5f]">
                      {m.subtitle}
                    </p>

                    {/* Description — min-h fija (4 líneas) para que todas las descripciones ocupen el mismo bloque */}
                    <p className="text-[13px] text-gray-500 leading-relaxed mb-4 flex-1 min-h-[4.5rem]">
                      {m.description}
                    </p>

                    {/* Tools list — alturas fijas (header + 4 items × 18px = ~90px) idénticas en todas las tiles */}
                    <div className="border-t border-gray-100 pt-3 mb-4 shrink-0 min-h-[6.5rem]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 h-3 leading-3">
                        Incluye
                      </p>
                      <ul className="space-y-1">
                        {m.tools.map(tool => (
                          <li key={tool} className="flex items-center gap-2 text-[11px] text-gray-600 h-4 leading-4">
                            <span className="w-1 h-1 rounded-full shrink-0 bg-[#c8373c]" />
                            <span className="truncate">{tool}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* CTA — color navy unificado en TODOS los módulos */}
                    <div className="flex items-center justify-between text-sm font-semibold shrink-0 text-[#1e3a5f]">
                      <span>Entrar al módulo</span>
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-10 text-center">
            <p className="text-[11px] text-gray-400">
              Supply Chain MX · v2.0
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
