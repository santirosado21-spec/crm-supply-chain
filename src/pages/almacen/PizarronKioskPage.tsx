import { useEffect, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { PizarronBoard } from '../../components/almacen/PizarronBoard'

/*
  Pizarrón en modo kiosk: pantalla completa, sin Header ni Sidebar.
  Pensado para una pantalla compartida en el CEDIS. Ruta pública en LAN.
*/
export function PizarronKioskPage() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Intento de auto-fullscreen al cargar (algunos navegadores lo rechazan sin
  // gesto del usuario — por eso queda el botón manual de respaldo).
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => { /* ignore */ })
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => { /* ignore */ })
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--page-bg)' }}>
      {!isFullscreen && (
        <button
          onClick={goFullscreen}
          className="fixed top-4 right-4 z-50 h-10 px-4 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 shadow-md hover:bg-[#16304d]"
        >
          <Maximize2 size={16} /> Pantalla completa
        </button>
      )}
      <PizarronBoard kiosk />
    </div>
  )
}
