import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import {
  Home, Package, Truck, Warehouse, CalendarClock, ChevronRight, Menu,
} from 'lucide-react'
import { useAuthContext } from '../../context/AuthContext'
import { canAccessModule, moduleFromPath, type AppModule } from '../../config/permissions'

interface ModuleEntry {
  id:    AppModule
  to:    string
  label: string
  icon:  React.ComponentType<{ size?: number }>
  color: string
}

// Todos los módulos usan el mismo color (navy) para mantener identidad
// visual unificada con el resto de la plataforma.
const NAVY = '#1e3a5f'

const MODULES: ModuleEntry[] = [
  { id: 'wms',        to: '/wms',                  label: 'Herramientas de WMS', icon: Package,       color: NAVY },
  { id: 'tms',        to: '/tms',                  label: 'Transportes',         icon: Truck,         color: NAVY },
  { id: 'calendario', to: '/calendario/ejecutivo', label: 'Calendario Ejecutivo', icon: CalendarClock, color: NAVY },
  { id: 'almacen',    to: '/almacen',              label: 'Calendario Almacén',  icon: Warehouse,     color: NAVY },
]

// Ancho del panel: 22rem (352px) o el viewport menos 2rem, lo que sea menor.
const MENU_WIDTH = 352

interface Props {
  /** Contenido a mostrar al lado del icono trigger. Acepta string o JSX
   *  (ej. <Home /> para una casita). Si es null, solo se muestra el icono. */
  label?: React.ReactNode | null
}

/**
 * Botón hamburger que abre un dropdown con navegación a todos los módulos
 * accesibles + un link a la página principal. Funciona desde cualquier página.
 */
export function ModuleSwitcher({ label }: Props) {
  const { user } = useAuthContext()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)

  // Posiciona el dropdown justo debajo del trigger con coordenadas de viewport
  // (position: fixed, vía portal). Es necesario porque el sidebar contenedor
  // usa overflow-y-auto: eso hace que el navegador recorte también el overflow
  // horizontal, y un panel absolute más ancho que el sidebar (220px) quedaba
  // cortado. Con fixed + portal el panel escapa de ese clipping.
  const updatePos = useCallback(() => {
    const btn = triggerRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const width = Math.min(window.innerWidth - 32, MENU_WIDTH)
    let left = r.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width
    if (left < 8) left = 8
    setMenuPos({ top: r.bottom + 4, left, width })
  }, [])

  useLayoutEffect(() => {
    if (open) updatePos()
  }, [open, updatePos])

  // Click fuera + tecla Escape para cerrar. Reposiciona en scroll/resize.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onReflow = () => updatePos()
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, updatePos])

  // Cerrar al cambiar de ruta
  useEffect(() => { setOpen(false) }, [pathname])

  const visibleModules = MODULES.filter(m => canAccessModule(user?.role, m.id))
  // Módulo activo real basado en las reglas de permisos/rutas.
  const activeModule = moduleFromPath(pathname)

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Abrir menú principal"
        className={`flex w-full max-w-full items-center gap-2 px-2 sm:px-3 py-2 rounded-xl text-sm sm:text-base font-bold transition-colors focus-visible:outline-none ${
          open ? 'bg-gray-100 text-[#1e3a5f]' : 'text-[#1e3a5f] hover:bg-gray-100'
        }`}
      >
        {/* Si hay label la usamos. Si no, fallback al icono Menu (3 líneas
             hamburger) para que el trigger sea visualmente "abre menú". */}
        {label
          ? <span className="inline-flex min-w-0 items-center">{label}</span>
          : <Menu size={20} aria-hidden="true" />}
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden animate-fade-in"
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        >
          {/* Home */}
          <Link
            to="/"
            className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] border-b border-gray-100 transition-colors ${
              pathname === '/' ? 'bg-blue-50 text-[#1e3a5f]' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="w-7 h-7 rounded-lg bg-[#1e3a5f] text-white flex items-center justify-center shrink-0">
              <Home size={14} />
            </span>
            <span className="min-w-0 flex-1 font-semibold leading-snug break-words">Página principal</span>
            {pathname === '/' && <ChevronRight size={13} className="shrink-0 text-[#1e3a5f]" />}
          </Link>

          {/* Módulos */}
          <div className="py-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 pt-2 pb-1">
              Módulos
            </p>
            {visibleModules.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400">Tu rol no tiene módulos accesibles.</p>
            ) : (
              visibleModules.map(m => {
                const Icon = m.icon
                const active = activeModule === m.id
                return (
                  <Link
                    key={m.id}
                    to={m.to}
                    className={`flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors ${
                      active ? 'bg-blue-50 text-[#1e3a5f]' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ background: m.color }}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1 whitespace-normal break-words font-semibold leading-snug">{m.label}</span>
                    {active && <ChevronRight size={13} className="shrink-0 text-[#1e3a5f]" />}
                  </Link>
                )
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
