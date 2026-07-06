import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, Flame, Target, Percent } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { useLeads } from '../../hooks/useLeads'
import { LEAD_CHANNELS, CHANNEL_LABEL } from '../../types/leads'

const NAVY = '#1e3a5f'

export function LeadsDashboardPage() {
  const { leads, loading, error } = useLeads()

  const metrics = useMemo(() => {
    const total = leads.length
    const calientes = leads.filter(l => l.nivel_interes === 'caliente').length
    const oportunidadesAbiertas = leads.filter(
      l => l.nivel_interes === 'oportunidad' && !['cerrado_ganado', 'cerrado_perdido'].includes(l.estatus),
    ).length

    const porCanal = LEAD_CHANNELS.map(canal => {
      const leadsCanal = leads.filter(l => l.canal === canal)
      const ganados = leadsCanal.filter(l => l.estatus === 'cerrado_ganado').length
      const tasa = leadsCanal.length > 0 ? (ganados / leadsCanal.length) * 100 : 0
      return { canal: CHANNEL_LABEL[canal], total: leadsCanal.length, ganados, tasa: Math.round(tasa) }
    })

    return { total, calientes, oportunidadesAbiertas, porCanal }
  }, [leads])

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#1e3a5f]">Dashboard comercial</h1>
            <p className="text-xs text-gray-400 mt-0.5">Métricas de leads y conversión por canal</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
              <Spinner size={20} /> Cargando métricas...
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] text-gray-500">Leads totales</p>
                    <Users size={14} className="text-gray-300" />
                  </div>
                  <p className="text-2xl font-bold" style={{ color: NAVY }}>{metrics.total}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] text-gray-500">Leads calientes</p>
                    <Flame size={14} className="text-red-400" />
                  </div>
                  <p className="text-2xl font-bold text-red-600">{metrics.calientes}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] text-gray-500">Oportunidades abiertas</p>
                    <Target size={14} className="text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">{metrics.oportunidadesAbiertas}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h2 className="text-sm font-bold text-gray-700 mb-3">Leads por canal</h2>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={metrics.porCanal}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="canal" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="total" name="Leads" fill={NAVY} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Percent size={14} className="text-gray-400" />
                    <h2 className="text-sm font-bold text-gray-700">Tasa de conversión por canal</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={metrics.porCanal}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="canal" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => `${Number(v) || 0}%`} />
                      <Bar dataKey="tasa" name="Conversión" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
