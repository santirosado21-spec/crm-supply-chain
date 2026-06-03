import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import type { CotizadorResult, Parada, Contenedor } from './cotizadorCalc'
import { BONOS_DEFAULT } from './cotizadorConstants'

/*
  Multi-tab del Cotizador (sessionStorage).
  Permite arrastrar varias cotizaciones en progreso a la vez — SAC revisa
  varias antes de aprobar una. Solo cuenta para dashboards al guardar (createViaje).
*/

// Un viaje puede llevar varios maniobristas a la vez: internos (del catálogo)
// y externos (nombre libre, contratado puntual). Cada uno se modela como una
// fila independiente con su flag `esExterno`.
export interface ManiobristaAsignado {
  id:        string
  nombre:    string
  esExterno: boolean
}

export interface CotizadorFormState {
  // Ruta
  origen: string
  destino: string
  viajeRedondo: boolean
  kmIda: number
  casetasIda: number
  casetasRegreso: number
  horasIda: number
  minutosIda: number

  // Multi-stop
  modoMultiparadas: boolean
  paradas: Parada[]
  kmRegreso: number
  casetasRegresoMulti: number
  horasRegreso: number
  minutosRegreso: number

  // Cliente / unidad / operador
  cliente: string
  tipoCliente: string
  unidadClave: string
  operador: string

  // Referencias internas (opcionales) que se concatenan en viajes.notas:
  // - referenciaExtensiv: # de transacción del WMS Extensiv 3PL
  // - referenciaSAC: ticket/folio del correo del área de SAC
  referenciaExtensiv: string
  referenciaSAC: string

  // Contenedores
  contenedores: Contenedor[]
  contCantidad: number
  contTipo: string
  descripcionCarga: string

  // Maniobra — varios maniobristas (mezcla internos/externos) por viaje.
  mHoras: number
  mMinutos: number
  mCosto: number
  maniobristas: ManiobristaAsignado[]

  // Viáticos / dádiva
  viaticosExtras: number
  dadiva: number

  // Bonos
  incluyeBonos: boolean
  bonoSueldo: number
  bonoKmCarga: number
  bonoKmVacio: number
  bonoComida: number

  // Días especiales
  dMatutino: number
  dNocturno: number
  dSabado: number
  dDomingo: number
  dFestivo: number
}

export const INITIAL_FORM_STATE: CotizadorFormState = {
  origen: '', destino: '',
  viajeRedondo: true,
  kmIda: 0, casetasIda: 0, casetasRegreso: 0, horasIda: 0, minutosIda: 0,
  modoMultiparadas: false, paradas: [],
  kmRegreso: 0, casetasRegresoMulti: 0, horasRegreso: 0, minutosRegreso: 0,
  cliente: '', tipoCliente: 'FINAL', unidadClave: '', operador: '',
  referenciaExtensiv: '', referenciaSAC: '',
  contenedores: [], contCantidad: 0, contTipo: '', descripcionCarga: '',
  mHoras: 0, mMinutos: 0, mCosto: 150, maniobristas: [],
  viaticosExtras: 0, dadiva: 0,
  incluyeBonos: false,
  bonoSueldo: BONOS_DEFAULT.SUELDO,
  bonoKmCarga: BONOS_DEFAULT.KM_CARGA,
  bonoKmVacio: BONOS_DEFAULT.KM_VACIO,
  bonoComida: BONOS_DEFAULT.COMIDA,
  dMatutino: 0, dNocturno: 0, dSabado: 0, dDomingo: 0, dFestivo: 0,
}

export interface CotizadorTab {
  id: string
  label: string
  formState: CotizadorFormState
  result: CotizadorResult | null
  savedViajeId: string | null
}

interface CotizadorTabsContextValue {
  tabs: CotizadorTab[]
  activeTabId: string
  activeTab: CotizadorTab
  addTab: (label?: string) => string
  closeTab: (id: string) => void
  renameTab: (id: string, label: string) => void
  selectTab: (id: string) => void
  setFormStateForActive: (state: CotizadorFormState) => void
  setResultForActive: (result: CotizadorResult | null) => void
  markActiveSaved: (viajeId: string) => void
  duplicateActive: () => void
}

const Ctx = createContext<CotizadorTabsContextValue | null>(null)

const STORAGE_KEY = 'sc_cotizador_tabs_v1'

function generateId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function makeNewTab(label: string): CotizadorTab {
  return {
    id: generateId(),
    label,
    formState: { ...INITIAL_FORM_STATE },
    result: null,
    savedViajeId: null,
  }
}

