import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, Pencil } from 'lucide-react'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { useAuthContext } from '../../context/AuthContext'
import { useToast } from '../../hooks/useToast'
import { useLeads } from '../../hooks/useLeads'
import { LeadModal } from '../../components/comercial/LeadModal'
import { LeadNotesTimeline } from '../../components/comercial/LeadNotesTimeline'
import { LeadStageBadge, LeadInterestBadge, LeadPriorityBadge } from '../../components/comercial/LeadBadges'
import { CHANNEL_LABEL, NEXT_ACTION_LABEL } from '../../types/leads'
import type { Lead, NextActionType } from '../../types/leads'

export function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthContext()
  const toast = useToast()
  const { getLead, updateLead, deleteLead } = useLeads()

  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [accionTipo, setAccionTipo] = useState<NextActionType | ''>('')
  const [accionFecha, setAccionFecha] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const l = await getLead(id)
      setLead(l)
      setAccionTipo(l.proxima_accion_tipo ?? '')
      setAccionFecha(l.proxima_accion_fecha ? l.proxima_accion_fecha.slice(0, 16) : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el lead')
    } finally {
      setLoading(false)
    }
  }, [id, getLead])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    if (!id) return
    try {
      await deleteLead(id)
      navigate('/comercial/leads/lista')
    } catch (e) {
      toast.error('No se pudo eliminar', e instanceof Error ? e.message : String(e))
    }
  }

  const saveNextAction = async () => {
    if (!id) return
    try {
      await updateLead(id, {
        proxima_accion_tipo: accionTipo || null,
        proxima_accion_fecha: accionFecha ? new Date(accionFecha).toISOString() : null,
      })
      toast.success('Próxima acción guardada', '')
      load()
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e))
    }
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">

          <button
            onClick={() => navigate('/comercial/leads/lista')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1e3a5f] mb-5 transition-colors"
          >
            <ArrowLeft size={15} /> Volver a Leads
          </button>

          {loading && (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
              <Spinner size={20} /> Cargando lead...
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {!loading && lead && (
            <>
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div>
                  <h1 className="text-xl font-bold text-[#1e3a5f]">{lead.nombre}</h1>
                  <p className="text-xs text-gray-400 mt-0.5">{lead.ref} · {lead.empresa ?? 'Sin empresa'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditOpen(true)}
                    className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    <Pencil size={14} /> Editar
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => setConfirmOpen(true)}
                      className="flex items-center gap-2 border border-red-300 text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-5">
                <LeadStageBadge estatus={lead.estatus} size="md" />
                <LeadInterestBadge nivel={lead.nivel_interes} size="md" />
                <LeadPriorityBadge prioridad={lead.prioridad} size="md" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Información general">
                  <dl className="flex flex-col gap-3 text-sm">
                    {[
                      ['Cargo',    lead.cargo ?? '—'],
                      ['Correo',   lead.correo ?? '—'],
                      ['Teléfono', lead.telefono ?? '—'],
                      ['Canal',    CHANNEL_LABEL[lead.canal]],
                      ['Servicio de interés', lead.servicio_interes],
                      ['Responsable comercial', lead.responsable_comercial ?? 'Sin asignar'],
                      ['Fecha de entrada', new Date(lead.fecha_entrada).toLocaleDateString('es-MX')],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between gap-3 border-b border-gray-50 pb-2 last:border-0">
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="font-medium text-gray-800 text-right">{val}</dd>
                      </div>
                    ))}
                  </dl>
                  {lead.notas_comerciales && (
                    <div className="mt-3 pt-3 border-t border-gray-50">
                      <p className="text-xs text-gray-500 mb-1">Notas comerciales</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.notas_comerciales}</p>
                    </div>
                  )}
                  {lead.motivo_perdido && (
                    <div className="mt-3 pt-3 border-t border-gray-50">
                      <p className="text-xs text-red-500 mb-1">Motivo de pérdida</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.motivo_perdido}</p>
                    </div>
                  )}
                </Card>

                <Card title="Próxima acción">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
                      <select
                        value={accionTipo}
                        onChange={e => setAccionTipo(e.target.value as NextActionType | '')}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1e3a5f]"
                      >
                        <option value="">Sin definir</option>
                        {(['llamada', 'correo', 'whatsapp', 'reunion'] as NextActionType[]).map(t => (
                          <option key={t} value={t}>{NEXT_ACTION_LABEL[t]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha y hora</label>
                      <input
                        type="datetime-local"
                        value={accionFecha}
                        onChange={e => setAccionFecha(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1e3a5f]"
                      />
                    </div>
                  </div>
                  <button
                    onClick={saveNextAction}
                    className="w-full h-9 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold hover:opacity-90"
                  >
                    Guardar próxima acción
                  </button>
                </Card>
              </div>

              <div className="mt-4">
                <Card title="Notas de seguimiento">
                  <LeadNotesTimeline leadId={lead.id} />
                </Card>
              </div>
            </>
          )}

        </main>
      </div>

      {lead && (
        <LeadModal
          isOpen={editOpen}
          editing={lead}
          onClose={() => setEditOpen(false)}
          onSave={async () => {}}
          onUpdate={async (leadId, patch) => { await updateLead(leadId, patch); await load(); setEditOpen(false) }}
        />
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Eliminar lead"
        message={`¿Eliminar a "${lead?.nombre ?? 'este lead'}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  )
}
