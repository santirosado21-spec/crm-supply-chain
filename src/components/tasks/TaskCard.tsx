import { Link } from 'react-router-dom'
import { Calendar, User, Building2, ArrowRight } from 'lucide-react'
import type { Task } from '../../types/tasks'
import { TaskStatusBadge } from './TaskStatusBadge'
import { TaskRouteLabel } from './TaskRouteLabel'
import type { EmailDirectory } from '../../hooks/useTeamMembers'

function formatRange(startISO: string, endISO: string): string {
  const s = new Date(startISO)
  const e = new Date(endISO)
  const sameDay = s.toDateString() === e.toDateString()
  const date = s.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  const t = (d: Date) => d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `${date} · ${t(s)} – ${t(e)}` : `${date} ${t(s)} → ${e.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} ${t(e)}`
}

export function TaskCard({ task, currentEmail, dir }: { task: Task; currentEmail: string; dir?: EmailDirectory }) {
  const isAssignee = task.assignee_email === currentEmail
  const counterpart = isAssignee ? task.assigner_email : task.assignee_email
  const direction = isAssignee ? 'Asignada por' : 'Asignada a'

  const categoryColor = task.category?.color ?? '#1e3a5f'

  return (
    <Link
      to={`/tasks/${task.id}`}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 overflow-hidden"
    >
      <div className="h-1 w-full" style={{ background: categoryColor }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {task.ref ?? '—'} {task.category?.name ? `· ${task.category.name}` : ''}
            </p>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate mt-0.5">
              {task.title}
            </h3>
          </div>
          <TaskStatusBadge status={task.status} />
        </div>

        {task.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{task.description}</p>
        )}

        <div className="flex flex-col gap-1.5 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span className="truncate">{formatRange(task.scheduled_start, task.scheduled_end)}</span>
          </div>
          <div className="flex items-center gap-2">
            <User size={13} className="text-gray-400 shrink-0" />
            {dir
              ? <TaskRouteLabel assigner={task.assigner_email} assignee={task.assignee_email} dir={dir} />
              : <span className="truncate">{direction} <strong className="font-medium text-gray-800">{counterpart}</strong></span>
            }
          </div>
          {task.client?.name && (
            <div className="flex items-center gap-2">
              <Building2 size={13} className="text-gray-400 shrink-0" />
              <span className="truncate">{task.client.name}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e3a5f]">
            Ver detalle <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  )
}
