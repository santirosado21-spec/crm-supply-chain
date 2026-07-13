/**
 * Excel profesional de la Proforma — replica el formato de la plantilla real
 * del negocio ("Proforma_LRM_Jan_26_Professional"): portada "ProForma" con
 * logo, bloques emisor/cliente, tabla agregada por concepto y pie
 * Subtotal/IVA/Retención/Total; más hojas "Servicios Transporte",
 * "Paqueterías" y "Desglose Almacén".
 *
 * Usa exceljs (el paquete `xlsx` community no escribe estilos) con import
 * dinámico para no engordar el bundle inicial — mismo patrón que el
 * import('jspdf') de cartaPortePdf.ts.
 */
import type { ProformaPreview } from './proformaBuilder'
import {
  EMISOR_DEFAULT, aggregateConceptos, formatPeriodoLargo, viajesExportRows,
  guiasExportRows, retencionLabel,
} from './proformaDoc'

export interface ProformaDocHeader {
  referencia:         string
  clienteNombre:      string
  clienteRazonSocial?: string | null
  periodoDesde:       string
  periodoHasta:       string
  creadoPor?:         string | null
}

const NAVY  = 'FF1E3A5F'
const RED   = 'FFC8373C'
const GRAY  = 'FFF5F7FA'
const WHITE = 'FFFFFFFF'

const MONEY_FMT = '"$"#,##0.00'

/** Longitud del texto tal como se ve en la celda (dinero formateado, números, texto). */
function displayLen(cell: { value: unknown; numFmt?: string }): number {
  const v = cell.value
  if (v == null || v === '') return 0
  if (typeof v === 'number') {
    // Aproxima el ancho del número formateado como moneda ($#,##0.00).
    const formatted = cell.numFmt
      ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : String(v)
    return formatted.length
  }
  return String(v).length
}

/**
 * Auto-ancho de columnas basado en el contenido — replica lo que hace el
 * doble-click en el borde de una columna en Excel. Omite celdas fusionadas
 * (su texto largo no debe inflar una columna angosta) y las filas fuera del
 * rango indicado (para no dejar que los bloques de encabezado distorsionen
 * una tabla). `maxWidth` topa el ancho; las columnas con `wrapText` muestran
 * el resto en varias líneas (Excel crece el alto de fila automáticamente).
 */
type AnyWorksheet = { columns: Array<{ width?: number }>; getCell: (r: number, c: number) => { value: unknown; numFmt?: string; isMerged?: boolean; master?: unknown }; rowCount: number }
function autofitColumns(
  ws: AnyWorksheet,
  opts: { fromRow: number; toRow: number; colCount: number; minWidths?: number[]; maxWidth?: number },
) {
  const { fromRow, toRow, colCount, minWidths = [], maxWidth = 40 } = opts
  for (let c = 1; c <= colCount; c++) {
    let maxLen = 0
    for (let r = fromRow; r <= toRow; r++) {
      const cell = ws.getCell(r, c)
      // Omite celdas fusionadas que no son el master (y masters con merge largo
      // igual quedan topadas por maxWidth abajo).
      if (cell.isMerged && cell.master && cell.master !== cell) continue
      const len = displayLen(cell)
      if (len > maxLen) maxLen = len
    }
    const min = minWidths[c - 1] ?? 8
    ws.columns[c - 1].width = Math.min(maxWidth, Math.max(min, maxLen + 2))
  }
}

async function fetchLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch('/hd-logo.png')
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK))
    }
    return btoa(bin)
  } catch {
    return null
  }
}

