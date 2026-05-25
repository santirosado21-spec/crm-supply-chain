import { LogOut, Menu } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'
import { NotificationBell } from './NotificationBell'
import { TimerPill } from './TimerPill'
import { LanguageToggle } from './LanguageToggle'
import { useAuthContext } from '../../context/AuthContext'
import { useActiveTimer } from '../../hooks/useActiveTimer'
import { useToast } from '../../hooks/useToast'
import { useSidebar } from '../../context/SidebarContext'

export function Header() {
  const { user, signOut } = useAuthContext()
  const { active } = useActiveTimer(user?.email)
  const { toggle: toggleSidebar } = useSidebar()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Hamburger solo cuando hay sidebar (no en home)
  const showHamburger = pathname !== '/'

  const doSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleLogout = async () => {
    if (active) {
      setConfirmOpen(true)
      return
    }
    await doSignOut()
  }

  return (
    <header className="bg-white shrink-0 relative z-20 border-b border-gray-200/80"
      style={{ boxShadow: '0 1px 0 #e8edf2' }}
    >
      {/* Safe-area spacer: en iPhone standalone (app desde home screen),
          env(safe-area-inset-top) ≈ 47-59px y reserva el espacio del notch /
          Dynamic Island. En Safari normal o desktop es 0px (sin efecto). */}
      <div
        aria-hidden="true"
        className="bg-white"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />

      <div className="h-16 sm:h-24 flex items-center gap-2 sm:gap-4 px-3 sm:px-6">
      {/* Logo HD — leftmost. Click → /, que es el menú principal de módulos.
          Reemplazó al ModuleSwitcher (icono trigger) que vivía aquí antes. */}
      {pathname !== '/' && (
        <div className="flex items-center shrink-0">
          <Link
            to="/"
            className="flex items-center focus-visible:outline-none rounded-lg hover:opacity-90 transition-opacity"
            title="Volver al menú principal"
          >
            <img
              src="/hd-logo.png"
              alt="Supply Chain MX"
              className="h-12 sm:h-20 w-auto object-contain"
            />
          </Link>
        </div>
      )}

      {/* Hamburger del sidebar móvil — solo en móvil + cuando hay sidebar (no homepage).
          Abre la nav contextual del módulo actual; desde ahí también hay un
          link "Menú principal" para volver a la home. */}
      {showHamburger && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"
          aria-label="Abrir navegación del módulo"
          title="Navegación del módulo"
        >
          <Menu size={18} />
        </button>
      )}

      {/* Divider */}
      <div className="h-8 w-px bg-gray-200 shrink-0 hidden sm:block" />

      {/* Search — centrado */}
      <div className="flex-1 flex justify-center">
        <GlobalSearch />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <LanguageToggle />
        <TimerPill />
        <NotificationBell />
        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 font-medium max-w-[260px]">
          {/* Avatar = recorte preciso del PNG /public/hd-logo.png centrado en la
               sección de flechas (parte superior central, omitiendo "SupplyChain
               México"). El PNG es 1484×689; con backgroundSize 530% y position
               center 14% el círculo muestra solo el icono original tal cual. */}
          <div
            className="w-9 h-9 rounded-full bg-white shrink-0 overflow-hidden"
            style={{
              backgroundImage: 'url(/hd-logo.png)',
              backgroundSize: '530% auto',
              backgroundPosition: 'center 14%',
              backgroundRepeat: 'no-repeat',
            }}
            aria-label="Avatar"
          />
          {/* Mostramos el email del usuario en lugar del nombre — identifica
               de forma única a cada cuenta. */}
          <span className="truncate" title={user?.email ?? ''}>
            {user?.email ?? 'usuario@supplychain.mx'}
          </span>
        </div>
        <button
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
        >
          <LogOut size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>

      </div>

      {/* Confirmación si hay timer activo ────────────────────────────────── */}
      {confirmOpen && active && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-scale-in">
            <p className="text-base font-semibold text-gray-900 mb-2">Tienes un timer corriendo</p>
            <p className="text-sm text-gray-600 mb-4">
              La tarea <strong>{active.ref ?? active.title}</strong> aún tiene tiempo activo.
              Si cierras sesión sin finalizarla, el cronómetro seguirá corriendo en el servidor.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setConfirmOpen(false); navigate(`/tasks/${active.taskId}`) }}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'var(--brand-navy)' }}
              >
                Ir a la tarea
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmOpen(false)
                  await doSignOut()
                  toast.info('Sesión cerrada', 'El timer sigue activo en el servidor.')
                }}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100"
              >
                Cerrar sesión de todos modos
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
