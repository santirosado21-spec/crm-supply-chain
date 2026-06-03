import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTaskAvailability, type Slot } from '../../hooks/useTaskAvailability'
import { Spinner } from '../ui/Spinner'
import { DAY_OF_WEEK_LABEL } from '../../types/tasks'

interface Props {
  userEmail:        string
  durationMinutes:  number                              // requerido para que el slot soporte la tarea
  selectedStart:    Date | null
  onSelect:         (start: Date, end: Date) => void
  /** Fecha mínima asignable (midnight local). Días/slots anteriores quedan
   *  deshabilitados. Si se omite, no hay restricción. */
  minDate?:         Date
}

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const day = r.getDay()
  r.setDate(r.getDate() - day)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function sameMin(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime()
}

function sameDate(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

const SLOT_SIZE_MIN = 30

export function AvailabilityPicker({ userEmail, durationMinutes, selectedStart, onSelect, minDate }: Props) {
  const { loading, getSlots } = useTaskAvailability()

  // Piso de fecha: midnight del minDate (o epoch si no hay restricción).
  // Día inicial: max(today, floor) — si minDate es mañana, arrancamos en mañana.
  const floor = useMemo(() => {
    if (!minDate) return new Date(0)
    const f = new Date(minDate); f.setHours(0, 0, 0, 0); return f
  }, [minDate])
  const initialActiveDay = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return today.getTime() >= floor.getTime() ? today : floor
  }, [floor])

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(initialActiveDay))
  const [allSlots, setAllSlots] = useState<Slot[]>([])
  const [activeDay, setActiveDay] = useState<Date>(() => initialActiveDay)

  useEffect(() => {
    if (!userEmail) { setAllSlots([]); return }
    const weekEnd = addDays(weekStart, 6)
    getSlots(userEmail, weekStart, weekEnd).then(setAllSlots)
  }, [userEmail, weekStart, getSlots])

  // ── Compone slots "asignables" basados en duración ───────────────────────
  // Un slot es asignable si encajan N=ceil(duration/30) slots libres consecutivos.
  const slotsNeeded = Math.max(1, Math.ceil(durationMinutes / SLOT_SIZE_MIN))

  const assignableMap = useMemo(() => {
    // Agrupa por día
    const byDay = new Map<string, Slot[]>()
    for (const s of allSlots) {
      const k = s.start.toDateString()
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(s)
    }
    const map = new Map<string, boolean>()  // key = ISO start
    for (const [, daySlots] of byDay) {
      daySlots.sort((a, b) => a.start.getTime() - b.start.getTime())
      for (let i = 0; i + slotsNeeded <= daySlots.length; i++) {
        let ok = true
        for (let j = 0; j < slotsNeeded; j++) {
          const a = daySlots[i + j]
          const b = j > 0 ? daySlots[i + j - 1] : null
          if (a.occupied || (b && b.end.getTime() !== a.start.getTime())) { ok = false; break }
        }
        if (ok) map.set(daySlots[i].start.toISOString(), true)
      }
    }
    return map
  }, [allSlots, slotsNeeded])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const daySlots = useMemo(
    () => allSlots.filter(s => sameDate(s.start, activeDay)),
    [allSlots, activeDay],
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Week navigator */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/40">
        <button
          type="button"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-xs font-semibold text-gray-700">
          {weekStart.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
          {' – '}
          {addDays(weekStart, 6).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
        <button
          type="button"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Semana siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day pills */}
      <div className="grid grid-cols-7 gap-1 p-2 sm:p-3 border-b border-gray-100">
        {days.map(d => {
          const isActive = sameDate(d, activeDay)
          const isToday = sameDate(d, new Date())
          const beforeFloor = d.getTime() < floor.getTime()
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={beforeFloor}
              onClick={() => { if (!beforeFloor) setActiveDay(d) }}
              title={beforeFloor ? 'No disponible — las tareas se agendan para el día siguiente o después' : undefined}
              className={`flex flex-col items-center py-2 rounded-lg text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-white shadow-sm'
                  : beforeFloor
                    ? 'text-gray-300 cursor-not-allowed opacity-50'
                    : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={isActive ? { background: 'var(--brand-navy)' } : undefined}
            >
              <span className="opacity-80">{DAY_OF_WEEK_LABEL[d.getDay()]}</span>
              <span className={`text-base font-bold mt-0.5 ${!isActive && isToday && !beforeFloor ? 'text-[#1e3a5f]' : ''}`}>
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Slots list */}
      <div className="p-3 sm:p-4 max-h-[360px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Spinner size={24} />
          </div>
        )}

        {!loading && daySlots.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8">
            Sin horario laboral configurado para este día
          </p>
        )}

        {!loading && daySlots.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {daySlots.map(slot => {
              const startKey = slot.start.toISOString()
              const beforeFloor = slot.start.getTime() < floor.getTime()
              const isAssignable = !beforeFloor && assignableMap.has(startKey)
              const isSelected = selectedStart != null && sameMin(slot.start, selectedStart)
              const disabled = !isAssignable

              return (
                <button
                  key={startKey}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const end = new Date(slot.start.getTime() + durationMinutes * 60_000)
                    onSelect(slot.start, end)
                  }}
                  title={
                    slot.occupied
                      ? `Ocupado · ${slot.taskRef ?? ''} ${slot.taskTitle ?? ''}`
                      : isAssignable
                        ? 'Disponible'
                        : 'No alcanza la duración'
                  }
                  className={`min-h-[52px] rounded-lg text-sm font-medium transition-all ${
                    isSelected
                      ? 'text-white shadow-sm'
                      : isAssignable
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100'
                        : slot.occupied
                          ? 'bg-rose-50 text-rose-400 border border-rose-100 cursor-not-allowed'
                          : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                  }`}
                  style={isSelected ? { background: 'var(--brand-navy)' } : undefined}
                >
                  {slot.start.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/40 text-[11px] text-gray-500 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-300" />Disponible</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-300" />Ocupado</span>
        <span className="hidden sm:inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-gray-200" />Fuera de horario</span>
      </div>
    </div>
  )
}
