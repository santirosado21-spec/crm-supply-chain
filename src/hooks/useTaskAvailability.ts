import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// 30-minute slot
export interface Slot {
  start:    Date
  end:      Date
  occupied: boolean
  // si está ocupado, label de la tarea que lo ocupa
  taskRef?: string | null
  taskTitle?: string | null
}

interface ScheduleRow { day_of_week: number; start_time: string; end_time: string }
interface BusyTask    { id: string; ref: string | null; title: string; scheduled_start: string; scheduled_end: string }

const SLOT_MINUTES = 30
const BUSY_STATUSES = ['aceptada', 'en_curso', 'pausada']

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}

export function useTaskAvailability() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Devuelve los slots libres/ocupados para un usuario en un rango de fechas.
   * El día se computa con la hora local del navegador.
   */
  const getSlots = useCallback(async (
    userEmail: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<Slot[]> => {
    setLoading(true)
    setError(null)
    try {
      const dayStart = startOfDay(fromDate)
      const dayEnd   = startOfDay(toDate)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const [{ data: scheduleData, error: scheduleErr }, { data: busyData, error: busyErr }] = await Promise.all([
        supabase.from('user_work_schedule').select('day_of_week, start_time, end_time').eq('user_email', userEmail),
        supabase.from('tasks')
          .select('id, ref, title, scheduled_start, scheduled_end')
          .eq('assignee_email', userEmail)
          .in('status', BUSY_STATUSES)
          // Tareas que SE TRASLAPAN con el rango — no solo las que empiezan
          // dentro de él. Una tarea iniciada ayer que sigue corriendo hoy
          // también ocupa slots; filtrar por scheduled_start la perdía y
          // permitía agendar tareas encimadas.
          .lt('scheduled_start', dayEnd.toISOString())
          .gte('scheduled_end', dayStart.toISOString()),
      ])

      if (scheduleErr) throw scheduleErr
      if (busyErr)     throw busyErr

      const schedule = (scheduleData ?? []) as ScheduleRow[]
      const busy     = (busyData ?? []) as BusyTask[]

      const slots: Slot[] = []
      const cursor = new Date(dayStart)
      while (cursor < dayEnd) {
        const dow = cursor.getDay()
        const daySchedule = schedule.filter(s => s.day_of_week === dow)
        if (daySchedule.length === 0) {
          cursor.setDate(cursor.getDate() + 1)
          continue
        }

        for (const block of daySchedule) {
          const blockStart = timeToMinutes(block.start_time)
          const blockEnd   = timeToMinutes(block.end_time)
          for (let m = blockStart; m + SLOT_MINUTES <= blockEnd; m += SLOT_MINUTES) {
            const slotStart = new Date(cursor)
            slotStart.setHours(0, 0, 0, 0)
            slotStart.setMinutes(m)
            const slotEnd = new Date(slotStart)
            slotEnd.setMinutes(slotEnd.getMinutes() + SLOT_MINUTES)

            const conflict = busy.find(t => {
              const ts = new Date(t.scheduled_start)
              const te = new Date(t.scheduled_end)
              return slotStart < te && slotEnd > ts
            })

            slots.push({
              start: slotStart,
              end:   slotEnd,
              occupied: !!conflict,
              taskRef:  conflict?.ref ?? null,
              taskTitle: conflict?.title ?? null,
            })
          }
        }

        cursor.setDate(cursor.getDate() + 1)
      }

      return slots
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, error, getSlots }
}
