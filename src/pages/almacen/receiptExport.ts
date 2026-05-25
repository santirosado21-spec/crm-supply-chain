import * as XLSX from 'xlsx'
import { sanitizeCellValue, type PTLineItem } from '../../lib/ptParser'

/*
  Generates an Extensiv Receipt Import Template XLSX file from parsed PT data.
  The output has NO cell colors / fills (user requirement).

  Template layout (row numbers 1-based as seen in Excel):
    Row 1: title + "*Berry headers are required fields"
    Row 2: headers (Ref #, PO #, ShipCarrier, Notes, SKU, Quantity, Lot#,
           Serial#, Expiration Date, LocationField1..4, Cost, Var UoM Avg)
    Rows 3+: data
*/
export function generateReceiptExcel(ref: string, items: PTLineItem[]): void {
  // Extensiv rejects the file if the title row (with "*Berry headers..." text)
  // is present. Headers must be on row 1.
  const HEADER_ROW = [
    'Ref #', 'PO #', 'ShipCarrier', 'Notes',
    'SKU', 'Quantity', 'Lot#', 'Serial#',
    'Expiration Date',
    'LocationField1', 'LocationField2', 'LocationField3', 'LocationField4',
    'Cost', 'Var UoM Avg',
  ]

  const dataRows = items.map(item => [
    sanitizeCellValue(ref),                       // A: Ref #
    '',                                           // B: PO #
    '',                                           // C: ShipCarrier
    '',                                           // D: Notes
    sanitizeCellValue(item.sku),                  // E: SKU
    item.qty,                                     // F: Quantity
    '',                                           // G: Lot#
    sanitizeCellValue(item.serialNumber ?? ''),   // H: Serial#
    '',                                           // I: Expiration Date
    '', '', '', '',                               // J-M: Location fields
    '',                                           // N: Cost
    '',                                           // O: Var UoM Avg
  ])

  const aoa = [HEADER_ROW, ...dataRows]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Column widths for readability
  ws['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 18 },
    { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 24 },
    { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 12 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Receipt Import Template')

  const safeRef = (ref || 'PT').replace(/[^\w-]/g, '_')
  XLSX.writeFile(wb, `Receipt_${safeRef}.xlsx`)
}
