/**
 * Exports Excel compartidos del flujo de entradas de almacén.
 *
 * Centraliza los dos exports que antes vivían duplicados en las páginas:
 *  - downloadUnregistered  (Paso 1 — SKUs por dar de alta en Extensiv)
 *  - downloadDiscrepancies (Paso 3 — discrepancias vs. inventario actual)
 *
 * Los consumen tanto el wizard de entradas como las páginas sueltas.
 */
import * as XLSX from 'xlsx'

interface UnregisteredRow {
  sku:        string
  qty:        number
  registered: boolean
}

interface DiscrepancyRow {
  sku:     string
  qtyDoc:  number
  qtyExt:  number | null
  status:  'confirmed' | 'qty_diff' | 'not_found'
  anomaly?: string
}

/** Paso 1 — exporta los SKUs que aún no están dados de alta en Extensiv. */
export function downloadUnregistered(results: UnregisteredRow[], docName: string): void {
  const rows = results
    .filter(r => !r.registered)
    .map(r => ({
      SKU: r.sku,
      'Cantidad en Documento': r.qty,
      Estado: 'Necesita darse de alta en Extensiv',
    }))
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 36 }]
  XLSX.utils.book_append_sheet(wb, ws, 'SKUs por dar de alta')
  XLSX.writeFile(wb, `Codigos_Faltantes_${docName.replace(/\.[^.]+$/, '')}.xlsx`)
}

/** Paso 3 — exporta las discrepancias entre la nota y el inventario actual. */
export function downloadDiscrepancies(results: DiscrepancyRow[], docName: string): void {
  const hasAnomalies = results.some(r => r.anomaly && r.anomaly.trim())
  const rows = results
    .filter(r => r.status !== 'confirmed')
    .map(r => {
      const base: Record<string, string | number> = {
        SKU: r.sku,
        'Cantidad en Documento': r.qtyDoc,
        'Cantidad en Extensiv (onHand)': r.qtyExt === null ? 'No encontrado' : r.qtyExt,
        Diferencia: r.qtyExt === null ? '—' : r.qtyExt - r.qtyDoc,
        Estado:
          r.status === 'not_found'
            ? 'No encontrado en Extensiv'
            : 'Cantidad insuficiente en Extensiv',
      }
      if (hasAnomalies) base['Anomalía / Nota'] = r.anomaly?.trim() ?? ''
      return base
    })
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 30 }, { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 36 },
    ...(hasAnomalies ? [{ wch: 40 }] : []),
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Discrepancias')
  XLSX.writeFile(wb, `Validacion_Entrada_${docName.replace(/\.[^.]+$/, '')}.xlsx`)
}
