import type { UserRole } from '../types'

export type AppModule = 'wms' | 'tms' | 'almacen'

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
  almacen: 'Calendario Almacén',
}

// Matriz de acceso: el rol `almacen` queda EXCLUSIVO de su propio módulo;
// SAC/cobranza viven en WMS; transporte en TMS. El módulo "Calendario"
// (cross-team) no es AppModule — se controla por CALENDARIO_ROLES + ruta.
export const MODULE_ACCESS: Record<UserRole, AppModule[]> = {
  admin:             ['wms', 'tms', 'almacen'],
  almacen:           ['almacen'],
  servicio_cliente:  ['wms'],
  cobranza:          ['wms'],
  transporte:        ['tms'],
}

export const WMS_ROLES: UserRole[]     = ['admin', 'servicio_cliente', 'cobranza']
export const TMS_ROLES: UserRole[]     = ['admin', 'transporte']
export const ALMACEN_ROLES: UserRole[] = ['admin', 'almacen']
export const TASK_ROLES: UserRole[]    = ['admin', 'almacen', 'servicio_cliente', 'cobranza', 'transporte']
// CALENDARIO_ROLES: módulo cross-team renombrado desde Task Tracker.
// Almacén queda EXCLUIDO — opera en su propio módulo (Calendario Almacén).
export const CALENDARIO_ROLES: UserRole[] = ['admin', 'servicio_cliente', 'cobranza', 'transporte']

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
    title: 'Calendario Almacén',
    body: 'Centro de operación del CEDIS: recibe solicitudes del Calendario, distribuye por Pizarrón, asigna tiempos con estándares y opera la vista del día.',
    tips: [
      'Revisa "Hoy" al iniciar el turno para ver prioridades.',
      'Usa el Pizarrón Admin para designar y dar tiempos estimados.',
      'Consulta la Distribución para tomar tareas entrantes.',
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
  if (path === '/almacen' || path.startsWith('/almacen/')) return 'almacen'
  if (path.startsWith('/tms') || path === '/cotizador' || path === '/tramites') return 'tms'
  if (
    path.startsWith('/wms') ||
    path.startsWith('/sac') ||
    path === '/rc' ||
    path === '/tarifarios' ||
    path === '/servicios' ||
    path.startsWith('/clients')
  ) return 'wms'
  // /calendario/*, /tasks/*, /admin/* no pertenecen a un AppModule —
  // se controlan vía PATH_ROLE_OVERRIDES + ProtectedRoute.
  return null
}

const PATH_ROLE_OVERRIDES: { prefix: string; roles: UserRole[] }[] = [
  // Calendario (cross-team renombrado): admin + SAC + cobranza + transporte.
  // Almacén queda EXCLUIDO — usa su propio módulo /almacen.
  { prefix: '/calendario', roles: CALENDARIO_ROLES },
  // Compat: las rutas viejas /tasks/* siguen el mismo gate hasta que los
  // redirects las absorban en Navigate (defensa en profundidad).
  { prefix: '/tasks',      roles: CALENDARIO_ROLES },
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
  return '/'
}
