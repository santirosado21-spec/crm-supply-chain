import { useState } from 'react'
import { Plus, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { Spinner } from '../../components/ui/Spinner'
import { useLeads, type LeadFilters } from '../../hooks/useLeads'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import { LeadModal } from '../../components/comercial/LeadModal'
import { LeadStageBadge, LeadInterestBadge, LeadPriorityBadge } from '../../components/comercial/LeadBadges'
import {
  LEAD_CHANNELS, CHANNEL_LABEL, LEAD_STAGES, STAGE_LABEL, PRIORITIES, PRIORITY_LABEL,
} from '../../types/leads'

export function LeadsListPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<LeadFilters>({})
  const { leads, loading, error, createLead, updateLead } = useLeads(filters)
  const { members } = useTeamMembers()
  const [modalOpen, setModalOpen] = useState(false)

  const comerciales = members.filter(m => m.role === 'admin' || m.role === 'comercial')

  const selectCls = 'h-9 px-2.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-[#1e3a5f]'

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">

          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f]">Lista de leads</h1>
              <p className="text-xs text-gray-400 mt-0.5">Todos los leads registrados</p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 bg-[#1e3a5f] hover:opacity-90 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-opacity"
              style={{ boxShadow: '0 2px 8px rgba(30,58,95,0.3)' }}
            >
              <Plus size={16} /> Nuevo lead
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <select className={selectCls} value={filters.canal ?? ''} onChange={e => setFilters(f => ({ ...f, canal: e.target.value as LeadFilters['canal'] }))}>
              <option value="">Todos los canales</option>
              {LEAD_CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </select>
            <select className={selectCls} value={filters.estatus ?? ''} onChange={e => setFilters(f => ({ ...f, estatus: e.target.value as LeadFilters['estatus'] }))}>
              <option value="">Todos los estatus</option>
              {LEAD_STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <select className={selectCls} value={filters.responsable ?? ''} onChange={e => setFilters(f => ({ ...f, responsable: e.target.value }))}>
              <option value="">Todos los responsables</option>
              {comerciales.map(m => <option key={m.email} value={m.email}>{m.name ?? m.email}</option>)}
            </select>
            <select className={selectCls} value={filters.prioridad ?? ''} onChange={e => setFilters(f => ({ ...f, prioridad: e.target.value as LeadFilters['prioridad'] }))}>
              <option value="">Toda prioridad</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
            <input
              type="date"
              className={selectCls}
              value={filters.fechaDesde ?? ''}
              onChange={e => setFilters(f => ({ ...f, fechaDesde: e.target.value }))}
            />
            <input
              type="date"
              className={selectCls}
              value={filters.fechaHasta ?? ''}
              onChange={e => setFilters(f => ({ ...f, fechaHasta: e.target.value }))}
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
              <Spinner size={20} /> Cargando leads...
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Ref', 'Nombre', 'Empresa', 'Canal', 'Estatus', 'Interés', 'Prioridad', 'Responsable', ''].map((col, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                        No hay leads registrados
                      </td>
                    </tr>
                  ) : leads.map((l, i) => (
                    <tr
                      key={l.id}
                      className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${i % 2 ? 'bg-gray-50/40' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{l.ref ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold text-[#1e3a5f]">{l.nombre}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">{l.empresa ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{CHANNEL_LABEL[l.canal]}</td>
                      <td className="px-4 py-3"><LeadStageBadge estatus={l.estatus} /></td>
                      <td className="px-4 py-3"><LeadInterestBadge nivel={l.nivel_interes} /></td>
                      <td className="px-4 py-3"><LeadPriorityBadge prioridad={l.prioridad} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{l.responsable_comercial ?? 'Sin asignar'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/comercial/leads/${l.id}`)}
                          className="flex items-center gap-1.5 text-xs text-[#1e3a5f] border border-[#1e3a5f] px-3 py-1.5 rounded-lg hover:bg-[#1e3a5f] hover:text-white transition-colors"
                        >
                          <Eye size={13} /> Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </main>
      </div>

      <LeadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={async data => { await createLead(data) }}
        onUpdate={async (id, patch) => { await updateLead(id, patch) }}
      />
    </div>
  )
}
