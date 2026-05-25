import { Home, Users, FileCheck, ScanBarcode, Truck, Warehouse, LayoutDashboard, UserCheck, Route, PieChart, Calculator, CalendarClock, FileInput, Inbox, Calendar, Repeat, UserCog, BarChart3, X, History, FileSpreadsheet, Menu } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuthContext } from '../../context/AuthContext'
import { useSidebar } from '../../context/SidebarContext'
import { canAccessPath } from '../../config/permissions'
import { ModuleSwitcher } from './ModuleSwitcher'

interface Link {
  to: string
  label: string
  icon: typeof Home
  /** Sub-grupo opcional dentro del módulo (ej. Insights / Operaciones). */
  section?: string
}

/*
  Contextual sidebar: shows ONLY the current module's links.
  To switch modules, user must return to the main menu (/) and pick another.
*/
const WMS_LINKS: Link[] = [
  { to: '/wms',                   label: 'Herramientas de WMS', icon: Warehouse },
  { to: '/sac/validador',         label: 'Validador SKU',       icon: ScanBarcode },
  { to: '/wms/receipt-generator', label: 'Generador Receipt',   icon: FileInput },
  { to: '/rc',                    label: 'Rendición RC',        icon: FileCheck },
  { to: '/clients',               label: 'Clientes',            icon: Users },
  { to: '/wms/cedis',             label: 'CEDIS Lerma',         icon: Warehouse },
]

const ALMACEN_LINKS: Link[] = [
  { to: '/almacen',                label: 'Inicio',              icon: Home },
  { to: '/almacen/hoy',            label: 'Hoy',                 icon: Calendar },
  { to: '/almacen/distribucion',   label: 'Distribución tareas', icon: UserCheck },
  { to: '/almacen/pizarron',       label: 'Pizarrón',            icon: LayoutDashboard },
  { to: '/almacen/pizarron-admin', label: 'Pizarrón Admin',      icon: BarChart3 },
]

const TMS_LINKS: Link[] = [
  { to: '/tms',            label: 'TMS · Inicio',         icon: Truck },
  { to: '/tms/dashboard',  label: 'Dashboard',            icon: LayoutDashboard },
  { to: '/tms/vehiculos',  label: 'Vehículos',            icon: Truck },
  { to: '/tms/operadores', label: 'Operadores',           icon: UserCheck },
  { to: '/tms/viajes',     label: 'Viajes',               icon: Route },
  { to: '/tms/costos',     label: 'Costos',               icon: PieChart },
  { to: '/cotizador',      label: 'Cotizador',            icon: Calculator },
  { to: '/tramites',       label: 'Trámites',             icon: CalendarClock },
]

const CALENDARIO_LINKS: Link[] = [
  { to: '/calendario',             label: 'Mi bandeja',     icon: Inbox },
  { to: '/calendario/semana',      label: 'Calendario',     icon: Calendar },
  { to: '/calendario/plantillas',  label: 'Plantillas',     icon: Repeat },
]

const CALENDARIO_ADMIN_LINKS: Link[] = [
  { to: '/calendario/admin/equipo',       label: 'Equipo y horarios',   icon: UserCog },
  { to: '/calendario/admin/reportes',     label: 'Reportes operativos', icon: BarChart3 },
  { to: '/admin/executive-report',        label: 'Reporte ejecutivo',   icon: FileSpreadsheet },
  { to: '/calendario/admin/auditoria',    label: 'Auditoría',           icon: History },
]

type ModuleKey = 'home' | 'wms' | 'tms' | 'almacen' | 'calendario'

function detectModule(pathname: string): ModuleKey {
  if (pathname === '/')                                                              return 'home'
  if (pathname === '/almacen' || pathname.startsWith('/almacen/'))                   return 'almacen'
  if (pathname.startsWith('/calendario') ||
      pathname.startsWith('/tasks') ||
      pathname.startsWith('/admin'))                                                 return 'calendario'
  if (pathname.startsWith('/tms') || pathname === '/cotizador' || pathname === '/tramites')
    return 'tms'
  // Default: WMS (/, /wms, /sac/*, /rc, /clients, etc.)
  return 'wms'
}

const MODULE_CONFIG: Record<Exclude<ModuleKey, 'home'>, { label: string; links: Link[] }> = {
  wms:        { label: 'Herramientas de WMS', links: WMS_LINKS },
  tms:        { label: 'Transportes',         links: TMS_LINKS },
  almacen:    { label: 'Calendario Almacén',  links: ALMACEN_LINKS },
  calendario: { label: 'Calendario',          links: CALENDARIO_LINKS },
}

