import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, FileUp, Search, X, Link2, FileText, Edit3 } from 'lucide-react'
import {
  listExtensivTransactions,
  getExtensivOrderDetail,
  getExtensivReceiverDetail,
  type ExtensivTransactionListItem,
  type ExtensivPickResult,
} from '../../lib/extensiv'
import { extractReceiptItemsFromPT } from '../../lib/ptParser'

type Mode = 'extensiv' | 'pt' | 'manual'

/** Cliente activo del CRM (tabla `clients`) — el único selector de cliente.
 *  Campos opcionales para aceptar directamente el tipo `Client`. */
export interface PickerClient {
  id:                    string
  name:                  string
  codigo?:               string | null
  extensiv_customer_id?: number | null
}

interface Props {
  value:          ExtensivPickResult | null
  onChange:       (result: ExtensivPickResult | null) => void
  clients:        PickerClient[]
  clientId:       string
  onClientChange: (clientId: string) => void
  fromDays?:      number          // Sprint E · default 7 días (última semana)
  className?:     string
}

interface ModeProps {
  value:         ExtensivPickResult | null
  onChange:      (result: ExtensivPickResult | null) => void
  extCustomerId: number | null    // extensiv_customer_id del cliente elegido
  clientName:    string | null    // nombre del cliente elegido
  fromDays?:     number
}

/**
 * Selector de operación de una tarea. Un ÚNICO dropdown de Cliente (clientes
 * activos del CRM) arriba, compartido por los 3 modos:
 *   A) Extensiv: el cliente (por su extensiv_customer_id) lista sus transactions.
 *   B) Subir PT (PDF/Excel) → parser saca items y referencia.
 *   C) Manual: referencia + unidades a mano (operación interna sin Transaction).
 * Output normalizado: ExtensivPickResult.
 */
