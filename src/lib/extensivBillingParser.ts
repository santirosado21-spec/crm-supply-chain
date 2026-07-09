/**
 * Parser del export CSV del Billing Manager de Extensiv (cargos de almacén:
 * handling/picking/storage) — puro, testeable en Node (sigue el patrón de
 * sheetParser.ts).
 *
 * Gotchas verificados corriendo XLSX.read contra un CSV real de Extensiv:
 * - Por default, `XLSX.read` autodetecta tipos al parsear CSV y corrompe
 *   `Created Date`/`Confirm Date` (ej. "07/06/2026" → serial de Excel
 *   46208.999... → convertido de vuelta cae un día antes). `readExtensivBillingWorkbook`
 *   usa `{ raw: true }` en el READ (no en sheet_to_json) para que todas las
 *   celdas se mantengan como el texto plano tal cual viene en el archivo —
 *   úsala siempre en vez de llamar `XLSX.read` directo para este CSV.
 * - Con `raw: true` en el read, el wrapper de fórmula de Excel `="SO001660"`
 *   (fuerza texto, preserva ceros/guiones) YA NO se des-envuelve solo —
 *   `stripFormulaWrapper` lo limpia explícitamente.
 * - Columnas numéricas (`Quantity`, `Charge Per Unit`, `Total`) llegan como
 *   texto con `raw: true` — `getNum()` las parsea con `parseFloat`.
 * - Ojo con el layout real de este export: en la muestra usada para tests, el
 *   valor con forma de tracking number de paquetería (10 dígitos) cae en la
 *   columna "PO Number", no en "Tracking Number" (que trae un folio interno
 *   tipo "S03290750-2"). El matching contra `guias_paqueteria.tracking_number`
 *   debe considerar ambas columnas, no asumir que "Tracking Number" siempre
 *   trae el tracking real del carrier.
 */
import * as XLSX from 'xlsx'

/** Lee el CSV del Billing Manager con las opciones correctas (ver gotchas arriba). */
export function readExtensivBillingWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array', raw: true })
}

export interface ExtensivBillingRow {
  customerName:            string
  rateId:                  string
  invoiceNumber:           string
  warehouseId:             string
  warehouseName:           string
  transactionId:           string
  glAccount:               string
  transactionType:         string
  category:                string
  chargeType:               string
  chargeLabel:              string
  memo:                     string
  countingUnit:             string
  countingMethod:           string
  quantity:                 number
  chargePerUnit:            number
  total:                    number
  status:                   string
  createdDate:              string
  inboundReferenceNumber:   string
  outboundReferenceNumber:  string
  trackingNumber:           string
  sku:                      string
  weight:                   string
  bolNumber:                string
  poNumber:                 string
  lotNumber:                string
  serialNumber:             string
  muLabel:                  string
  storageUoM:               string
  inventoryUoM:             string
  trailerNumber:            string
  confirmDate:              string
  locationName:             string
  class:                    string
  itemDescription:          string
  unitDescription:          string
}

const HEADER_MAP: Record<string, keyof ExtensivBillingRow> = {
  'customer name':              'customerName',
  'rate id':                    'rateId',
  'invoice number':              'invoiceNumber',
  'warehouse id':                'warehouseId',
  'warehouse name':              'warehouseName',
  'transaction id':               'transactionId',
  'gl account':                   'glAccount',
  'transaction type':             'transactionType',
  'category':                     'category',
  'charge type':                  'chargeType',
  'charge label':                 'chargeLabel',
  'memo':                         'memo',
  'counting unit':                'countingUnit',
  'counting method':              'countingMethod',
  'quantity':                     'quantity',
  'charge per unit':              'chargePerUnit',
  'total':                        'total',
  'status':                       'status',
  'created date':                 'createdDate',
  'inbound reference number':     'inboundReferenceNumber',
  'outbound reference number':    'outboundReferenceNumber',
  'tracking number':              'trackingNumber',
  'sku':                          'sku',
  'weight':                       'weight',
  'bol number':                   'bolNumber',
  'po number':                    'poNumber',
  'lot number':                   'lotNumber',
  'serial number':                'serialNumber',
  'mu label':                     'muLabel',
  'storage uom':                  'storageUoM',
  'inventory uom':                'inventoryUoM',
  'trailer number':               'trailerNumber',
  'confirm date':                 'confirmDate',
  'location name':                'locationName',
  'class':                        'class',
  'itemdescription':              'itemDescription',
  'unitdescription':              'unitDescription',
}

