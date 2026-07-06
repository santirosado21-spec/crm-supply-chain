import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, List, BarChart3, ArrowRight, Mail } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'

const NAVY = '#1e3a5f'

interface Tool {
  to: string
  title: string
  description: string
  icon: typeof Target
}

const tools: Tool[] = [
  {
    to: '/comercial/leads',
    title: 'Pipeline',
    description: 'Sigue los leads por etapa: nuevo, contactado, en seguimiento, reunión, cotización y cierre.',
    icon: Target,
  },
  {
    to: '/comercial/leads/lista',
    title: 'Lista de leads',
    description: 'Todos los leads con filtros por canal, estatus, responsable, prioridad y fecha.',
    icon: List,
  },
  {
    to: '/comercial/dashboard',
    title: 'Dashboard',
    description: 'Leads totales, por canal, calientes, oportunidades abiertas y tasa de conversión.',
    icon: BarChart3,
  },
]

function ReminderEmailCard() {
  const { user } = useAuthContext()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user?.email) return
    supabase
      .from('team_members')
      .select('reminder_email')
      .eq('user_email', user.email)
      .maybeSingle()
      .then(({ data }) => {
        setEmail((data?.reminder_email as string | null) ?? '')
        setLoading(false)
      })
  }, [user?.email])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.rpc('set_my_reminder_email', { p_email: email.trim() })
      if (error) throw error
      toast.success('Correo de recordatorios guardado', '')
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Mail size={16} style={{ color: NAVY }} />
        <h3 className="text-sm font-bold text-gray-900">Mi correo de recordatorios</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        A este correo llegan los recordatorios de tus leads (no tiene que ser tu correo @supplychain.com.mx).
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400"><Spinner size={14} /> Cargando...</div>
      ) : (
        <div className="flex gap-2 max-w-md">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tucorreo@gmail.com"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1e3a5f]"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#1e3a5f] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 shrink-0"
          >
            {saving && <Spinner size={14} />} Guardar
          </button>
        </div>
      )}
    </div>
  )
}

export function ComercialHome() {
  const navigate = useNavigate()

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#1e3a5f]">Comercial</h1>
            <p className="text-sm text-gray-500 mt-1">Seguimiento de leads por canal, pipeline y cierre</p>
          </div>

          <ReminderEmailCard />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tools.map(tool => {
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
                      style={{ background: NAVY + '10' }}
                    >
                      <Icon size={20} style={{ color: NAVY }} />
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
        </main>
      </div>
    </div>
  )
}
