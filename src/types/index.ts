export type UserRole = 'admin' | 'almacen' | 'servicio_cliente' | 'cobranza' | 'transporte' | 'comercial'

// ── Estados del flujo operativo v2.0 (Procesos v2 Sistema Integrado) ──
// creada → validada_sac → confirmada_almacen → cerrada_sac → tarifario_ok → enviada_bind
// cancelada es estado terminal paralelo a cualquier paso del flujo
export type OperationStatus =
  | 'creada'
  | 'validada_sac'
  | 'confirmada_almacen'
  | 'cerrada_sac'
  | 'tarifario_ok'
  | 'enviada_bind'
  | 'cancelada'
  // Legacy — mantenidos para compatibilidad con datos históricos
  | 'en_proceso'
  | 'cerrada'
  | 'pendiente'

export const OPERATION_FLOW: OperationStatus[] = [
  'creada',
  'validada_sac',
  'confirmada_almacen',
  'cerrada_sac',
  'tarifario_ok',
  'enviada_bind',
]

export type OperationType =
  | 'entrada'
  | 'salida'
  | 'recoleccion'
  | 'recoleccion_entrega'
  | 'cross_dock'
  | 'actividad_almacen'
  | 'flete'
  | 'maniobra'

// ── Full Bitácora Operation (mirrors Excel columns) ──────────────────────────
export interface Operation {
  id:                    string
  referencia:            string          // Auto-generated: SC{clientCode}{0000}
  cliente_nombre:        string          // Display name
  cliente_codigo:        string          // Code used in reference generation
  fecha:                 string          // ISO date (YYYY-MM-DD)
  estado:                OperationStatus
  asunto_cliente:        string          // "Asunto Cliente (Correo)"
  ref_cliente:           string          // "Ref Cliente (PT, OR, OC…)"
  tipo_operacion:        OperationType
  incluye_transporte:    boolean
  proveedor:             string          // Carrier / freight provider name
  costo_proveedor:       number          // Provider cost (MXN)
  factura_proveedor:     string          // Provider invoice folio
  rc_transporte:         boolean         // Rendición de cuentas submitted
  pod:                   boolean         // Proof of Delivery received
  evidencias:            boolean         // Photo + exit note attached
  proforma:              boolean         // Proforma created
  comentarios:           string
  costo_cliente:         number          // What we bill the client (MXN)
  factura_supply:        string          // Our invoice folio
  folio_factura:         string          // Final invoice number issued by SAT
  fecha_envio_rc:        string          // Date RC + invoice request was sent
  fecha_envio_factura:   string          // Date invoice was delivered
  url_evidencias:        string          // Link Google Drive con evidencias
  url_pod:               string          // Link Google Drive con POD
  creado_por:            string          // User name/email
  created_at:            string          // ISO timestamp
  // ── Gate de Cobranza (flujo v2.0) ──────────────────────────────────────
  cobranza_aprobada_at?:  string | null   // Timestamp aprobación Cobranza
  cobranza_aprobada_por?: string | null   // Email/nombre del que aprobó
  proforma_id?:           string | null   // UUID de la proforma generada
  // ── Extensiv 3PL tracking ──────────────────────────────────────────────
  extensiv_order_id?:     string | null
  extensiv_receipt_id?:   string | null
  extensiv_customer_id?:  number | null
  origen?:                'manual' | 'extensiv_auto' | null
  ref_correo_sac?:        string | null
}

// ── CLIENTES_BITACORA — deprecated: usar useClientCatalog() hook en su lugar ─
// Se mantiene temporalmente para compatibilidad con el Cotizador (archivo grande)
export const CLIENTES_BITACORA = [
  { codigo: '200',    nombre: 'FITNESS FOR LIFE RIVIERA MAYA'    },
  { codigo: '090',    nombre: 'FITNESS FOR LIFE MÉRIDA'          },
  { codigo: 'VY8',    nombre: 'VERMONT YORK'                     },
  { codigo: 'WD',     nombre: 'WORLD DIAGNOSTIC'                 },
  { codigo: '600',    nombre: 'EPOSNOW'                          },
  { codigo: 'KST',    nombre: 'KST (SUPPLY CHAIN WORLDWIDE)'     },
  { codigo: 'SK',     nombre: 'SEKO'                             },
  { codigo: '070',    nombre: 'GNR'                              },
  { codigo: 'BSF',    nombre: 'BASF'                             },
  { codigo: 'KYN',    nombre: 'KYNDRYL'                          },
  { codigo: '500',    nombre: 'ITWORKS'                          },
  { codigo: 'RED',    nombre: 'LA RED'                           },
  { codigo: 'LUL',    nombre: 'LULULEMON'                        },
  { codigo: 'BB',     nombre: 'BURBERRY'                         },
  { codigo: 'TB',     nombre: 'TOUGHBUILT'                       },
  { codigo: '800',    nombre: 'RMC'                              },
  { codigo: 'MC',     nombre: 'MICROCOMPUTADORAS'                },
  { codigo: 'AZ',     nombre: 'ANTONIO ZAPATA'                   },
  { codigo: 'PG',     nombre: 'PRINCIPLE GLOBAL'                 },
  { codigo: '700',    nombre: 'PANTANS'                          },
  { codigo: '080',    nombre: 'CASIQUE RUTA NORMAL'              },
  { codigo: 'AHT',    nombre: 'AHT'                              },
  { codigo: '400',    nombre: 'TEQUILA ENEMIGO'                  },
  { codigo: 'IFT',    nombre: 'IFIT'                             },
  { codigo: '071',    nombre: 'TARGET CONSULTING'                },
  { codigo: 'WB',     nombre: 'WI-BO'                            },
  { codigo: 'LIN',    nombre: 'LINET'                            },
] as const

export type ClienteCode = typeof CLIENTES_BITACORA[number]['codigo']

// ── Legacy types kept for other pages ────────────────────────────────────────
export interface User {
  id:           string
  email:        string
  name:         string
  role:         UserRole
  warehouse_id: string | null
  is_active:    boolean
  created_at:   string
}

export interface Client {
  id:                    string
  name:                  string
  codigo:                string | null
  contact_name:          string | null
  contact_email:         string | null
  contact_phone:         string | null
  is_active:             boolean
  extensiv_customer_id?: number | null
  /** Razón social fiscal (CFDI) — usada en el encabezado de la Proforma. */
  razon_social?:         string | null
}

// ── TMS Types ──────────────────────────────────────────────────────────────
export * from './tms'
