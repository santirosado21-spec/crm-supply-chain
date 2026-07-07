import { useNavigate } from 'react-router-dom'
import { Bell, ArrowRight } from 'lucide-react'
import { useAuthContext } from '../../context/AuthContext'
import { useNotifications } from '../../hooks/useNotifications'

/**
 * Modal bloqueante que aparece al llegar una notificación nueva (realtime),
 * sin importar si el usuario tiene abierta la campanita. Se muestran de una
 * en una; al cerrar la primera aparece la siguiente si hay más en cola.
 */
export function NotificationPopup() {
  const { user } = useAuthContext()
  const navigate = useNavigate()
  const { incoming, dismissIncoming } = useNotifications(user?.email)

  const current = incoming[0]
  if (!current) return null

  const handleView = () => {
    dismissIncoming(current.id)
    if (current.link) navigate(current.link)
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-scale-in">
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--brand-navy)' }}
          >
            <Bell size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900">{current.title}</p>
            {current.body && <p className="text-sm text-gray-600 mt-1">{current.body}</p>}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          {current.link && (
            <button
              type="button"
              onClick={handleView}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white inline-flex items-center justify-center gap-1.5"
              style={{ background: 'var(--brand-navy)' }}
            >
              Ver <ArrowRight size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => dismissIncoming(current.id)}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
          >
            Entendido
          </button>
        </div>
        {incoming.length > 1 && (
          <p className="text-[10px] text-gray-400 mt-3 text-right">
            +{incoming.length - 1} más en cola
          </p>
        )}
      </div>
    </div>
  )
}
