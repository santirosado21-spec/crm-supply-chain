// PDF profesional de la Proforma — mismo formato que el Excel (proformaExcel.ts)
// y que la plantilla real del negocio: portada con bloques emisor/cliente,
// tabla agregada por concepto y pie Subtotal/IVA/Retención/Total; después
// secciones Servicios de Transporte, Paqueterías y Desglose de Almacén.
// Import dinámico de jsPDF, mismo patrón que cartaPortePdf.ts.
import type { ProformaPreview } from './proformaBuilder'
import type { ProformaDocHeader } from './proformaExcel'
import {
  EMISOR_DEFAULT, aggregateConceptos, formatPeriodoLargo, viajesExportRows,
  guiasExportRows, retencionLabel,
} from './proformaDoc'

const NAVY: [number, number, number] = [30, 58, 95]
const RED:  [number, number, number] = [196, 55, 60]
const GRAY: [number, number, number] = [120, 120, 120]
const BLACK: [number, number, number] = [40, 40, 40]

function fmtMoney(n: number, moneda: string): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`
}

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/hd-logo.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generarProformaPDF(header: ProformaDocHeader, preview: ProformaPreview): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const moneda = preview.moneda

  /* ── Portada ──────────────────────────────────────────────────────────── */
  const logo = await fetchLogoDataUrl()
  if (logo) {
    try { doc.addImage(logo, 'PNG', 15, 10, 42, 21) } catch { /* logo opcional */ }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...NAVY)
  doc.text('PROFORMA', 195, 22, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(`Folio: ${header.referencia} · Moneda: ${moneda}`, 195, 28, { align: 'right' })

  let y = 42
  // Bloque emisor (izquierda)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text(EMISOR_DEFAULT.razonSocial, 15, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...BLACK)
  doc.text(EMISOR_DEFAULT.direccion1, 15, y + 4.5)
  doc.text(EMISOR_DEFAULT.direccion2, 15, y + 8.5)
  doc.text(`RFC: ${EMISOR_DEFAULT.rfc}`, 15, y + 12.5)

  // Bloque cliente (derecha)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BLACK)
  doc.text(`Cliente: ${header.clienteRazonSocial || header.clienteNombre}`, 110, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Fecha: ${formatPeriodoLargo(header.periodoDesde, header.periodoHasta)}`, 110, y + 4.5)
  doc.text('Tipo de Servicio: Integral', 110, y + 8.5)

  y += 22

  /* ── Tabla agregada por concepto ─────────────────────────────────────── */
  doc.setFillColor(...NAVY)
  doc.rect(15, y, 180, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('CANTIDAD', 20, y + 4.7)
  doc.text('DESCRIPCIÓN', 45, y + 4.7)
  doc.text('COSTO UNITARIO', 150, y + 4.7, { align: 'right' })
  doc.text('COSTO TOTAL', 192, y + 4.7, { align: 'right' })
  y += 9

  const conceptos = aggregateConceptos(preview.lineas)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.setFontSize(8.5)
  for (const con of conceptos) {
    if (y > 250) { doc.addPage(); y = 20 }
    doc.text(String(con.cantidad), 27, y + 3, { align: 'center' })
    const descLines = doc.splitTextToSize(con.descripcion, 85)
    doc.text(descLines, 45, y + 3)
    if (con.costoUnitario != null) doc.text(fmtMoney(con.costoUnitario, moneda), 150, y + 3, { align: 'right' })
    doc.text(fmtMoney(con.costoTotal, moneda), 192, y + 3, { align: 'right' })
    y += Math.max(6, descLines.length * 4 + 2)
    doc.setDrawColor(230, 230, 230)
    doc.line(15, y, 195, y)
    y += 1
  }

  /* ── Pie: Subtotal / IVA / Retención / Total ─────────────────────────── */
  if (y > 235) { doc.addPage(); y = 20 }
  y += 4
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.text('Subtotal:', 150, y, { align: 'right' })
  doc.text(fmtMoney(preview.subtotal, moneda), 192, y, { align: 'right' })
  y += 5.5
  doc.text(`IVA (${preview.ivaPct}%):`, 150, y, { align: 'right' })
  doc.text(fmtMoney(preview.ivaMonto, moneda), 192, y, { align: 'right' })
  y += 5.5

  if (preview.retencionMonto > 0) {
    doc.setTextColor(...RED)
    const retLines = doc.splitTextToSize(retencionLabel(preview.subtotalFlete, moneda) + ':', 95)
    doc.text(retLines, 150, y, { align: 'right' })
    doc.text(`−${fmtMoney(preview.retencionMonto, moneda)}`, 192, y, { align: 'right' })
    y += retLines.length * 4 + 2.5
    doc.setTextColor(...BLACK)
  }

  doc.setFillColor(...NAVY)
  doc.rect(105, y - 4, 90, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL:', 150, y + 1.5, { align: 'right' })
  doc.text(fmtMoney(preview.total, moneda), 192, y + 1.5, { align: 'right' })
  y += 14

  /* ── Servicios de Transporte ─────────────────────────────────────────── */
  const viajes = viajesExportRows(preview.lineas)
  if (viajes.length > 0) {
    if (y > 220) { doc.addPage(); y = 20 }
    doc.setFillColor(...NAVY)
    doc.rect(15, y, 180, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text('SERVICIOS DE TRANSPORTE', 18, y + 4.2)
    y += 8

    doc.setFillColor(240, 240, 240)
    doc.rect(15, y, 180, 5, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text('REF. INTERNA', 17, y + 3.5)
    doc.text('FECHA', 55, y + 3.5)
    doc.text('REF CLIENTE', 75, y + 3.5)
    doc.text('ORIGEN', 122, y + 3.5)
    doc.text('DESTINO', 148, y + 3.5)
    doc.text('COSTO', 192, y + 3.5, { align: 'right' })
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.setFontSize(7.5)
    for (const v of viajes) {
      if (y > 270) { doc.addPage(); y = 20 }
      doc.text(String(v.refInterna).slice(0, 26), 17, y + 3)
      doc.text(v.fecha || '—', 55, y + 3)
      doc.text(String(v.refCliente).slice(0, 30), 75, y + 3)
      doc.text(String(v.origen).slice(0, 16), 122, y + 3)
      doc.text(String(v.destino).slice(0, 22), 148, y + 3)
      doc.text(fmtMoney(v.costo, moneda), 192, y + 3, { align: 'right' })
      y += 5.5
      doc.setDrawColor(235, 235, 235)
      doc.line(15, y, 195, y)
      y += 0.8
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text('TOTAL TRANSPORTE:', 150, y + 3, { align: 'right' })
    doc.text(fmtMoney(preview.subtotalFlete, moneda), 192, y + 3, { align: 'right' })
    y += 10
  }

  /* ── Paqueterías ─────────────────────────────────────────────────────── */
  const guias = guiasExportRows(preview.lineas)
  if (guias.length > 0) {
    if (y > 220) { doc.addPage(); y = 20 }
    doc.setFillColor(...NAVY)
    doc.rect(15, y, 180, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text('ENVÍOS POR PAQUETERÍA', 18, y + 4.2)
    y += 8

    doc.setFillColor(240, 240, 240)
    doc.rect(15, y, 180, 5, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text('PAQUETERÍA', 17, y + 3.5)
    doc.text('TRACKING', 50, y + 3.5)
    doc.text('FECHA', 115, y + 3.5)
    doc.text('REFERENCIA', 137, y + 3.5)
    doc.text('PRECIO', 192, y + 3.5, { align: 'right' })
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.setFontSize(7.5)
    for (const g of guias) {
      if (y > 270) { doc.addPage(); y = 20 }
      doc.text(g.paqueteria, 17, y + 3)
      doc.text(String(g.tracking).slice(0, 34), 50, y + 3)
      doc.text(g.fecha || '—', 115, y + 3)
      doc.text(String(g.referencia).slice(0, 26), 137, y + 3)
      doc.text(fmtMoney(g.precio, moneda), 192, y + 3, { align: 'right' })
      y += 5.5
      doc.setDrawColor(235, 235, 235)
      doc.line(15, y, 195, y)
      y += 0.8
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text('TOTAL PAQUETERÍA:', 150, y + 3, { align: 'right' })
    doc.text(fmtMoney(preview.subtotalPaqueteria, moneda), 192, y + 3, { align: 'right' })
    y += 10
  }

  /* ── Desglose Almacén ────────────────────────────────────────────────── */
  const wmsLineas = preview.lineas.filter(l => l.seccion === 'wms' && l.incluida)
  if (wmsLineas.length > 0) {
    doc.addPage()
    y = 20
    doc.setFillColor(...NAVY)
    doc.rect(15, y, 180, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text('DESGLOSE DE SERVICIOS DE ALMACÉN (EXTENSIV)', 18, y + 4.2)
    y += 8

    doc.setFillColor(240, 240, 240)
    doc.rect(15, y, 180, 5, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text('CONCEPTO', 17, y + 3.5)
    doc.text('REFERENCIA', 95, y + 3.5)
    doc.text('CANT', 135, y + 3.5, { align: 'right' })
    doc.text('P. UNITARIO', 165, y + 3.5, { align: 'right' })
    doc.text('TOTAL', 192, y + 3.5, { align: 'right' })
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.setFontSize(7.5)
    for (const l of wmsLineas) {
      if (y > 272) { doc.addPage(); y = 20 }
      doc.text(l.concepto.slice(0, 46), 17, y + 3)
      doc.text(l.referencia ?? '—', 95, y + 3)
      doc.text(String(l.cantidad), 135, y + 3, { align: 'right' })
      if (l.precioUnitario != null) doc.text(fmtMoney(l.precioUnitario, moneda), 165, y + 3, { align: 'right' })
      doc.text(fmtMoney(l.monto, moneda), 192, y + 3, { align: 'right' })
      y += 5
      doc.setDrawColor(238, 238, 238)
      doc.line(15, y, 195, y)
      y += 0.6
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text('TOTAL ALMACÉN:', 150, y + 3.5, { align: 'right' })
    doc.text(fmtMoney(preview.subtotalWms, moneda), 192, y + 3.5, { align: 'right' })
  }

  /* ── Footer en todas las páginas ─────────────────────────────────────── */
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(
      `${EMISOR_DEFAULT.razonSocial} · Proforma ${header.referencia} · Pág ${p}/${totalPages}`,
      105, 290, { align: 'center' },
    )
  }

  return doc.output('blob')
}
