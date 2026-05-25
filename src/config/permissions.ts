import type { UserRole } from '../types'

export type AppModule = 'wms' | 'tms' | 'tasks'

export const ROLE_LABEL: Record<UserRole, string> = {
  admin:             'Administrador',
  almacen:           'Almacén',
  servicio_cliente:  'SAC',
  cobranza:          'Cobranza',
  transporte:        'Transportes',
}

export const MODULE_LABEL: Record<AppModule, string> = {
  wms:     'Herramientas de WMS / SAC',
  tms:     'Transportes',
  tasks:   'Task Manager',
}

export const MODULE_ACCESS: Record<UserRole, AppModule[]> = {
  admin:             ['wms', 'tms', 'tasks'],
  almacen:           ['wms', 'tasks'],
  servicio_cliente:  ['wms', 'tasks'],
  cobranza:          ['wms', 'tasks'],
  transporte:        ['tms', 'tasks'],
}

export const WMS_ROLES: UserRole[]     = ['admin', 'almacen', 'servicio_cliente', 'cobranza']
export const TMS_ROLES: UserRole[]     = ['admin', 'transporte']
export const ALMACEN_ROLES: UserRole[] = ['admin', 'almacen', 'servicio_cliente']
export const TASK_ROLES: UserRole[]    = ['admin', 'almacen', 'servicio_cliente', 'cobranza', 'transporte']

export const MODULE_BRIEFS: Record<AppModule, { title: string; body: string; tips: string[] }> = {
  wms: {
    title: 'Herramientas WMS / SAC',
    body: 'Centraliza herramientas de Servicio al Cliente y facturación operativa: clientes, validación de SKUs, receipts, RC y documentos fiscales.',
    tips: [
      'Usa Validador SKU antes de generar documentación.',
      'Genera receipts y RC desde datos revisados.',
      'Consulta clientes y documentos antes de pasar a cobranza.',
    ],
  },
  tms: {
    title: 'Transportes / TMS',
    body: 'Controla la operación de transporte: viajes, unidades, operadores, costos, cotizador, trámites y tablero de flota.',
    tips: [
      'Crea viajes desde el TMS y mantén estado/costos actualizados.',
      'Usa el cotizador antes de prometer tarifas al cliente.',
      'Revisa trámites y vencimientos de unidades con frecuencia.',
    ],
  },
  tasks: {
    title: 'Task Manager',
    body: 'Sirve para asignar, aceptar, pausar y cerrar tareas entre áreas, con medición de tiempo y disponibilidad del equipo.',
    tips: [
      'Acepta o rechaza tareas para que el solicitante tenga visibilidad.',
      'Usa el timer cuando una tarea deba medirse para costos internos.',
      'Consulta calendario y plantillas para trabajo recurrente.',
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
  if (path === '/almacen' || path.startsWith('/almacen/')) return 'wms'
  if (path.startsWith('/tasks') || path.startsWith('/admin')) return 'tasks'
  if (path.startsWith('/tms') || path === '/cotizador' || path === '/tramites') return 'tms'
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

const PATH_ROLE_OVERRIDES: { prefix: string; roles: UserRole[] }[] = []

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
  if (first === 'wms') return '/wms'
  if (first === 'tms') return '/tms'
  if (first === 'tasks') return '/tasks'
  return '/'
}