export function Sidebar() {
  const { pathname } = useLocation()
  const { user } = useAuthContext()
  const { open, close } = useSidebar()
  const currentModule = detectModule(pathname)

  // Auto-cerrar el drawer en móvil al cambiar de ruta
  useEffect(() => { close() }, [pathname, close])

  // On home page, no sidebar
  if (currentModule === 'home') return null

  const { label, links } = MODULE_CONFIG[currentModule]
  const visibleLinks = links.filter(link => canAccessPath(user?.role, link.to))
  const isAdmin = user?.role === 'admin'
  // En el módulo calendario, la sección admin solo aplica a admin (los links
  // que tenía cobranza vivían en ExtensivBilling, ya eliminado).
  const showAdminCalendario = currentModule === 'calendario' && isAdmin
  const visibleAdminLinks = CALENDARIO_ADMIN_LINKS

  // Agrupa los links por sub-grupo (section). Si el módulo no usa sections,
  // todo cae bajo un único grupo con el nombre del módulo.
  const linkSections: { title: string; items: Link[] }[] = (() => {
    if (!visibleLinks.some(l => l.section)) return [{ title: label, items: visibleLinks }]
    const order: string[] = []
    const map = new Map<string, Link[]>()
    for (const l of visibleLinks) {
      const sec = l.section ?? label
      if (!map.has(sec)) { map.set(sec, []); order.push(sec) }
      map.get(sec)!.push(l)
    }
    return order.map(title => ({ title, items: map.get(title)! }))
  })()

  const renderLink = ({ to, label: linkLabel, icon: Icon }: Link) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/wms' || to === '/tms' || to === '/almacen'}
      aria-label={linkLabel}
      className={({ isActive }) =>
        `flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium leading-snug transition-all duration-150 group
        ${isActive
          ? 'text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
      style={({ isActive }) => isActive
        ? { background: 'var(--brand-navy)', boxShadow: '0 2px 8px rgba(30,58,95,0.25)' }
        : undefined
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            aria-hidden="true"
            className={`shrink-0 transition-all ${isActive
              ? 'text-white'
              : 'text-gray-400 group-hover:text-[#1e3a5f] group-hover:scale-110'
            }`}
          />
          <span className="min-w-0 flex-1 whitespace-normal break-words">{linkLabel}</span>
        </>
      )}
    </NavLink>
  )

  return (
    <>
      {/* Backdrop solo en móvil cuando está abierto */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/40 animate-fade-in"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          ${open ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden lg:flex lg:static'}
          relative w-[220px] shrink-0 flex-col
        `}
        style={{ background: 'var(--sidebar-bg)' }}
        role="navigation"
        aria-label="Navegación principal"
      >
        {/* Borde derecho animado (mismo gradient azul↔rojo del login-frame que
             usa la home en sus tiles). Reemplaza el border-r estático para que
             el sidebar comparta identidad visual con los módulos. */}
        <span
          aria-hidden="true"
          className="login-frame absolute top-0 right-0 h-full w-[3px] pointer-events-none"
        />

        {/* Botón cerrar — solo móvil */}
        <button
          type="button"
          onClick={close}
          className="lg:hidden absolute top-3 right-3 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>
      <nav className="flex-1 flex flex-col gap-4 p-3 pt-5 overflow-y-auto">
        {/* Trigger hamburger (3 rallitas) que abre el dropdown de módulos
             — reemplaza al "Menú principal" simple para que desde aquí se
             pueda saltar a cualquier módulo sin pasar por la home. */}
        <div className="px-1">
          <ModuleSwitcher
            label={
              <span className="inline-flex min-w-0 items-center gap-2.5 text-sm font-medium leading-snug text-gray-700">
                <Menu size={18} className="shrink-0 text-gray-500" />
                <span className="whitespace-normal break-words">Menú principal</span>
              </span>
            }
          />
        </div>

        <div className="border-t border-gray-100 -mx-3" />

        {linkSections.map(({ title, items }) => (
          <div key={title}>
            <p className="text-[9px] font-bold tracking-widest uppercase px-3 mb-1.5" style={{ color: '#94a3b8' }}>
              {title}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map(renderLink)}
            </div>
          </div>
        ))}

        {showAdminCalendario && (
          <div>
            <p className="text-[9px] font-bold tracking-widest uppercase px-3 mb-1.5" style={{ color: '#94a3b8' }}>
              Administración
            </p>
            <div className="flex flex-col gap-0.5">
              {visibleAdminLinks.map(({ to, label: linkLabel, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={({ isActive }) =>
                    `flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium leading-snug transition-all duration-150 group
                    ${isActive
                      ? 'text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                  style={({ isActive }) => isActive
                    ? { background: 'var(--brand-navy)', boxShadow: '0 2px 8px rgba(30,58,95,0.25)' }
                    : undefined
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={16} aria-hidden="true" className={`shrink-0 transition-all ${isActive
                        ? 'text-white' : 'text-gray-400 group-hover:text-[#1e3a5f] group-hover:scale-110'}`} />
                      <span className="min-w-0 flex-1 whitespace-normal break-words">{linkLabel}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {/* Botón "Cerrar sidebar" — solo móvil, visible al final de la lista */}
        <button
          type="button"
          onClick={close}
          className="lg:hidden mt-2 inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold text-white shadow-sm active:scale-[0.98]"
          style={{ background: 'var(--brand-navy)' }}
        >
          <X size={16} /> Cerrar sidebar
        </button>
      </nav>

      <div className="p-4 border-t" style={{ borderColor: 'var(--card-border)' }}>
        <div className="flex items-center gap-2.5 px-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--brand-navy)' }}
            aria-hidden="true"
          >
            <span className="text-white text-[9px] font-bold">SC</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-700 truncate">Supply Chain MX</p>
            <p className="text-[9px] text-gray-400 truncate">v2.0 · {label}</p>
          </div>
        </div>
      </div>
    </aside>
    </>
  )
}