export function ExtensivOperationPicker({ value, onChange, clients, clientId, onClientChange, fromDays = 7, className }: Props) {
  const [mode, setMode] = useState<Mode>(value?.type === 'manual' ? 'manual' : 'extensiv')

  const selectedClient = clients.find(c => c.id === clientId) ?? null
  const extCustomerId  = selectedClient?.extensiv_customer_id ?? null
  const clientName     = selectedClient?.name ?? null

  return (
    <div className={`bg-white border border-gray-200 rounded-xl ${className ?? ''}`}>
      {/* Cliente — único selector (clientes activos del CRM) */}
      <div className="p-3 border-b border-gray-100">
        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
          Cliente
        </label>
        <select
          value={clientId}
          onChange={e => onClientChange(e.target.value)}
          className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg bg-white focus:border-[#1e3a5f] focus:outline-none"
        >
          <option value="">— selecciona cliente —</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.name}</option>
          ))}
        </select>
      </div>

      {/* Tabs de modo */}
      <div className="flex gap-1 p-2 border-b border-gray-100">
        <ModeTab active={mode === 'extensiv'} onClick={() => setMode('extensiv')} icon={Link2} label="Extensiv" />
        <ModeTab active={mode === 'pt'}       onClick={() => setMode('pt')}       icon={FileText} label="Subir PT" />
        <ModeTab active={mode === 'manual'}   onClick={() => setMode('manual')}   icon={Edit3}    label="Manual" />
      </div>

      {/* Cuerpo según modo */}
      <div className="p-4">
        {mode === 'extensiv' && <ExtensivMode value={value} onChange={onChange} extCustomerId={extCustomerId} clientName={clientName} fromDays={fromDays} />}
        {mode === 'pt'       && <PTMode       value={value} onChange={onChange} extCustomerId={extCustomerId} clientName={clientName} />}
        {mode === 'manual'   && <ManualMode   value={value} onChange={onChange} extCustomerId={extCustomerId} clientName={clientName} />}
      </div>

      {/* Resumen de selección actual */}
      {value && (
        <div className="border-t border-gray-100 px-4 py-3 bg-blue-50/40 flex items-start justify-between gap-3">
          <div className="text-xs">
            <p className="font-bold text-[#1e3a5f] uppercase tracking-wider">
              {value.type === 'manual' ? 'Manual' : value.type === 'order' ? 'Order Extensiv' : 'Receipt Extensiv'}
            </p>
            <p className="text-gray-700 mt-0.5">
              {value.reference ?? '—'} {value.customerName ? `· ${value.customerName}` : ''}
            </p>
            {value.units !== undefined && value.units > 0 && (
              <p className="text-gray-500 mt-0.5">{value.units} unidades · {value.weight ?? 0} lb</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-gray-400 hover:text-rose-500"
            aria-label="Quitar selección"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────
function ModeTab({ active, onClick, icon: Icon, label }: {
  active: boolean
  onClick: () => void
  icon: typeof Link2
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
        active ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
      }`}
      style={active ? { background: 'var(--brand-navy)' } : undefined}
    >
      <Icon size={13} /> {label}
    </button>
  )
}

// ── Modo A: Selector Extensiv ──────────────────────────────────────────────
function ExtensivMode({ value, onChange, extCustomerId, clientName, fromDays = 7 }: ModeProps) {
  const [transactions, setTransactions]  = useState<ExtensivTransactionListItem[]>([])
  const [loadingTxn, setLT]              = useState(false)
  const [search, setSearch]              = useState('')
  const [days, setDays]                  = useState<number>(fromDays)
  const [hydrating, setHydrating]        = useState(false)
  const [error, setError]                = useState<string | null>(null)

  // Cuando cambia el cliente (extCustomerId) o el rango, recarga transactions
  useEffect(() => {
    if (!extCustomerId) { setTransactions([]); return }
    setLT(true); setError(null)
    listExtensivTransactions(extCustomerId, { fromDays: days })
      .then(setTransactions)
      .catch(e => setError(e instanceof Error ? e.message : 'Error cargando transactions'))
      .finally(() => setLT(false))
  }, [extCustomerId, days])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return transactions
    return transactions.filter(t =>
      t.reference.toLowerCase().includes(q) ||
      t.poNum.toLowerCase().includes(q)     ||
      String(t.numericId).includes(q),
    )
  }, [transactions, search])

  async function handleSelectTransaction(t: ExtensivTransactionListItem) {
    setHydrating(true); setError(null)
    try {
      if (t.type === 'order') {
        const detail = await getExtensivOrderDetail(t.numericId)
        onChange({
          type:          'order',
          customerId:    detail.customerId || extCustomerId,
          customerName:  detail.customerName || clientName,
          transactionId: String(detail.orderId),
          reference:     detail.referenceNum || t.reference,
          poNum:         detail.poNum,
          creationDate:  detail.creationDate,
          shipToCity:    detail.shipTo?.city,
          shipToState:   detail.shipTo?.state,
          carrier:       detail.carrier,
          units:         detail.numUnits1,
          weight:        detail.totalWeight,
          items:         detail.items.map(i => ({ sku: i.sku, qty: i.qty, description: i.description })),
          raw:           detail.raw,
        })
      } else {
        const detail = await getExtensivReceiverDetail(t.numericId)
        onChange({
          type:          'receipt',
          customerId:    detail.customerId || extCustomerId,
          customerName:  detail.customerName || clientName,
          transactionId: String(detail.receiverId),
          reference:     detail.referenceNum || t.reference,
          poNum:         detail.poNum,
          creationDate:  detail.creationDate,
          units:         detail.numUnits1,
          weight:        detail.totalWeight,
          items:         detail.items.map(i => ({ sku: i.sku, qty: i.qty, description: i.description })),
          raw:           detail.raw,
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error trayendo detalle')
    } finally {
      setHydrating(false)
    }
  }

  if (!extCustomerId) {
    return (
      <p className="text-center text-xs text-gray-400 py-6">
        Elige un cliente con mapeo a Extensiv para ver sus transactions.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Buscador + selector rango + lista de transactions */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Transaction · últimos {days} días
          </label>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-600 focus:border-[#1e3a5f] focus:outline-none"
            title="Cambiar rango de búsqueda"
          >
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
          </select>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por referencia, PO o ID..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none"
          />
        </div>
      </div>

      {loadingTxn && (
        <div className="flex items-center justify-center py-6 text-gray-400 gap-2 text-xs">
          <Loader2 className="animate-spin" size={14} /> Cargando transactions...
        </div>
      )}

      {!loadingTxn && filtered.length === 0 && (
        <p className="text-center text-xs text-gray-400 py-6">
          {transactions.length === 0
            ? `Sin transactions en los últimos ${days} días para este cliente`
            : 'Sin coincidencias para tu búsqueda'}
        </p>
      )}

      {!loadingTxn && filtered.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-1.5">
          {filtered.map(t => {
            const isSelected = value?.transactionId === String(t.numericId) && value?.type === t.type
            return (
              <button
                key={t.id}
                type="button"
                disabled={hydrating}
                onClick={() => handleSelectTransaction(t)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-blue-50 ring-1 ring-[#1e3a5f]'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    t.type === 'order' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {t.type === 'order' ? '↗ ORDER' : '↘ RECEIPT'} · {t.numericId}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {t.creationDate?.slice(0, 10)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{t.reference}</p>
                <p className="text-[11px] text-gray-500">
                  {t.poNum && `PO: ${t.poNum} · `}
                  {t.units} u · {t.weight} lb
                  {t.shipTo && ` · ${t.shipTo}`}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {hydrating && (
        <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
          <Loader2 className="animate-spin" size={12} /> Trayendo detalle de Extensiv...
        </p>
      )}

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}

// ── Modo B: Subir PT ───────────────────────────────────────────────────────
function PTMode({ onChange, extCustomerId, clientName }: ModeProps) {
  const [parsing, setParsing] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  async function handleFile(file: File) {
    setParsing(true); setError(null)
    try {
      const extraction = await extractReceiptItemsFromPT(file)
      onChange({
        type:          'receipt',
        customerId:    extCustomerId,
        customerName:  clientName,
        transactionId: null,
        reference:     extraction.ref ?? file.name.replace(/\.[^.]+$/, ''),
        poNum:         null,
        creationDate:  new Date().toISOString().slice(0, 10),
        units:         extraction.items.reduce((s, i) => s + (i.qty ?? 0), 0),
        items:         extraction.items.map(i => ({
          sku:         i.sku,
          qty:         i.qty,
          description: i.serialNumber ?? '',  // PT parser usa serialNumber como detalle por línea
        })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo PT')
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Sube el Pick Ticket en PDF o Excel exportado desde Extensiv. Se extraerán automáticamente
        la referencia, los SKUs y las cantidades.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.xlsx,.xls,.csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={parsing}
        className="w-full inline-flex items-center justify-center gap-2 min-h-[80px] rounded-xl border-2 border-dashed border-gray-300 hover:border-[#1e3a5f] hover:bg-blue-50/50 text-gray-600 hover:text-[#1e3a5f] text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {parsing
          ? <><Loader2 className="animate-spin" size={20} /> Procesando archivo...</>
          : <><FileUp size={22} /> Click para subir PT (PDF / Excel)</>
        }
      </button>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}

// ── Modo C: Manual ─────────────────────────────────────────────────────────
function ManualMode({ value, onChange, extCustomerId, clientName }: ModeProps) {
  const [reference, setReference] = useState(value?.reference ?? '')
  const [units, setUnits]         = useState<number>(value?.units ?? 0)

  function commit() {
    onChange({
      type:          'manual',
      customerId:    extCustomerId,
      customerName:  clientName,
      transactionId: null,
      reference:     reference.trim() || null,
      poNum:         null,
      creationDate:  new Date().toISOString().slice(0, 10),
      units:         units || undefined,
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Operación interna sin Transaction de Extensiv. Llena la referencia a mano
        (el cliente se toma del selector de arriba).
      </p>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
          Referencia / asunto
        </label>
        <input
          type="text"
          value={reference}
          onChange={e => setReference(e.target.value)}
          onBlur={commit}
          placeholder="Ej. Inventario Q2 · mantenimiento racks"
          className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
          Unidades estimadas
        </label>
        <input
          type="number"
          min={0}
          value={units}
          onChange={e => setUnits(Number(e.target.value) || 0)}
          onBlur={commit}
          className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-lg focus:border-[#1e3a5f] focus:outline-none"
        />
      </div>
    </div>
  )
}
