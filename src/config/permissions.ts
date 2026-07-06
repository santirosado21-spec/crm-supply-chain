import type { UserRole } from '../types'

export type AppModule = 'wms' | 'tms' | 'almacen' | 'direccion' | 'agenda' | 'comercial'

export const ROLE_LABEL: Record<UserRole, string> = {
  admin:             'Administrador',
  almacen:           'Almacén',
  servicio_cliente:  'SAC',
  cobranza:          'Cobranza',
  transporte:        'Transportes',
  comercial:         'Comercial',
}

export const MODULE_LABEL: Record<AppModule, string> = {
  wms:        'Herramientas de WMS / SAC',
  tms:        'Transportes',
  almacen:    'Almacén',
  direccion:  'Dirección',
  agenda:     'Calendario General',
  comercial:  'Comercial',
}

// Matriz de acceso por módulo. Existe UN solo módulo de calendario: 'agenda'
// (Calendario General), accesible a todos los roles. El inbox vive como pestaña
// dentro de él y almacén ve además la vista "Operativo" (el General acotado a
// almacén). 'direccion' agrupa las herramientas administrativas (equipo,
// reportes, reporte ejecutivo, auditoría) — exclusivo de admin.
export const MODULE_ACCESS: Record<UserRole, AppModule[]> = {
  admin:             ['wms', 'tms', 'almacen', 'direccion', 'agenda', 'comercial'],
  almacen:           ['almacen', 'agenda'],
  servicio_cliente:  ['wms', 'agenda'],
  cobranza:          ['wms', 'agenda'],
  transporte:        ['tms', 'agenda'],
  comercial:         ['comercial', 'agenda'],
}

export const WMS_ROLES: UserRole[]     = ['admin', 'servicio_cliente', 'cobranza']
export const TMS_ROLES: UserRole[]     = ['admin', 'transporte']
export const ALMACEN_ROLES: UserRole[] = ['admin', 'almacen']
export const TASK_ROLES: UserRole[]    = ['admin', 'almacen', 'servicio_cliente', 'cobranza', 'transporte']
// CALENDARIO_ROLES: gate del CRUD de tareas bajo /calendario/* (crear, plantillas,
// detalle). Almacén queda EXCLUIDO de crear tareas cross-team — usa "Nueva
// actividad" (QuickEventModal) desde la vista Operativo del Calendario General.
export const CALENDARIO_ROLES: UserRole[] = ['admin', 'servicio_cliente', 'cobranza', 'transporte']
// DIRECCION_ROLES: módulo Dirección — equipo, reportes, reporte ejecutivo y
// auditoría. Solo admin.
export const DIRECCION_ROLES: UserRole[] = ['admin']
// AGENDA_ROLES: Calendario global — accesible a todos los roles del sistema.
export const AGENDA_ROLES: UserRole[] = ['admin', 'almacen', 'servicio_cliente', 'cobranza', 'transporte', 'comercial']
// COMERCIAL_ROLES: módulo Comercial — seguimiento de leads. Admin + comercial.
export const COMERCIAL_ROLES: UserRole[] = ['admin', 'comercial']

export const MODULE_BRIEFS: Record<AppModule, { title: string; body: string; tips: string[] }> = {
  wms: {
    title: 'Herramientas WMS / SAC',
    body: 'Centraliza herramientas de Servicio al Cliente y facturación operativa: clientes, validación de SKUs, receipts, RC, documentos fiscales y el Calendario para enviar solicitudes a almacén.',
    tips: [
      'Usa Validador SKU antes de generar documentación.',
      'Genera receipts y RC desde datos revisados.',
      'Envía solicitudes operativas a almacén desde el Calendario.',
    ],
  },
  tms: {
    title: 'Transportes / TMS',
    body: 'Controla la operación de transporte: viajes, unidades, operadores, costos, cotizador, trámites, tablero de flota y Calendario cross-team.',
    tips: [
      'Crea viajes desde el TMS y mantén estado/costos actualizados.',
      'Usa el cotizador antes de prometer tarifas al cliente.',
      'Revisa trámites y vencimientos de unidades con frecuencia.',
    ],
  },
  almacen: {
    title: 'Almacén',
    body: 'Centro de operación del CEDIS: recibe solicitudes del Calendario, distribuye por Pizarrón, asigna tiempos con estándares y opera la vista del día.',
    tips: [
      'Revisa "Hoy" al iniciar el turno para ver prioridades.',
      'Usa el Pizarrón Admin para designar y dar tiempos estimados.',
      'Consulta la Distribución para tomar tareas entrantes.',
    ],
  },
  direccion: {
    title: 'Dirección',
    body: 'Vista administrativa: gestión de equipo y horarios, reportes operativos y ejecutivos, y bitácora de auditoría. Acceso exclusivo para administradores.',
    tips: [
      'Revisa el reporte ejecutivo para una vista consolidada de la operación.',
      'Usa Equipo y horarios para administrar capacidades del personal.',
      'Consulta Auditoría para trazabilidad de cambios y eventos críticos.',
    ],
  },
  agenda: {
    title: 'Calendario General',
    body: 'Calendario global con todas las actividades del equipo programadas en el tiempo. Consulta cualquier semana, filtra por día y agrega o cierra entradas desde aquí.',
    tips: [
      'Navega semana por semana para ver la carga de trabajo del equipo.',
      'Selecciona un día para ver el detalle de actividades programadas.',
      'Usa "Nueva entrada" para agregar y "Cerrar" para marcar completadas.',
    ],
  },
  comercial: {
    title: 'Comercial',
    body: 'Seguimiento de leads: registra prospectos de landing page, redes e email frío, clasifícalos por canal y nivel de interés, y da seguimiento en el pipeline hasta cerrar.',
    tips: [
      'Registra leads nuevos desde "Nuevo lead" con su canal de origen.',
      'Usa el Pipeline para mover leads entre etapas conforme avanzas.',
      'Agrega notas de seguimiento y define la próxima acción en cada lead.',
    ],
  },
}

