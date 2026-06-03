// ── Tipos de Carta Porte 3.1 (CFDI 4.0) ───────────────────────────────────
// Espeja la tabla `cartas_porte` (migración 20260603000002). Los campos JSONB
// se modelan como objetos tipados aquí.

export interface Ubicacion {
  rfc:        string
  nombre:     string
  calle:      string
  numext:     string
  colonia:    string
  cp:         string
  estado:     string
  municipio:  string
  referencia?: string
}

export interface Mercancia {
  descripcion:    string
  descripcionSat: string
  claveSat:       string   // 8 dígitos — Clave Producto/Servicio SAT
  unidad:         string   // ClaveUnidad SAT (KGM, H87, PCE, etc.)
  cantidad:       number
  pesoBruto:      number   // kg
  pesoNeto:       number   // kg
  valor?:         number
}

export interface Transporte {
  placas:              string
  linea:               string
  remolque:            string
  pesoBrutoVehicular:  number   // kg — requerido por SAT
  rfcPermisionario?:   string
}

export interface Figura {
  operadorNombre:   string
  operadorRfc:      string
  operadorLicencia: string
}

export type CartaPorteStatus = 'borrador' | 'exportada' | 'timbrada' | 'cancelada'

export interface CartaPorte {
  id:                    string
  folio:                 string
  fecha:                 string                   // ISO timestamptz
  status:                CartaPorteStatus
  emisor_rfc:            string | null
  emisor_razon_social:   string | null
  emisor_regimen_fiscal: string | null
  emisor_cp_expedicion:  string | null
  remitente:             Ubicacion
  destinatarios:         Ubicacion[]
  transporte:            Transporte
  figura:                Figura
  mercancias:            Mercancia[]
  total_peso_bruto:      number
  total_peso_neto:       number
  xml_content:           string | null
  pdf_url:               string | null
  uuid_sat:              string | null
  notas:                 string | null
  creado_por:            string
  created_at:            string
  updated_at?:           string
}

export const EMPTY_UBICACION: Ubicacion = {
  rfc: '', nombre: '', calle: '', numext: '',
  colonia: '', cp: '', estado: '', municipio: '',
}

export const EMPTY_MERCANCIA: Mercancia = {
  descripcion: '', descripcionSat: '', claveSat: '', unidad: 'KGM',
  cantidad: 0, pesoBruto: 0, pesoNeto: 0,
}

export const EMPTY_TRANSPORTE: Transporte = {
  placas: '', linea: '', remolque: '', pesoBrutoVehicular: 0,
}

export const EMPTY_FIGURA: Figura = {
  operadorNombre: '', operadorRfc: '', operadorLicencia: '',
}
