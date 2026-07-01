import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Check, Loader2 } from 'lucide-react'
import { Header } from '../../../components/layout/Header'
import { Sidebar } from '../../../components/layout/Sidebar'
import { Spinner } from '../../../components/ui/Spinner'
import { useToast } from '../../../hooks/useToast'
import { listAllTags, createTag, updateTag } from '../../../hooks/useTaskTags'
import { TAG_DIMENSIONS, type TagDimension, type TaskTag } from '../../../types/tasks'

export function TagsAdmin() {
  const navigate = useNavigate()
  const toast = useToast()
  const [tags, setTags] = useState<TaskTag[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Borrador de nueva etiqueta por dimensión
  const [draft, setDraft] = useState<Record<TagDimension, { label: string; color: string }>>(() => ({
    movimiento: { label: '', color: '#1e3a5f' },
    area:       { label: '', color: '#1e3a5f' },
    actividad:  { label: '', color: '#1e3a5f' },
    prioridad:  { label: '', color: '#1e3a5f' },
    proveedor:  { label: '', color: '#1e3a5f' },
  }))

  const load = () => {
    setLoading(true)
    listAllTags()
      .then(setTags)
      .catch(e => toast.error('No se pudieron cargar las etiquetas', e instanceof Error ? e.message : ''))
      .finally(() => setLoading(false))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const byDimension = useMemo(() => {
    const out = { movimiento: [], area: [], actividad: [], prioridad: [], proveedor: [] } as Record<TagDimension, TaskTag[]>
    for (const t of tags) out[t.dimension].push(t)
    return out
  }, [tags])

  async function patch(id: string, p: Partial<TaskTag>) {
    setBusyId(id)
    try {
      const updated = await updateTag(id, p)
      setTags(prev => prev.map(t => (t.id === id ? updated : t)))
    } catch (e) {
      toast.error('No se pudo guardar', e instanceof Error ? e.message : '')
    } finally {
      setBusyId(null)
    }
  }

  async function add(dim: TagDimension) {
    const d = draft[dim]
    if (!d.label.trim()) return
    setBusyId(`new-${dim}`)
    try {
      const created = await createTag({ dimension: dim, label: d.label, color: d.color })
      setTags(prev => [...prev, created])
      setDraft(s => ({ ...s, [dim]: { label: '', color: '#1e3a5f' } }))
      toast.success('Etiqueta agregada', created.label)
    } catch (e) {
      toast.error('No se pudo agregar', e instanceof Error ? e.message : '')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-4 sm:p-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#1e3a5f] mb-3"
          >
            <ArrowLeft size={14} /> Volver
          </button>

          <h1 className="text-xl font-bold text-[#1e3a5f] mb-1">Etiquetas de clasificación</h1>
          <p className="text-xs text-gray-400 mb-5">
            Listas usadas al crear tareas del Calendario General y en sus filtros.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Spinner size={20} /> Cargando...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {TAG_DIMENSIONS.map(dim => (
                <div key={dim.code} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h2 className="text-sm font-bold text-gray-800 mb-3">
                    {dim.label}
                    {!dim.required && <span className="ml-2 text-[10px] font-normal text-gray-400">(opcional)</span>}
                  </h2>

                  <div className="space-y-2 mb-3">
                    {byDimension[dim.code].length === 0 && (
                      <p className="text-xs text-gray-400 py-2">Sin etiquetas todavía.</p>
                    )}
                    {byDimension[dim.code].map(tag => (
                      <div key={tag.id} className={`flex items-center gap-2 ${tag.active === false ? 'opacity-50' : ''}`}>
                        <input
                          type="color"
                          value={tag.color}
                          onChange={e => patch(tag.id, { color: e.target.value })}
                          className="h-8 w-8 rounded border border-gray-200 cursor-pointer shrink-0"
                          title="Color"
                        />
                        <input
                          type="text"
                          defaultValue={tag.label}
                          onBlur={e => {
                            const v = e.target.value.trim()
                            if (v && v !== tag.label) patch(tag.id, { label: v })
                          }}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={busyId === tag.id}
                          onClick={() => patch(tag.id, { active: !(tag.active !== false) })}
                          className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 ${
                            tag.active !== false
                              ? 'border-green-200 text-green-700 hover:bg-green-50'
                              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {busyId === tag.id ? '…' : tag.active !== false ? 'Activa' : 'Inactiva'}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Nueva etiqueta */}
                  <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                    <input
                      type="color"
                      value={draft[dim.code].color}
                      onChange={e => setDraft(s => ({ ...s, [dim.code]: { ...s[dim.code], color: e.target.value } }))}
                      className="h-8 w-8 rounded border border-gray-200 cursor-pointer shrink-0"
                      title="Color"
                    />
                    <input
                      type="text"
                      value={draft[dim.code].label}
                      onChange={e => setDraft(s => ({ ...s, [dim.code]: { ...s[dim.code], label: e.target.value } }))}
                      onKeyDown={e => { if (e.key === 'Enter') add(dim.code) }}
                      placeholder="Nueva etiqueta…"
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={!draft[dim.code].label.trim() || busyId === `new-${dim.code}`}
                      onClick={() => add(dim.code)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white disabled:opacity-40 shrink-0"
                    >
                      {busyId === `new-${dim.code}` ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      Agregar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-[11px] text-gray-400 flex items-center gap-1">
            <Check size={12} /> Los cambios se guardan automáticamente (el color al elegirlo, el nombre al salir del campo).
          </p>
        </main>
      </div>
    </div>
  )
}
