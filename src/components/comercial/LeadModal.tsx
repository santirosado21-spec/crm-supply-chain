import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Spinner } from '../ui/Spinner'
import { useAuthContext } from '../../context/AuthContext'
import { useTeamMembers } from '../../hooks/useTeamMembers'
import type { CreateLeadData, UpdateLeadData } from '../../hooks/useLeads'
import type { Lead } from '../../types/leads'
import {
  MANUAL_LEAD_CHANNELS, CHANNEL_LABEL, SERVICE_INTERESTS,
  PRIORITIES, PRIORITY_LABEL, INTEREST_LEVELS, INTEREST_LABEL, REMINDER_DAY_OPTIONS,
} from '../../types/leads'

interface Props {
  isOpen:   boolean
  editing?: Lead | null
  onClose:  () => void
  onSave:   (data: CreateLeadData) => Promise<void>
  onUpdate: (id: string, patch: UpdateLeadData) => Promise<void>
}

type FormState = {
  nombre:                string
  empresa:               string
  cargo:                 string
  correo:                string
  telefono:              string
  canal:                 CreateLeadData['canal']
  servicio_interes:      CreateLeadData['servicio_interes']
  notas_comerciales:     string
  responsable_comercial: string
  prioridad:             CreateLeadData['prioridad']
  nivel_interes:         CreateLeadData['nivel_interes']
  recordatorio_dias:     number | null
}

const EMPTY_FORM: FormState = {
  nombre: '', empresa: '', cargo: '', correo: '', telefono: '',
  canal: 'organico',
  servicio_interes: 'Almacenaje de Mercancías',
  notas_comerciales: '',
  responsable_comercial: '',
  prioridad: 'media',
  nivel_interes: 'frio',
  recordatorio_dias: null,
}

export function LeadModal({ isOpen, editing, onClose, onSave, onUpdate }: Props) {
  const { user } = useAuthContext()
  const { members } = useTeamMembers()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      setForm({
        nombre: editing.nombre,
        empresa: editing.empresa ?? '',
        cargo: editing.cargo ?? '',
        correo: editing.correo ?? '',
        telefono: editing.telefono ?? '',
        canal: editing.canal,
        servicio_interes: editing.servicio_interes,
        notas_comerciales: editing.notas_comerciales ?? '',
        responsable_comercial: editing.responsable_comercial ?? '',
        prioridad: editing.prioridad,
        nivel_interes: editing.nivel_interes,
        recordatorio_dias: editing.recordatorio_dias,
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setError('')
  }, [isOpen, editing])

  if (!isOpen) return null

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const comerciales = members.filter(m => m.role === 'admin' || m.role === 'comercial')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    setLoading(true)
    try {
      const recordatorioFecha = form.recordatorio_dias
        ? new Date(Date.now() + form.recordatorio_dias * 86400000).toISOString()
        : null

      if (editing) {
        await onUpdate(editing.id, {
          nombre: form.nombre.trim(),
          empresa: form.empresa.trim() || null,
          cargo: form.cargo.trim() || null,
          correo: form.correo.trim() || null,
          telefono: form.telefono.trim() || null,
          canal: form.canal,
          servicio_interes: form.servicio_interes,
          notas_comerciales: form.notas_comerciales.trim() || null,
          responsable_comercial: form.responsable_comercial || null,
          prioridad: form.prioridad,
          nivel_interes: form.nivel_interes,
          recordatorio_dias: form.recordatorio_dias,
          recordatorio_fecha: recordatorioFecha,
          recordatorio_enviado: false,
        })
      } else {
        await onSave({
          nombre: form.nombre.trim(),
          empresa: form.empresa.trim() || null,
          cargo: form.cargo.trim() || null,
          correo: form.correo.trim() || null,
          telefono: form.telefono.trim() || null,
          canal: form.canal,
          fecha_entrada: new Date().toISOString(),
          servicio_interes: form.servicio_interes,
          notas_comerciales: form.notas_comerciales.trim() || null,
          responsable_comercial: form.responsable_comercial || null,
          estatus: 'nuevo',
          nivel_interes: form.nivel_interes,
          prioridad: form.prioridad,
          proxima_accion_tipo: null,
          proxima_accion_fecha: null,
          client_id: null,
          motivo_perdido: null,
          recordatorio_dias: form.recordatorio_dias,
          recordatorio_fecha: recordatorioFecha,
          recordatorio_enviado: false,
          created_by: user?.email ?? '',
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el lead')
    } finally {
      setLoading(false)
    }
  }

  const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f]/20'
  const label = 'block text-xs font-semibold text-gray-600 mb-1'

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1e3a5f]">{editing ? 'Editar lead' : 'Nuevo lead'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className={label}>Nombre <span className="text-red-500">*</span></label>
            <input className={input} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre del contacto" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Empresa</label>
              <input className={input} value={form.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Empresa" />
            </div>
            <div>
              <label className={label}>Cargo</label>
              <input className={input} value={form.cargo} onChange={e => set('cargo', e.target.value)} placeholder="Cargo" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Correo</label>
              <input type="email" className={input} value={form.correo} onChange={e => set('correo', e.target.value)} placeholder="correo@empresa.com" />
            </div>
            <div>
              <label className={label}>Teléfono</label>
              <input className={input} value={form.telefono} onChange={e => set('telefono', e.target.value)} placeholder="+52 ..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Canal</label>
              <select
                className={input}
                value={form.canal}
                disabled={editing?.canal === 'landing_page'}
                onChange={e => set('canal', e.target.value as FormState['canal'])}
              >
                {editing?.canal === 'landing_page' && <option value="landing_page">{CHANNEL_LABEL.landing_page}</option>}
                {MANUAL_LEAD_CHANNELS.map(c => (
                  <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Servicio de interés</label>
              <select className={input} value={form.servicio_interes} onChange={e => set('servicio_interes', e.target.value as FormState['servicio_interes'])}>
                {SERVICE_INTERESTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Responsable comercial</label>
            <select className={input} value={form.responsable_comercial} onChange={e => set('responsable_comercial', e.target.value)}>
              <option value="">Sin asignar</option>
              {comerciales.map(m => (
                <option key={m.email} value={m.email}>{m.name ?? m.email}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Prioridad</label>
              <select className={input} value={form.prioridad} onChange={e => set('prioridad', e.target.value as FormState['prioridad'])}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Nivel de interés</label>
              <select className={input} value={form.nivel_interes} onChange={e => set('nivel_interes', e.target.value as FormState['nivel_interes'])}>
                {INTEREST_LEVELS.map(n => <option key={n} value={n}>{INTEREST_LABEL[n]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Recordatorio</label>
            <select
              className={input}
              value={form.recordatorio_dias === null ? '' : String(form.recordatorio_dias)}
              onChange={e => set('recordatorio_dias', e.target.value === '' ? null : Number(e.target.value))}
            >
              {REMINDER_DAY_OPTIONS.map(opt => (
                <option key={opt.label} value={opt.value === null ? '' : opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Llega por correo a tu "correo de recordatorios" personal (configúralo en Comercial → Inicio).
            </p>
          </div>

          <div>
            <label className={label}>Notas comerciales</label>
            <textarea
              className={input}
              rows={3}
              value={form.notas_comerciales}
              onChange={e => set('notas_comerciales', e.target.value)}
              placeholder="Contexto inicial del lead"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancelar</button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-[#1e3a5f] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading && <Spinner size={14} />}
              {editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