// Migración para tabs guardadas con el modelo viejo (maniobrista + maniobristaSource).
// Las normaliza al nuevo modelo (maniobristas[]).
function normalizeFormState(fs: Record<string, unknown>): CotizadorFormState {
  const fsAny = fs as Record<string, unknown> & {
    maniobrista?: string
    maniobristaSource?: 'interno' | 'externo'
    maniobristas?: ManiobristaAsignado[]
  }
  let base: CotizadorFormState
  if (Array.isArray(fsAny.maniobristas)) {
    base = fsAny as unknown as CotizadorFormState
  } else {
    const legacyName = typeof fsAny.maniobrista === 'string' ? fsAny.maniobrista.trim() : ''
    const legacySource = fsAny.maniobristaSource === 'externo' ? true : false
    const migrated: ManiobristaAsignado[] = legacyName
      ? [{ id: `m-legacy-${Date.now()}`, nombre: legacyName, esExterno: legacySource }]
      : []
    const next = { ...fsAny, maniobristas: migrated } as unknown as CotizadorFormState
    const nextRec = next as unknown as Record<string, unknown>
    delete nextRec.maniobrista
    delete nextRec.maniobristaSource
    base = next
  }
  // Inyectar defaults para campos agregados después: tabs guardadas con un schema
  // viejo no fallan al leerse y caen a string vacío.
  const rec = base as unknown as Record<string, unknown>
  if (typeof rec.referenciaExtensiv !== 'string') rec.referenciaExtensiv = ''
  if (typeof rec.referenciaSAC !== 'string')      rec.referenciaSAC = ''
  return base
}

function loadFromStorage(): { tabs: CotizadorTab[]; activeTabId: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { tabs: CotizadorTab[]; activeTabId: string }
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null
    parsed.tabs = parsed.tabs.map(t => ({
      ...t,
      formState: normalizeFormState(t.formState as unknown as Record<string, unknown>),
    }))
    return parsed
  } catch {
    return null
  }
}

export function CotizadorTabsProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => {
    const fromStorage = loadFromStorage()
    if (fromStorage) return fromStorage
    const first = makeNewTab('Cotización 1')
    return { tabs: [first], activeTabId: first.id }
  }, [])

  const [tabs, setTabs] = useState<CotizadorTab[]>(initial.tabs)
  const [activeTabId, setActiveTabId] = useState<string>(initial.activeTabId)

  // Persistencia con debounce — evita escribir en cada keystroke.
  const writeTimer = useRef<number | null>(null)
  useEffect(() => {
    if (writeTimer.current !== null) window.clearTimeout(writeTimer.current)
    writeTimer.current = window.setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }))
      } catch { /* sessionStorage lleno o disabled — ignorar */ }
    }, 300)
    return () => {
      if (writeTimer.current !== null) window.clearTimeout(writeTimer.current)
    }
  }, [tabs, activeTabId])

  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId],
  )

  const addTab = useCallback((label?: string) => {
    const next = makeNewTab(label ?? `Cotización ${tabs.length + 1}`)
    setTabs(prev => [...prev, next])
    setActiveTabId(next.id)
    return next.id
  }, [tabs.length])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length === 1) {
        // Siempre debe haber al menos 1 tab. Reset la única.
        return [makeNewTab('Cotización 1')]
      }
      const idx = prev.findIndex(t => t.id === id)
      if (idx === -1) return prev
      const next = prev.filter(t => t.id !== id)
      // Si cerramos la activa, seleccionar la previa (o primera).
      if (id === activeTabId) {
        const newActive = next[Math.max(0, idx - 1)] ?? next[0]
        setActiveTabId(newActive.id)
      }
      return next
    })
  }, [activeTabId])

  const renameTab = useCallback((id: string, label: string) => {
    const trimmed = label.trim() || 'Cotización'
    setTabs(prev => prev.map(t => t.id === id ? { ...t, label: trimmed } : t))
  }, [])

  const selectTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const setFormStateForActive = useCallback((state: CotizadorFormState) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, formState: state } : t))
  }, [activeTabId])

  const setResultForActive = useCallback((result: CotizadorResult | null) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, result } : t))
  }, [activeTabId])

  const markActiveSaved = useCallback((viajeId: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, savedViajeId: viajeId } : t))
  }, [activeTabId])

  const duplicateActive = useCallback(() => {
    const src = tabs.find(t => t.id === activeTabId)
    if (!src) return
    const copy: CotizadorTab = {
      id: generateId(),
      label: `${src.label} (copia)`,
      formState: { ...src.formState, paradas: [...src.formState.paradas], contenedores: [...src.formState.contenedores] },
      result: null,        // resultado se recalcula
      savedViajeId: null,  // copia es un nuevo borrador
    }
    setTabs(prev => [...prev, copy])
    setActiveTabId(copy.id)
  }, [tabs, activeTabId])

  const value: CotizadorTabsContextValue = {
    tabs, activeTabId, activeTab,
    addTab, closeTab, renameTab, selectTab,
    setFormStateForActive, setResultForActive, markActiveSaved, duplicateActive,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCotizadorTabs(): CotizadorTabsContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCotizadorTabs must be used within CotizadorTabsProvider')
  return ctx
}
