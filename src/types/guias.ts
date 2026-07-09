// Tipos para módulo SAC · Guías de paquetería (Estafeta/UPS/FedEx/DHL/Castores)
// Resucitado desde el commit 534a31f (antes de las extensiones de rate-shopping
// del sprint "Techship replica", fuera de alcance aquí) + facturado_en_proforma_id.

export type Paqueteria = 'estafeta' | 'ups' | 'fedex' | 'dhl' | 'castores'
export type GuiaOrigen = 'extensiv' | 'manual'
export type GuiaExtensivType = 'order' | 'receipt'

export interface GuiaPaqueteria {
  id:                          string
  paqueteria:                  Paqueteria
  tracking_number:             string
  cliente_id:                  string
  cliente_codigo:              string | null
  costo:                       number
  precio:                      number
  margen:                      number
  fecha:                       string                              // YYYY-MM-DD
  origen:                      GuiaOrigen
  extensiv_transaction_type:   GuiaExtensivType | null
  extensiv_transaction_id:     string | null
  extensiv_customer_id:        number | null
  manual_reference:            string | null
  notas:                       string
  creado_por:                  string | null
  facturado_en_proforma_id:    string | null
  created_at:                  string
  updated_at:                  string
}

export type CreateGuiaData = Omit<GuiaPaqueteria, 'id' | 'margen' | 'facturado_en_proforma_id' | 'created_at' | 'updated_at'>
export type UpdateGuiaData = Partial<CreateGuiaData>

export interface GuiaFilters {
  clienteId?:    string
  paqueteria?:   Paqueteria | ''
  origen?:       GuiaOrigen | ''
  fechaDesde?:   string
  fechaHasta?:   string
  search?:       string                                            // tracking #, manual_reference o cliente
}

export const PAQUETERIA_LABEL: Record<Paqueteria, string> = {
  estafeta: 'Estafeta',
  ups:      'UPS',
  fedex:    'FedEx',
  dhl:      'DHL',
  castores: 'Castores',
}

export const PAQUETERIA_COLOR: Record<Paqueteria, string> = {
  estafeta: '#dc3545',
  ups:      '#7c3aed',
  fedex:    '#4d148c',
  dhl:      '#ffcc00',
  castores: '#1e3a5f',
}
