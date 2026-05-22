import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import type { Viaje } from '../types/tms'
import type { Operation } from '../types'
import type { Task } from '../types/tasks'
import type { TaskAuditEntry } from '../types/tasks'

// ─────────────────────────────────────────────────────────────────────────────
// Reporte ejecutivo — workbook multi-hoja con KPIs, viajes, operaciones,
// tareas, pendientes y auditoría para un rango de fechas.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutiveRange {
  /** YYYY-MM-DD inclusive */
  from: string
  /** YYYY-MM-DD inclusive */
  to:   string
  /** Etiqueta humana ("Esta semana", "Mayo 2026", …) */
  label: string
}

export interface ExecutiveData {
  range:       ExecutiveRange
  viajes:      Viaje[]
  operations:  Operation[]
  tasks:       Task[]
  audit:       TaskAuditEntry[]
}

export interface ExecutiveKPIs {
  numViajes:        number
  ingresoTotal:     number
  costoTotal:       number
  margenTotal:      number
  margenPct:        number
  numOperaciones:   number
  numTareasCreadas: number
  numFinalizadas:   number
  numCanceladas:    number
  numAceptaciones:  number
  numRechazos:      number
  topClientes:      { cliente: string; ingreso: number; viajes: number }[]
  topProveedores:   { proveedor: string; costo: number; viajes: number }[]
}

