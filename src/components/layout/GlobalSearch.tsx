import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Search, Users, Package } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useClientCatalog } from '../../hooks/useClientCatalog'
import { useAuthContext } from '../../context/AuthContext'
import { canAccessPath } from '../../config/permissions'

type Result = { type: 'client' | 'tool'; label: string; sub?: string; to: string }

const TOOL_RESULTS: Result[] = [
  { type: 'tool', label: 'Validador de SKUs',         sub: 'WMS · SAC',        to: '/sac/validador' },
  { type: 'tool', label: 'Facilitador de entradas',   sub: 'Almacén',          to: '/almacen/receipt-generator' },
  { type: 'tool', label: 'Generador de RC',           sub: 'WMS · Facturación', to: '/rc' },
  { type: 'tool', label: 'Tarifarios',                sub: 'Catálogos',         to: '/tarifarios' },
  { type: 'tool', label: 'Servicios Adicionales',     sub: 'Catálogos',         to: '/servicios' },
  { type: 'tool', label: 'Clientes',                  sub: 'Directorio',        to: '/clients' },
  { type: 'tool', label: 'TMS Dashboard',             sub: 'Transportes',       to: '/tms/dashboard' },
  { type: 'tool', label: 'Vehículos',                 sub: 'Transportes',       to: '/tms/vehiculos' },
  { type: 'tool', label: 'Operadores',                sub: 'Transportes',       to: '/tms/operadores' },
  { type: 'tool', label: 'Viajes',                    sub: 'Transportes',       to: '/tms/viajes' },
  { type: 'tool', label: 'Costos Transporte',         sub: 'Transportes',       to: '/tms/costos' },
  { type: 'tool', label: 'Cotizador de Fletes',       sub: 'Transportes',       to: '/cotizador' },
  { type: 'tool', label: 'Trámites',                  sub: 'Transportes',       to: '/tramites' },
  { type: 'tool', label: 'Almacén CEDIS Lerma',       sub: 'WMS · Almacén',     to: '/almacen' },
  { type: 'tool', label: 'Distribución almacén',      sub: 'WMS · Almacén',     to: '/almacen/distribucion' },
  { type: 'tool', label: 'Pizarrón operaciones',      sub: 'WMS · Almacén',     to: '/almacen/pizarron' },
  { type: 'tool', label: 'Pizarrón admin',            sub: 'WMS · Almacén',     to: '/almacen/pizarron-admin' },
]

export function GlobalSearch() {
  const navigate = useNavigate()
  const { clientes } = useClientCatalog()
  const { user } = useAuthContext()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Build combined result pool: clients + tools
  const allResults = useMemo<Result[]>(() => {
    const clientResults: Result[] = clientes.map(c => ({
      type: 'client',
      label: c.nombre,
      sub: c.codigo ? `Código: ${c.codigo}` : undefined,
      to: c.id ? `/clients/${c.id}` : '/clients',
    }))
    return [...clientResults, ...TOOL_RESULTS].filter(result => canAccessPath(user?.role, result.to))
  }, [clientes, user?.role])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Limpia el timer de debounce al desmontar — evita un setState sobre un
  // componente desmontado si se cierra dentro de la ventana de 200 ms.
  useEffect(() => () => clearTimeout(timer.current), [])

  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    const tokens = q.toLowerCase().trim().split(/\s+/)
    const found = allResults.filter(r => {
      const hay = (r.label + ' ' + (r.sub ?? '')).toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
    setResults(found.slice(0, 20))
    setOpen(true)
  }, [allResults])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 200)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0].to)
    }
    if (e.key === 'Escape') setOpen(false)
  }

  const handleSelect = (to: string) => {
    setOpen(false)
    setQuery('')
    setResults([])
    navigate(to)
  }

  const clients = results.filter(r => r.type === 'client')
  const tools = results.filter(r => r.type === 'tool')

  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setOpen(true)}
          placeholder="Buscar clientes, herramientas..."
          className="w-full bg-gray-100/50 border border-gray-200 text-gray-800 placeholder-gray-400 text-sm rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:bg-white focus:border-blue-400 transition-colors shadow-sm"
        />
      </div>

      {open && (
        <div className="absolute top-10 left-0 right-0 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              Sin resultados para "{query}"
            </div>
          ) : (
            <>
              {clients.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                    <Users size={10} /> Clientes ({clients.length})
                  </p>
                  {clients.map(r => (
                    <button
                      key={'c-' + r.label}
                      onClick={() => handleSelect(r.to)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors text-left group"
                    >
                      <span className="text-sm font-medium text-gray-800 group-hover:text-[#1e3a5f]">{r.label}</span>
                      {r.sub && <span className="text-[10px] font-mono text-gray-400">{r.sub}</span>}
                    </button>
                  ))}
                </div>
              )}
              {tools.length > 0 && (
                <div className={clients.length > 0 ? 'border-t border-gray-100' : ''}>
                  <p className="px-4 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                    <Package size={10} /> Herramientas ({tools.length})
                  </p>
                  {tools.map(r => (
                    <button
                      key={'t-' + r.label}
                      onClick={() => handleSelect(r.to)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors text-left group"
                    >
                      <span className="text-sm font-medium text-gray-800 group-hover:text-[#1e3a5f]">{r.label}</span>
                      <span className="text-[10px] text-gray-400">{r.sub}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
