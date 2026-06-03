// ─────────────────────────────────────────────────────────────────────────────
// Cotizador de Fletes — Supply Chain México
// Extracted from SupplyChain_Cotizador_v6.html
// ─────────────────────────────────────────────────────────────────────────────
import { BASE_MANIOBRISTAS, BASE_OPERADORES } from '../../lib/tmsCatalog'

export interface Unidad {
  clave:        string
  placa:        string
  modelo:       string
  tipo:         string
  combustible:  'Diésel' | 'Gasolina'
  /** km por litro */
  rendimiento:  number
  /** MXN por día de depreciación */
  depreciacion: number
}

export const UNIDADES: Unidad[] = [
  { clave: 'RAB_54AK8K', placa: '54AK8K',  modelo: 'ISUZU Forward',     tipo: 'Rabón',      combustible: 'Diésel',   rendimiento: 3.2,  depreciacion: 346.78 },
  { clave: 'RAB_56AK8K', placa: '56AK8K',  modelo: 'VW Constellation',  tipo: 'Rabón',      combustible: 'Diésel',   rendimiento: 3.8,  depreciacion: 132.87 },
  { clave: 'RAB_57AK8K', placa: '57AK8K',  modelo: 'ISUZU Forward',     tipo: 'Rabón',      combustible: 'Diésel',   rendimiento: 2.0,  depreciacion: 129.43 },
  { clave: 'RAB_58D1AC', placa: '58D1AC',  modelo: 'Por confirmar',     tipo: 'Rabón',      combustible: 'Diésel',   rendimiento: 3.5,  depreciacion: 200.00 },
  { clave: 'VAN_98D4AA', placa: '98D4AA',  modelo: 'VW Transporter',    tipo: 'Van',        combustible: 'Gasolina', rendimiento: 5.5,  depreciacion: 86.51  },
  { clave: 'VAN_D41BPR', placa: 'D41BPR',  modelo: 'VW Caddy',          tipo: 'Van ligera', combustible: 'Gasolina', rendimiento: 9.5,  depreciacion: 122.13 },
  { clave: 'AUT_MGP230A',placa: 'MGP230A', modelo: 'KIA Rio',           tipo: 'Auto chico', combustible: 'Gasolina', rendimiento: 14,   depreciacion: 35.96  },
]

// Márgenes por tipo de cliente (markup sobre costo)
export const MARGENES_CLIENTE: Record<string, number> = {
  HERMANA:      0.15,   // Empresa hermana  +15 %
  INTERMEDIARIO:0.20,   // Intermediario    +20 %
  FINAL:        0.35,   // Cliente final    +35 %
  ESPECIAL:     0.50,   // Cliente especial +50 %
}

export const TIPOS_CLIENTE = [
  { value: 'HERMANA',       label: 'Empresa hermana (+15%)' },
  { value: 'INTERMEDIARIO', label: 'Intermediario (+20%)'   },
  { value: 'FINAL',         label: 'Cliente final (+35%)'   },
  { value: 'ESPECIAL',      label: 'Cliente especial (+50%)'},
]

// Precio por litro (MXN)
export const PRECIO_COMBUSTIBLE: Record<string, number> = {
  'Diésel':  26.6,
  'Gasolina':25.0,
}

// Bonos operador default (MXN)
export const BONOS_DEFAULT = {
  SUELDO:    420,    // por día
  KM_CARGA:  1,      // por km cargado
  KM_VACIO:  0.5,    // por km en vacío
  COMIDA:    150,    // por comida (3/día)
  HOSPEDAJE: 1_000,  // por noche
}

// Tarifas días especiales / bonos extra (MXN por día trabajado)
export const HE_TARIFAS = {
  MATUTINO: 200,
  NOCTURNO: 200,
  SABADO:   500,
  DOMINGO:  500,
  FESTIVO:  1_000,
}

// Gastos fijos diarios (MXN)
export const FIJOS = {
  GPS:    30.77,
  RENTA:  80.78,
  SEGURO: 72.88,
}
export const FIJOS_DIA = FIJOS.GPS + FIJOS.RENTA + FIJOS.SEGURO  // 184.43 / día

// Operadores de flota (4 — manejan unidad)
export const OPERADORES_DEFAULT = BASE_OPERADORES

// Maniobristas (2 — carga/descarga, no manejan unidad)
export const MANIOBRISTAS_DEFAULT = BASE_MANIOBRISTAS

// Link a GlobalMap para calcular rutas reales
export const GLOBALMAP_URL = 'https://www.gmap.com.mx/Console/index.php'

// ── Tipos de trámite vehicular ─────────────────────────────────────────────
export interface TipoTramite {
  id: string
  nombre: string
  color: string
  diasAlerta: number
}

export const TIPOS_TRAMITE: TipoTramite[] = [
  { id: 'tenencia',              nombre: 'Tenencia',             color: '#ef4444', diasAlerta: 30 },
  { id: 'verificacion',          nombre: 'Verificación',         color: '#f59e0b', diasAlerta: 15 },
  { id: 'servicio',              nombre: 'Servicio',             color: '#3b82f6', diasAlerta: 7  },
  { id: 'seguro',                nombre: 'Seguro',               color: '#8b5cf6', diasAlerta: 30 },
  { id: 'poliza',                nombre: 'Póliza',               color: '#06b6d4', diasAlerta: 30 },
  { id: 'licencia',              nombre: 'Licencia',             color: '#10b981', diasAlerta: 60 },
  { id: 'rendimiento_unidades',  nombre: 'Rendimiento unidades', color: '#fbbf24', diasAlerta: 14 },
]

// Tipos cuyo "unidad" puede ser GLOBAL en vez de una placa específica.
export const TIPOS_TRAMITE_GLOBALES = ['rendimiento_unidades'] as const

// Valor especial para representar "todas las unidades" en el campo `unidad`.
export const UNIDAD_GLOBAL = '__TODAS__'