const mxn = (n: number) => `$${(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Fetch ────────────────────────────────────────────────────────────────────
export async function fetchExecutiveData(range: ExecutiveRange): Promise<ExecutiveData> {
  // ISO bounds for timestamp columns (audit_at / created_at)
  const fromIso = `${range.from}T00:00:00`
  const toIso   = `${range.to}T23:59:59`

  const [viajesRes, opsRes, tasksRes, auditRes] = await Promise.all([
    supabase
      .from('viajes')
      .select('*')
      .gte('fecha_programada', range.from)
      .lte('fecha_programada', range.to)
      .order('fecha_programada', { ascending: false }),
    supabase
      .from('operations')
      .select('*')
      .gte('fecha', range.from)
      .lte('fecha', range.to)
      .order('fecha', { ascending: false }),
    supabase
      .from('tasks')
      .select('*')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false }),
    supabase
      .from('v_task_audit_full')
      .select('*')
      .gte('audit_at', fromIso)
      .lte('audit_at', toIso)
      .order('audit_at', { ascending: false })
      .limit(2000),
  ])

  if (viajesRes.error) throw viajesRes.error
  if (opsRes.error)    throw opsRes.error
  if (tasksRes.error)  throw tasksRes.error
  // Audit is an auxiliary section. If its migration is not applied yet, keep the
  // executive report usable with an empty sheet.
  const audit = auditRes.error ? [] : ((auditRes.data ?? []) as TaskAuditEntry[])

  return {
    range,
    viajes:     (viajesRes.data ?? []) as Viaje[],
    operations: (opsRes.data ?? []) as Operation[],
    tasks:      (tasksRes.data ?? []) as Task[],
    audit,
  }
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
export function computeKPIs(data: ExecutiveData): ExecutiveKPIs {
  const { viajes, operations, tasks, audit } = data

  const ingresoTotal = viajes.reduce((s, v) => s + (Number(v.ingreso_cliente) || 0), 0)
  const costoTotal   = viajes.reduce((s, v) => s + (Number(v.costo_total) || 0), 0)
  const margenTotal  = ingresoTotal - costoTotal
  const margenPct    = ingresoTotal > 0 ? Math.round((margenTotal / ingresoTotal) * 100) : 0

  // Top clientes (vía operaciones — llaveado por cliente_nombre)
  const clienteMap = new Map<string, { ingreso: number; viajes: number }>()
  for (const op of operations) {
    const key = op.cliente_nombre || '— sin cliente —'
    const cur = clienteMap.get(key) ?? { ingreso: 0, viajes: 0 }
    cur.ingreso += Number(op.costo_cliente) || 0
    clienteMap.set(key, cur)
  }
  // Map viajes → operación → cliente para contar viajes/cliente
  const opById = new Map(operations.map(o => [o.id, o]))
  for (const v of viajes) {
    const op = v.operacion_id ? opById.get(v.operacion_id) : null
    const key = op?.cliente_nombre || '— sin cliente —'
    const cur = clienteMap.get(key) ?? { ingreso: 0, viajes: 0 }
    cur.viajes += 1
    if (!op) cur.ingreso += Number(v.ingreso_cliente) || 0
    clienteMap.set(key, cur)
  }
  const topClientes = [...clienteMap.entries()]
    .map(([cliente, v]) => ({ cliente, ...v }))
    .sort((a, b) => b.ingreso - a.ingreso)
    .slice(0, 3)

  // Top proveedores (de viajes)
  const provMap = new Map<string, { costo: number; viajes: number }>()
  for (const v of viajes) {
    const key = v.proveedor_nombre || '(flota interna)'
    const cur = provMap.get(key) ?? { costo: 0, viajes: 0 }
    cur.costo += Number(v.costo_proveedor) || Number(v.costo_total) || 0
    cur.viajes += 1
    provMap.set(key, cur)
  }
  const topProveedores = [...provMap.entries()]
    .map(([proveedor, v]) => ({ proveedor, ...v }))
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 3)

  const numAceptaciones = audit.filter(a => a.action_category === 'accepted').length
  const numRechazos     = audit.filter(a => a.action_category === 'rejected').length

  return {
    numViajes:        viajes.length,
    ingresoTotal,
    costoTotal,
    margenTotal,
    margenPct,
    numOperaciones:   operations.length,
    numTareasCreadas: tasks.length,
    numFinalizadas:   tasks.filter(t => t.status === 'finalizada').length,
    numCanceladas:    tasks.filter(t => t.status === 'cancelada').length,
    numAceptaciones,
    numRechazos,
    topClientes,
    topProveedores,
  }
}

// ── Workbook builder ─────────────────────────────────────────────────────────
export function buildExecutiveWorkbook(data: ExecutiveData): XLSX.WorkBook {
  const k = computeKPIs(data)
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Resumen ejecutivo ──────────────────────────────────────────────
  const resumen: (string | number)[][] = [
    ['Reporte Ejecutivo · Supply Chain MX'],
    [`Período: ${data.range.label}`, `(${data.range.from} → ${data.range.to})`],
    [`Generado: ${new Date().toLocaleString('es-MX')}`],
    [],
    ['KPIs DE TRANSPORTE'],
    ['Viajes',                       k.numViajes],
    ['Ingreso total',                mxn(k.ingresoTotal)],
    ['Costo total',                  mxn(k.costoTotal)],
    ['Margen',                       mxn(k.margenTotal)],
    ['Margen %',                     `${k.margenPct}%`],
    [],
    ['KPIs DE WMS'],
    ['Operaciones',                  k.numOperaciones],
    [],
    ['KPIs DE TASK TRACKER'],
    ['Tareas creadas',               k.numTareasCreadas],
    ['Tareas finalizadas',           k.numFinalizadas],
    ['Tareas canceladas',            k.numCanceladas],
    ['Aceptaciones (audit)',         k.numAceptaciones],
    ['Rechazos (audit)',             k.numRechazos],
    [],
    ['TOP 3 CLIENTES POR INGRESO'],
    ['Cliente', 'Ingreso', 'Viajes'],
    ...k.topClientes.map(c => [c.cliente, mxn(c.ingreso), c.viajes]),
    [],
    ['TOP 3 PROVEEDORES POR COSTO'],
    ['Proveedor', 'Costo', 'Viajes'],
    ...k.topProveedores.map(p => [p.proveedor, mxn(p.costo), p.viajes]),
  ]
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen ejecutivo')

  // ── Hoja 2: Viajes (detalle) ───────────────────────────────────────────────
  const opById = new Map(data.operations.map(o => [o.id, o]))
  const viajesHeader = [
    'Fecha programada', 'Origen', 'Destino', 'Cliente', 'Operador', 'Vehículo / Proveedor',
    'Km est.', 'Km real', 'Ingreso', 'Costo combustible', 'Costo casetas', 'Costo viáticos',
    'Costo proveedor', 'Costo total', 'Margen', 'Estado',
  ]
  const viajesRows = data.viajes.map(v => {
    const op = v.operacion_id ? opById.get(v.operacion_id) : null
    const proveedor = v.proveedor_nombre || (v.vehiculo_placa ? `${v.vehiculo_modelo ?? ''} ${v.vehiculo_placa}`.trim() : '(interno)')
    return [
      v.fecha_programada ?? '',
      v.origen,
      v.destino,
      op?.cliente_nombre ?? '',
      v.operador_nombre ?? '',
      proveedor,
      v.km_estimados,
      v.km_reales,
      v.ingreso_cliente,
      v.costo_combustible,
      v.costo_casetas,
      v.costo_viaticos,
      v.costo_proveedor,
      v.costo_total,
      v.margen,
      v.estado,
    ]
  })
  const wsViajes = XLSX.utils.aoa_to_sheet([viajesHeader, ...viajesRows])
  wsViajes['!cols'] = [
    { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 22 }, { wch: 24 },
    { wch: 9 },  { wch: 9 },  { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsViajes, 'Viajes')

  // ── Hoja 3: Costos & márgenes (rollup por cliente) ─────────────────────────
  const clienteRollup = new Map<string, { viajes: number; ingreso: number; costo: number }>()
  for (const v of data.viajes) {
    const op = v.operacion_id ? opById.get(v.operacion_id) : null
    const key = op?.cliente_nombre || '— sin cliente —'
    const cur = clienteRollup.get(key) ?? { viajes: 0, ingreso: 0, costo: 0 }
    cur.viajes += 1
    cur.ingreso += Number(v.ingreso_cliente) || 0
    cur.costo += Number(v.costo_total) || 0
    clienteRollup.set(key, cur)
  }
  const rollupHeader = ['Cliente', 'Viajes', 'Ingreso', 'Costo', 'Margen', 'Margen %']
  const rollupRows = [...clienteRollup.entries()]
    .map(([cliente, v]) => {
      const margen = v.ingreso - v.costo
      const pct = v.ingreso > 0 ? Math.round((margen / v.ingreso) * 100) : 0
      return [cliente, v.viajes, v.ingreso, v.costo, margen, `${pct}%`]
    })
    .sort((a, b) => Number(b[2]) - Number(a[2]))
  const wsRollup = XLSX.utils.aoa_to_sheet([rollupHeader, ...rollupRows])
  wsRollup['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsRollup, 'Costos & márgenes')

  // ── Hoja 4: Tareas ─────────────────────────────────────────────────────────
  const tasksHeader = [
    'Ref', 'Título', 'Asignador', 'Asignado', 'Status', 'Programada inicio', 'Programada fin', 'Creada',
  ]
  const tasksRows = data.tasks.map(t => [
    t.ref ?? '',
    t.title,
    t.assigner_email,
    t.assignee_email,
    t.status,
    t.scheduled_start,
    t.scheduled_end,
    t.created_at,
  ])
  const wsTasks = XLSX.utils.aoa_to_sheet([tasksHeader, ...tasksRows])
  wsTasks['!cols'] = [
    { wch: 12 }, { wch: 38 }, { wch: 26 }, { wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
  ]
  XLSX.utils.book_append_sheet(wb, wsTasks, 'Tareas')

  // ── Hoja 5: Pendientes alto nivel ──────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const next7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const pendientesViajes = data.viajes.filter(v =>
    (v.estado === 'pendiente' || v.estado === 'asignado') &&
    v.fecha_programada && v.fecha_programada >= today && v.fecha_programada <= next7
  )
  const pendientesTareas = data.tasks.filter(t =>
    t.status !== 'finalizada' && t.status !== 'cancelada' && t.status !== 'rechazada' &&
    t.scheduled_end && t.scheduled_end < new Date().toISOString()
  )
  const pendHeader = ['Tipo', 'Referencia', 'Descripción', 'Responsable / Cliente', 'Fecha', 'Estado']
  const pendRows: (string | number)[][] = []
  for (const v of pendientesViajes) {
    const op = v.operacion_id ? opById.get(v.operacion_id) : null
    pendRows.push([
      'Viaje próximo',
      v.id.slice(0, 8),
      `${v.origen} → ${v.destino}`,
      op?.cliente_nombre ?? v.proveedor_nombre ?? '',
      v.fecha_programada ?? '',
      v.estado,
    ])
  }
  for (const t of pendientesTareas) {
    pendRows.push([
      'Tarea vencida',
      t.ref ?? t.id.slice(0, 8),
      t.title,
      t.assignee_email,
      t.scheduled_end,
      t.status,
    ])
  }
  const wsPend = XLSX.utils.aoa_to_sheet([pendHeader, ...pendRows])
  wsPend['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 38 }, { wch: 26 }, { wch: 18 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsPend, 'Pendientes')

  // ── Hoja 6: Auditoría ──────────────────────────────────────────────────────
  const auditHeader = ['Timestamp', 'Actor', 'Email', 'Acción', 'Categoría', 'Tarea', 'Status actual']
  const auditRows = data.audit.map(a => [
    a.audit_at,
    a.actor_name,
    a.actor_email,
    a.action,
    a.action_category,
    a.task_ref ? `${a.task_ref} — ${a.task_title ?? ''}` : (a.task_title ?? ''),
    a.task_current_status ?? '',
  ])
  const wsAudit = XLSX.utils.aoa_to_sheet([auditHeader, ...auditRows])
  wsAudit['!cols'] = [{ wch: 20 }, { wch: 24 }, { wch: 28 }, { wch: 26 }, { wch: 14 }, { wch: 38 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsAudit, 'Auditoría')

  return wb
}

// ── Public API: descarga archivo ─────────────────────────────────────────────
export async function downloadExecutiveReport(range: ExecutiveRange): Promise<void> {
  const data = await fetchExecutiveData(range)
  const wb = buildExecutiveWorkbook(data)
  const safeLabel = range.label.replace(/[^\w-]+/g, '_')
  const fileName = `Reporte_Ejecutivo_${safeLabel}_${range.from}.xlsx`
  XLSX.writeFile(wb, fileName)
}

// ── Range helpers ────────────────────────────────────────────────────────────
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function rangeThisWeek(today = new Date()): ExecutiveRange {
  const day = today.getDay() // 0 = dom, 1 = lun…
  const diffToMonday = (day === 0 ? -6 : 1 - day)
  const start = new Date(today); start.setDate(today.getDate() + diffToMonday)
  return { from: isoDay(start), to: isoDay(today), label: 'Esta semana' }
}

export function rangeThisMonth(today = new Date()): ExecutiveRange {
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: isoDay(first), to: isoDay(today), label: 'Este mes' }
}

export function rangePrevMonth(today = new Date()): ExecutiveRange {
  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const last  = new Date(today.getFullYear(), today.getMonth(), 0)
  const monthLabel = first.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return { from: isoDay(first), to: isoDay(last), label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1) }
}

export function rangeCustom(from: string, to: string): ExecutiveRange {
  return { from, to, label: 'Personalizado' }
}
