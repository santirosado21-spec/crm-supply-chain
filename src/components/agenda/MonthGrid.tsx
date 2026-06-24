import { useMemo } from 'react'
import { TASK_STATUS_COLOR, DAY_OF_WEEK_LABEL, type Task } from '../../types/tasks'

interface Props {
  tasks:      Task[]
  month:      Date
  activeDay:  Date
  onDayClick: (d: Date) => void
}

function sameDate(a: Date, b: Date) { return a.toDateString() === b.toDateString() }

export function MonthGrid({ tasks, month, activeDay, onDayClick }: Props) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])

  // Celdas del grid: empieza el domingo de la semana del día 1
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const start = new Date(first)
    start.setDate(start.getDate() - start.getDay())   // retroceder hasta el domingo
    // 6 semanas = 42 celdas — siempre caben todos los meses
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [month])

  // Índice de tareas por fecha (toDateString como clave)
  const tasksByDay = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      if (t.status === 'cancelada') continue
      const k = new Date(t.scheduled_start).toDateString()
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    return m
  }, [tasks])

  const currentMonthNum = month.getMonth()

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header días de la semana */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAY_OF_WEEK_LABEL.map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Grid de celdas — 6 filas × 7 columnas */}
      <div className="grid grid-cols-7 divide-x divide-y divide-gray-100">
        {cells.map((d, i) => {
          const isCurrentMonth = d.getMonth() === currentMonthNum
          const isToday        = sameDate(d, today)
          const isActive       = sameDate(d, activeDay)
          const dayTasks       = tasksByDay.get(d.toDateString()) ?? []
          const visible        = dayTasks.slice(0, 3)
          const overflow       = dayTasks.length - visible.length

          return (
            <button
              key={i}
              type="button"
              onClick={() => onDayClick(d)}
              className={`min-h-[80px] sm:min-h-[96px] p-1.5 text-left transition-colors flex flex-col gap-0.5 ${
                isActive
                  ? 'bg-blue-50'
                  : isCurrentMonth
                    ? 'hover:bg-gray-50'
                    : 'bg-gray-50/40 hover:bg-gray-100/60'
              }`}
            >
              {/* Número del día */}
              <span
                className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full mb-0.5 shrink-0 ${
                  isToday
                    ? 'bg-[#1e3a5f] text-white'
                    : isActive
                      ? 'text-[#1e3a5f]'
                      : isCurrentMonth
                        ? 'text-gray-700'
                        : 'text-gray-300'
                }`}
              >
                {d.getDate()}
              </span>

              {/* Pastillas de eventos */}
              {visible.map(t => {
                const color = TASK_STATUS_COLOR[t.status] ?? '#1e3a5f'
                return (
                  <span
                    key={t.id}
                    className="flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium leading-tight truncate w-full rounded px-1 py-0.5"
                    style={{ background: `${color}18`, color }}
                    title={t.title}
                  >
                    <span className="shrink-0 text-[7px]">●</span>
                    <span className="truncate">{t.title}</span>
                  </span>
                )
              })}

              {/* Overflow */}
              {overflow > 0 && (
                <span className="text-[9px] text-gray-400 font-semibold pl-1">
                  +{overflow} más
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
