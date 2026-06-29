/**
 * Perfiles de formato de nota de entrada por cliente.
 *
 * Cada cliente manda packing lists / facturas con columnas distintas. Aquí
 * mapeamos palabras clave del nombre del cliente (en Extensiv) a una "pista"
 * (hint) que se ANEXA al prompt de visión para extraer con precisión sin
 * depender solo del few-shot genérico.
 *
 * Para enseñar un formato nuevo: agrega una entrada con sus keywords + hint.
 * (Decisión de producto: config en código, no tabla/UI admin — ver plan.)
 */

interface ClientFormatProfile {
  /** Palabras clave (en MAYÚSCULAS) que pueden aparecer en el nombre del cliente. */
  keywords: string[]
  /** Pista específica que se anexa al prompt de visión. */
  hint: string
}

const PROFILES: ClientFormatProfile[] = [
  {
    keywords: ['IFIT', 'I FIT', 'NORDICTRACK', 'NORDIC TRACK', 'ICON', 'NTMX', 'PROFORM', 'SEKO'],
    hint:
      'SKU = el código alfanumérico bajo la columna "Product" (ej. NTEL16825, NTL49926-1, ' +
      'PFTL90924). Cantidad = columna "Quantity". IGNORA la columna "Cartons" (es un rango de ' +
      'cajas como "1-6"/"7-26"), "Tariff code", "KGS"/"Total KGS" y "Cu Meter"/"Total Cu Meter". ' +
      'El total declarado está como "Total Qty".',
  },
  {
    keywords: ['GARRIDO', 'GAREX', 'TARGET CONSULTING', 'TARGET'],
    hint:
      'SKU = el contenido completo de la columna "ITEM NO" (puede traer espacios/variante, ' +
      'ej. "GA-47V OAK SAND" — captúralo entero). Cantidad = columna "PCS" (NO "CTN"). IGNORA ' +
      '"UNIT G.W.", "TOTAL G.W.", "CARTON SIZE", "TOTAL VOL" y la fila "TOTAL". El total ' +
      'declarado es el "TOTAL" de la columna PCS.',
  },
  {
    keywords: ['LINET', 'WIBO', 'WISSNER', 'BOSSERHOFF', 'ELEGANZA'],
    hint:
      'Camas/equipo médico LINET. El SKU es el CÓDIGO alfanumérico (ej. 1GE412055-2313, ' +
      '1K40B611-336, 4PW171100LS), bajo "Material Description" (Delivery Note), "Article Code" ' +
      '(Proforma), "Model number" (CSV) o "Product number" (Excel). El NOMBRE ("Eleganza 4 With ' +
      'scales", "Solido 3", "Praktika 2") está en la columna de al lado y NUNCA es el SKU. ' +
      'Cantidad = "Quantity"/"pcs"/"Item Qty". Seriales bajo "Serial no". IGNORA Unit Price/VAT/' +
      'Gross Price/Discount (USD), HS code, pesos, dimensiones y "Pcs in colli".',
  },
  {
    keywords: ['FITNESS FOR LIFE', 'LIFE FITNESS', 'RIVIERA MAYA'],
    hint:
      'Layout "Model # & COO": SKU = el código de la columna "Model #" (ej. ASPT-SL-ALLXN-13, ' +
      'OP-HAA, HS-OB-1004-01). Hay una columna "ORG" a la IZQUIERDA con un código de origen de 3 ' +
      'letras (CMC/USA/MEX/IND/TWN/HUN/GER/CHN/ITA/JPN) que NO es parte del SKU — no lo ' +
      'concatenes. Cantidad: prefiere "Unit QTY" sobre "# of Pcs Shipped".',
  },
]

/**
 * Devuelve la pista de formato para un cliente, o undefined si no hay match
 * (en cuyo caso el prompt genérico + few-shot se encarga).
 */
export function getClientImportHint(customerName: string | null | undefined): string | undefined {
  if (!customerName) return undefined
  const name = customerName.toUpperCase()
  for (const p of PROFILES) {
    if (p.keywords.some(k => name.includes(k))) return p.hint
  }
  return undefined
}