export function canAccessModule(role: UserRole | undefined, module: AppModule) {
  return Boolean(role && MODULE_ACCESS[role]?.includes(module))
}

export function getModulesForRole(role: UserRole | undefined): AppModule[] {
  return role ? MODULE_ACCESS[role] ?? [] : []
}

export function moduleFromPath(path: string): AppModule | null {
  // Dirección: rutas administrativas. DEBE ir antes que '/calendario' porque
  // /calendario/admin/* es un sub-prefijo. /admin/* también vive aquí.
  if (path.startsWith('/calendario/admin') || path.startsWith('/admin')) return 'direccion'
  if (path === '/comercial' || path.startsWith('/comercial/')) return 'comercial'
  if (path === '/almacen' || path.startsWith('/almacen/')) return 'almacen'
  // Todas las rutas /calendario/* y /tasks/* (bandeja, crear, plantillas, detalle)
  // pertenecen al único módulo de calendario: 'agenda' (Calendario General).
  if (path.startsWith('/calendario') || path.startsWith('/tasks')) return 'agenda'
  if (path.startsWith('/tms') || path === '/cotizador' || path === '/tramites') return 'tms'
  if (path === '/agenda' || path.startsWith('/agenda/')) return 'agenda'
  if (
    path.startsWith('/wms') ||
    path.startsWith('/sac') ||
    path === '/rc' ||
    path === '/tarifarios' ||
    path === '/servicios' ||
    path.startsWith('/clients')
  ) return 'wms'
  return null
}

const PATH_ROLE_OVERRIDES: { prefix: string; roles: UserRole[] }[] = [
  // Agenda (global): todos los roles tienen acceso.
  { prefix: '/agenda', roles: AGENDA_ROLES },
  // Dirección (admin-only): equipo, reportes, auditoría, reporte ejecutivo.
  // DEBEN ir antes que '/calendario' porque /calendario/admin es sub-prefijo.
  { prefix: '/calendario/admin', roles: DIRECCION_ROLES },
  { prefix: '/admin',            roles: DIRECCION_ROLES },
  // Comercial: seguimiento de leads. Admin + comercial.
  { prefix: '/comercial', roles: COMERCIAL_ROLES },
  // CRUD de tareas bajo /calendario/*: admin + SAC + cobranza + transporte.
  // Almacén queda EXCLUIDO de crear tareas cross-team (usa QuickEventModal).
  { prefix: '/calendario', roles: CALENDARIO_ROLES },
  // Compat: las rutas viejas /tasks/admin/* y /tasks/* siguen el mismo gate
  // hasta que los redirects las absorban en Navigate (defensa en profundidad).
  { prefix: '/tasks/admin', roles: DIRECCION_ROLES },
  { prefix: '/tasks',       roles: CALENDARIO_ROLES },
]

export function canAccessPath(role: UserRole | undefined, path: string) {
  for (const { prefix, roles } of PATH_ROLE_OVERRIDES) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      return Boolean(role && roles.includes(role))
    }
  }
  const module = moduleFromPath(path)
  return module ? canAccessModule(role, module) : true
}

export function defaultRouteForRole(role: UserRole | undefined) {
  const first = getModulesForRole(role)[0]
  if (first === 'wms')     return '/wms'
  if (first === 'tms')     return '/tms'
  if (first === 'almacen') return '/almacen'
  if (first === 'direccion') return '/admin/executive-report'
  if (first === 'comercial') return '/comercial'
  return '/'
}