export async function generarProformaExcel(header: ProformaDocHeader, preview: ProformaPreview): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = EMISOR_DEFAULT.razonSocial
  wb.created = new Date()

  const moneda = preview.moneda

  /* ── Hoja 1: ProForma (portada) ──────────────────────────────────────── */
  const ws = wb.addWorksheet('ProForma', { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 14 }, { width: 44 }, { width: 18 }, { width: 18 }, { width: 4 },
  ]

  const logoB64 = await fetchLogoBase64()
  if (logoB64) {
    const imgId = wb.addImage({ base64: logoB64, extension: 'png' })
    ws.addImage(imgId, { tl: { col: 0.2, row: 0.4 }, ext: { width: 190, height: 95 } })
  }

  // Título
  const titleCell = ws.getCell('B7')
  titleCell.value = 'PROFORMA'
  titleCell.font = { name: 'Arial', size: 22, bold: true, color: { argb: NAVY } }
  ws.getRow(7).height = 30

  // Bloque emisor (izquierda) + bloque cliente (derecha)
  const emisorLines = [
    { cell: 'A9',  text: EMISOR_DEFAULT.razonSocial, bold: true },
    { cell: 'A10', text: EMISOR_DEFAULT.direccion1 },
    { cell: 'A11', text: EMISOR_DEFAULT.direccion2 },
    { cell: 'A12', text: `RFC: ${EMISOR_DEFAULT.rfc}` },
  ]
  for (const { cell, text, bold } of emisorLines) {
    const c = ws.getCell(cell)
    c.value = text
    c.font = { name: 'Arial', size: 9, bold: !!bold, color: { argb: 'FF444444' } }
  }
  // El bloque emisor abarca A–B (columna B es ancha); el de cliente va en C.
  const clienteLines = [
    { cell: 'C9',  text: `Cliente: ${header.clienteRazonSocial || header.clienteNombre}`, bold: true },
    { cell: 'C10', text: `Fecha: ${formatPeriodoLargo(header.periodoDesde, header.periodoHasta)}` },
    { cell: 'C11', text: 'Tipo de Servicio: Integral' },
    { cell: 'C12', text: `Folio: ${header.referencia} · Moneda: ${moneda}` },
  ]
  for (const { cell, text, bold } of clienteLines) {
    const c = ws.getCell(cell)
    c.value = text
    c.font = { name: 'Arial', size: 9, bold: !!bold, color: { argb: 'FF444444' } }
  }

  // Tabla agregada por concepto
  const headerRowIdx = 14
  const headers = ['Cantidad', 'Descripción', 'Costo Unitario', 'Costo Total']
  headers.forEach((h, i) => {
    const c = ws.getCell(headerRowIdx, i + 1)
    c.value = h
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { horizontal: i === 1 ? 'left' : 'center', vertical: 'middle' }
    c.border = { bottom: { style: 'thin', color: { argb: NAVY } } }
  })
  ws.getRow(headerRowIdx).height = 20

  const conceptos = aggregateConceptos(preview.lineas)
  let r = headerRowIdx + 1
  for (const con of conceptos) {
    ws.getCell(r, 1).value = con.cantidad
    ws.getCell(r, 1).alignment = { horizontal: 'center' }
    ws.getCell(r, 2).value = con.descripcion
    if (con.costoUnitario != null) {
      ws.getCell(r, 3).value = con.costoUnitario
      ws.getCell(r, 3).numFmt = MONEY_FMT
    }
    ws.getCell(r, 4).value = con.costoTotal
    ws.getCell(r, 4).numFmt = MONEY_FMT
    for (let cIdx = 1; cIdx <= 4; cIdx++) {
      ws.getCell(r, cIdx).font = { name: 'Arial', size: 10 }
      ws.getCell(r, cIdx).border = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } }
      if (r % 2 === 0) ws.getCell(r, cIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }
    }
    r++
  }

  const lastConceptRow = r - 1
  // Auto-ancho de la tabla de conceptos (solo estas filas; el emisor/cliente
  // de arriba se desborda sobre celdas vacías y no debe distorsionar la tabla).
  autofitColumns(ws as unknown as AnyWorksheet, {
    fromRow: headerRowIdx, toRow: lastConceptRow, colCount: 4,
    minWidths: [10, 22, 15, 15], maxWidth: 46,
  })

  // Pie: Subtotal / IVA / Retención / Total — etiqueta fusionada A:C (ancha)
  // para que el texto largo de la retención se lea completo.
  r++
  const wLabel = (ws.getColumn(1).width ?? 10) + (ws.getColumn(2).width ?? 22) + (ws.getColumn(3).width ?? 15)
  const pie: Array<{ label: string; value: number; bold?: boolean; negativo?: boolean }> = [
    { label: 'Subtotal', value: preview.subtotal },
    { label: `IVA (${preview.ivaPct}%)`, value: preview.ivaMonto },
  ]
  if (preview.retencionMonto > 0) {
    pie.push({ label: retencionLabel(preview.subtotalFlete, moneda), value: -preview.retencionMonto, negativo: true })
  }
  pie.push({ label: 'Total', value: preview.total, bold: true })

  for (const fila of pie) {
    ws.mergeCells(r, 1, r, 3)
    const lc = ws.getCell(r, 1)
    lc.value = fila.label
    lc.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true }
    lc.font = { name: 'Arial', size: fila.bold ? 12 : 10, bold: !!fila.bold, color: { argb: fila.negativo ? RED : 'FF444444' } }
    const vc = ws.getCell(r, 4)
    vc.value = fila.value
    vc.numFmt = MONEY_FMT
    vc.font = { name: 'Arial', size: fila.bold ? 12 : 10, bold: !!fila.bold, color: { argb: fila.negativo ? RED : (fila.bold ? WHITE : 'FF444444') } }
    if (fila.bold) {
      vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
      lc.font = { name: 'Arial', size: 12, bold: true, color: { argb: NAVY } }
    }
    // Alto de fila según cuántas líneas ocupa la etiqueta al envolverse en A:C.
    const lineas = Math.max(1, Math.ceil(fila.label.length / Math.max(20, wLabel - 2)))
    ws.getRow(r).height = Math.max(fila.bold ? 22 : 18, lineas * 15)
    r++
  }

  /* ── Hoja 2: Servicios Transporte ────────────────────────────────────── */
  const viajes = viajesExportRows(preview.lineas)
  if (viajes.length > 0) {
    const wt = wb.addWorksheet('Servicios Transporte', { views: [{ showGridLines: false }] })
    wt.columns = [{ width: 22 }, { width: 12 }, { width: 24 }, { width: 34 }, { width: 16 }, { width: 16 }, { width: 14 }]

    const tCell = wt.getCell('A1')
    tCell.value = 'SERVICIOS DE TRANSPORTE'
    tCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: NAVY } }
    wt.getRow(1).height = 24

    const tHeaders = ['REF. INTERNA', 'FECHA', 'CLIENTE', 'REF CLIENTE', 'ORIGEN', 'DESTINO', 'COSTO']
    tHeaders.forEach((h, i) => {
      const c = wt.getCell(2, i + 1)
      c.value = h
      c.font = { name: 'Arial', size: 9, bold: true, color: { argb: WHITE } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    // Columnas de texto libre que pueden ser largas → envolver en varias líneas.
    const wrapCols = new Set([1, 3, 4, 5, 6])
    let tr = 3
    for (const v of viajes) {
      wt.getCell(tr, 1).value = v.refInterna
      wt.getCell(tr, 2).value = v.fecha
      wt.getCell(tr, 3).value = header.clienteNombre
      wt.getCell(tr, 4).value = v.refCliente
      wt.getCell(tr, 5).value = v.origen
      wt.getCell(tr, 6).value = v.destino
      wt.getCell(tr, 7).value = v.costo
      wt.getCell(tr, 7).numFmt = MONEY_FMT
      for (let cIdx = 1; cIdx <= 7; cIdx++) {
        wt.getCell(tr, cIdx).font = { name: 'Arial', size: 9 }
        wt.getCell(tr, cIdx).border = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } }
        if (wrapCols.has(cIdx)) wt.getCell(tr, cIdx).alignment = { wrapText: true, vertical: 'top' }
      }
      tr++
    }
    const totCell = wt.getCell(tr, 6)
    totCell.value = 'TOTAL'
    totCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } }
    totCell.alignment = { horizontal: 'right' }
    const totVal = wt.getCell(tr, 7)
    totVal.value = preview.subtotalFlete
    totVal.numFmt = MONEY_FMT
    totVal.font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } }

    autofitColumns(wt as unknown as AnyWorksheet, {
      fromRow: 2, toRow: tr, colCount: 7,
      minWidths: [16, 12, 16, 20, 12, 12, 12], maxWidth: 38,
    })
  }

  /* ── Hoja 3: Paqueterías ─────────────────────────────────────────────── */
  const guias = guiasExportRows(preview.lineas)
  if (guias.length > 0) {
    const wp = wb.addWorksheet('Paqueterías', { views: [{ showGridLines: false }] })
    wp.columns = [{ width: 14 }, { width: 30 }, { width: 12 }, { width: 24 }, { width: 14 }]

    const pCell = wp.getCell('A1')
    pCell.value = 'ENVÍOS POR PAQUETERÍA'
    pCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: NAVY } }
    wp.getRow(1).height = 24

    const pHeaders = ['PAQUETERÍA', 'TRACKING', 'FECHA', 'REFERENCIA', 'PRECIO']
    pHeaders.forEach((h, i) => {
      const c = wp.getCell(2, i + 1)
      c.value = h
      c.font = { name: 'Arial', size: 9, bold: true, color: { argb: WHITE } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let pr = 3
    for (const g of guias) {
      wp.getCell(pr, 1).value = g.paqueteria
      wp.getCell(pr, 2).value = g.tracking
      wp.getCell(pr, 3).value = g.fecha
      wp.getCell(pr, 4).value = g.referencia
      wp.getCell(pr, 5).value = g.precio
      wp.getCell(pr, 5).numFmt = MONEY_FMT
      for (let cIdx = 1; cIdx <= 5; cIdx++) {
        wp.getCell(pr, cIdx).font = { name: 'Arial', size: 9 }
        wp.getCell(pr, cIdx).border = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } }
        if (cIdx === 2 || cIdx === 4) wp.getCell(pr, cIdx).alignment = { wrapText: true, vertical: 'top' }
      }
      pr++
    }
    const ptCell = wp.getCell(pr, 4)
    ptCell.value = 'TOTAL'
    ptCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } }
    ptCell.alignment = { horizontal: 'right' }
    const ptVal = wp.getCell(pr, 5)
    ptVal.value = preview.subtotalPaqueteria
    ptVal.numFmt = MONEY_FMT
    ptVal.font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } }

    autofitColumns(wp as unknown as AnyWorksheet, {
      fromRow: 2, toRow: pr, colCount: 5,
      minWidths: [14, 20, 12, 16, 12], maxWidth: 38,
    })
  }

  /* ── Hoja 4: Desglose Almacén ────────────────────────────────────────── */
  const wmsLineas = preview.lineas.filter(l => l.seccion === 'wms' && l.incluida)
  if (wmsLineas.length > 0) {
    const wd = wb.addWorksheet('Desglose Almacén', { views: [{ showGridLines: false }] })
    wd.columns = [{ width: 36 }, { width: 18 }, { width: 12 }, { width: 16 }, { width: 14 }]

    const dCell = wd.getCell('A1')
    dCell.value = 'DESGLOSE DE SERVICIOS DE ALMACÉN (EXTENSIV)'
    dCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: NAVY } }
    wd.getRow(1).height = 24

    const dHeaders = ['CONCEPTO', 'REFERENCIA', 'CANTIDAD', 'PRECIO UNITARIO', 'TOTAL']
    dHeaders.forEach((h, i) => {
      const c = wd.getCell(2, i + 1)
      c.value = h
      c.font = { name: 'Arial', size: 9, bold: true, color: { argb: WHITE } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let dr = 3
    for (const l of wmsLineas) {
      wd.getCell(dr, 1).value = l.concepto
      wd.getCell(dr, 1).alignment = { wrapText: true, vertical: 'top' }
      wd.getCell(dr, 2).value = l.referencia ?? ''
      wd.getCell(dr, 2).alignment = { wrapText: true, vertical: 'top' }
      wd.getCell(dr, 3).value = l.cantidad
      wd.getCell(dr, 3).alignment = { horizontal: 'center' }
      if (l.precioUnitario != null) {
        wd.getCell(dr, 4).value = l.precioUnitario
        wd.getCell(dr, 4).numFmt = MONEY_FMT
      }
      wd.getCell(dr, 5).value = l.monto
      wd.getCell(dr, 5).numFmt = MONEY_FMT
      for (let cIdx = 1; cIdx <= 5; cIdx++) {
        wd.getCell(dr, cIdx).font = { name: 'Arial', size: 9 }
        wd.getCell(dr, cIdx).border = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } }
      }
      dr++
    }
    const dtCell = wd.getCell(dr, 4)
    dtCell.value = 'TOTAL'
    dtCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } }
    dtCell.alignment = { horizontal: 'right' }
    const dtVal = wd.getCell(dr, 5)
    dtVal.value = preview.subtotalWms
    dtVal.numFmt = MONEY_FMT
    dtVal.font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } }

    autofitColumns(wd as unknown as AnyWorksheet, {
      fromRow: 2, toRow: dr, colCount: 5,
      minWidths: [30, 16, 10, 16, 14], maxWidth: 44,
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Nombre de archivo consistente para ambos exports: Proforma_{CLIENTE}_{folio}.{ext} */
export function proformaFileName(header: ProformaDocHeader, ext: 'xlsx' | 'pdf'): string {
  const cliente = header.clienteNombre.replace(/[^\w\dÁÉÍÓÚÑáéíóúñ-]+/g, '_')
  return `Proforma_${cliente}_${header.referencia}.${ext}`
}
