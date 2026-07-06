import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertTriangle, Building2 } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { useLeads } from '../../hooks/useLeads'
import { useToast } from '../../hooks/useToast'
import { LeadStatusSelect } from '../../components/comercial/LeadStatusSelect'
import { LeadInterestBadge, LeadPriorityBadge } from '../../components/comercial/LeadBadges'
import { LEAD_STAGES, STAGE_LABEL, CHANNEL_LABEL, type Lead, type LeadStage } from '../../types/leads'

const STAGE_COLOR: Record<LeadStage, string> = {
  nuevo:              '#3b82f6',
  contactado:         '#06b6d4',
  en_seguimiento:     '#8b5cf6',
  reunion_agendada:   '#f59e0b',
  cotizacion_enviada: '#ec4899',
  cerrado_ganado:     '#16a34a',
  cerrado_perdido:    '#ef4444',
}

export function LeadsPipelinePage() {
  const navigate = useNavigate()
  const { leads, loading, error, updateLead } = useLeads()
  const toast = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [losing, setLosing] = useState<Lead | null>(null)
  const [motivo, setMotivo] = useState('')

  const columns = useMemo(() => {
    const byStage = new Map<LeadStage, Lead[]>(LEAD_STAGES.map(s => [s, []]))
    for (const l of leads) byStage.get(l.estatus)?.push(l)
    return byStage
  }, [leads])

  const commitStageChange = async (lead: Lead, nuevo: LeadStage, motivoPerdido?: string) => {
    setBusyId(lead.id)
    try {
      await updateLead(lead.id, { estatus: nuevo, ...(motivoPerdido ? { motivo_perdido: motivoPerdido } : {}) })
      toast.success('Etapa actualizada', `${lead.nombre} → ${STAGE_LABEL[nuevo]}`)
    } catch (e) {
      toast.error('No se pudo mover el lead', e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const handleStageChange = (lead: Lead, nuevo: LeadStage) => {
    if (nuevo === 'cerrado_perdido') {
      setLosing(lead)
      setMotivo('')
      return
    }
    commitStageChange(lead, nuevo)
  }

  const confirmLost = async () => {
    if (!losing) return
    await commitStageChange(losing, 'cerrado_perdido', motivo.trim() || undefined)
    setLosing(null)
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-[#1e3a5f]">Pipeline de leads</h1>
            <p className="text-xs text-gray-400 mt-0.5">{leads.length} leads en seguimiento</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-blue-600">
              <Loader2 size={20} className="animate-spin" /> Cargando pipeline…
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
              {LEAD_STAGES.map(stage => {
                const items = columns.get(stage) ?? []
                const color = STAGE_COLOR[stage]
                return (
                  <div key={stage} className="flex-shrink-0 w-72">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
                        {STAGE_LABEL[stage]}
                      </span>
                      <span className="text-xs font-bold text-gray-400">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map(lead => (
                        <div
                          key={lead.id}
                          className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
                          style={{ borderLeftColor: color, borderLeftWidth: 4 }}
                          onClick={() => navigate(`/comercial/leads/${lead.id}`)}
                        >
                          <p className="text-sm font-bold text-gray-800 leading-snug">{lead.nombre}</p>
                          {lead.empresa && (
                            <p className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                              <Building2 size={11} /> {lead.empresa}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-1">{CHANNEL_LABEL[lead.canal]}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            <LeadInterestBadge nivel={lead.nivel_interes} />
                            <LeadPriorityBadge prioridad={lead.prioridad} />
                          </div>
                          <div className="mt-2" onClick={e => e.stopPropagation()}>
                            <LeadStatusSelect
                              estatus={lead.estatus}
                              onChange={nuevo => handleStageChange(lead, nuevo)}
                            />
                          </div>
                          {busyId === lead.id && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                              <Loader2 size={10} className="animate-spin" /> Guardando…
                            </div>
                          )}
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div className="text-[11px] text-gray-300 text-center py-6 border border-dashed border-gray-200 rounded-xl">
                          Sin leads
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>

      {losing && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLosing(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-1">Marcar como perdido</h2>
            <p className="text-xs text-gray-500 mb-4">{losing.nombre} · {losing.empresa ?? 'Sin empresa'}</p>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Motivo (opcional)</label>
            <textarea
              autoFocus
              rows={3}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="¿Por qué se perdió el lead?"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
            />
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setLosing(null)}
                className="flex-1 h-10 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmLost}
                className="flex-1 h-10 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