export function stripFormulaWrapper(raw: unknown): string {
  const s = String(raw ?? '').trim()
  const m = /^="(.*)"$/.exec(s)
  return m ? m[1] : s
}

/** Normaliza una referencia para comparar (trim + mayúsculas) — usado para matching contra viajes/guías. */
export function normalizeReference(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase()
}

export function parseExtensivBillingCSV(wb: XLSX.WorkBook): ExtensivBillingRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  if (data.length === 0) return []

  const headerRow = data[0] ?? []
  const colIndex: Partial<Record<keyof ExtensivBillingRow, number>> = {}
  headerRow.forEach((h, i) => {
    const key = HEADER_MAP[String(h ?? '').trim().toLowerCase()]
    if (key) colIndex[key] = i
  })

  const rows: ExtensivBillingRow[] = []
  for (let r = 1; r < data.length; r++) {
    const row = data[r]
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue

    const get = (field: keyof ExtensivBillingRow): string => {
      const idx = colIndex[field]
      return idx === undefined ? '' : stripFormulaWrapper(row[idx])
    }
    const getNum = (field: keyof ExtensivBillingRow): number => {
      const idx = colIndex[field]
      if (idx === undefined) return 0
      const raw = row[idx]
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/[^\d.-]/g, ''))
      return Number.isFinite(n) ? n : 0
    }

    rows.push({
      customerName:             get('customerName'),
      rateId:                   get('rateId'),
      invoiceNumber:            get('invoiceNumber'),
      warehouseId:              get('warehouseId'),
      warehouseName:            get('warehouseName'),
      transactionId:            get('transactionId'),
      glAccount:                get('glAccount'),
      transactionType:          get('transactionType'),
      category:                 get('category'),
      chargeType:               get('chargeType'),
      chargeLabel:              get('chargeLabel'),
      memo:                     get('memo'),
      countingUnit:             get('countingUnit'),
      countingMethod:           get('countingMethod'),
      quantity:                 getNum('quantity'),
      chargePerUnit:            getNum('chargePerUnit'),
      total:                    getNum('total'),
      status:                  get('status'),
      createdDate:              get('createdDate'),
      inboundReferenceNumber:   get('inboundReferenceNumber'),
      outboundReferenceNumber:  get('outboundReferenceNumber'),
      trackingNumber:           get('trackingNumber'),
      sku:                      get('sku'),
      weight:                   get('weight'),
      bolNumber:                get('bolNumber'),
      poNumber:                 get('poNumber'),
      lotNumber:                get('lotNumber'),
      serialNumber:             get('serialNumber'),
      muLabel:                  get('muLabel'),
      storageUoM:               get('storageUoM'),
      inventoryUoM:             get('inventoryUoM'),
      trailerNumber:            get('trailerNumber'),
      confirmDate:              get('confirmDate'),
      locationName:             get('locationName'),
      class:                    get('class'),
      itemDescription:          get('itemDescription'),
      unitDescription:          get('unitDescription'),
    })
  }
  return rows
}

/** Filtra las filas del CSV (que trae TODOS los clientes de Extensiv) al cliente elegido. */
export function filterByCustomerName(rows: ExtensivBillingRow[], clienteNombre: string): ExtensivBillingRow[] {
  const target = clienteNombre.trim().toLowerCase()
  if (!target) return []
  return rows.filter(r => r.customerName.trim().toLowerCase() === target)
}

/**
 * Clave de dedupe: un mismo Transaction ID agrupa varias filas con distinto
 * Charge Label (ej. "Salida Por Caja" + "Picking por Caja" + "Procesamiento
 * de Orden" comparten Transaction ID) — así que la clave debe incluir ambos.
 */
export function dedupeKey(row: Pick<ExtensivBillingRow, 'transactionId' | 'chargeLabel'>): string {
  return `${normalizeReference(row.transactionId)}:${normalizeReference(row.chargeLabel)}`
}

/**
 * ¿Esta fila del CSV corresponde a la guía de paquetería con este tracking?
 * Revisa tanto `Tracking Number` como `PO Number` — en el export real de
 * Extensiv el valor con forma de tracking de carrier puede caer en cualquiera
 * de las dos columnas (ver nota de gotchas arriba).
 */
export function matchesTrackingNumber(row: ExtensivBillingRow, trackingNumber: string): boolean {
  const target = normalizeReference(trackingNumber)
  if (!target) return false
  return normalizeReference(row.trackingNumber) === target || normalizeReference(row.poNumber) === target
}
