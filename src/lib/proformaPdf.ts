// Generador de PDF de la Proforma consolidada. Import dinámico de jsPDF, mismo
// patrón que cartaPortePdf.ts (paleta navy/red, secciones con barra de color).
import type { ProformaPreview, ProformaSeccion, Moneda } from './proformaBuilder'

const NAVY: [number, number, number] = [30, 58, 95]
const RED:  [number, number, number] = [196, 55, 60]
const GRAY: [number, number, number] = [120, 120, 120]
const BLACK: [number, number, number] = [40, 40, 40]

const SECCION_LABEL: Record<ProformaSeccion, string> = {
  wms:        'ALMACÉN (WMS · Extensiv)',
  flete:      'FLETE PROPIO',
  paqueteria: 'PAQUETERÍA',
}

export interface ProformaPdfHeader {
  referencia:     string
  clienteNombre:  string
  periodoDesde:   string
  periodoHasta:   string
  creadoPor?:     string | null
}

function fmtMoney(n: number, moneda: Moneda): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`
}

function fmtFecha(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export async function generarProformaPDF(header: ProformaPdfHeader, preview: ProformaPreview): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  // ── Header navy ────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, 210, 34, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text('PROFORMA', 15, 16)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Periodo ${fmtFecha(header.periodoDesde)} — ${fmtFecha(header.periodoHasta)}`, 15, 22)
  doc.text(header.clienteNombre, 15, 27)

  doc.setFontSize(9)
  doc.setTextColor(200, 200, 200)
  doc.text('FOLIO', 160, 12)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(header.referencia, 160, 19)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(220, 220, 220)
  doc.text(new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }), 160, 25)

  let y = 42

  const seccionesConLineas = (['wms', 'flete', 'paqueteria'] as ProformaSeccion[])
    .map(seccion => ({ seccion, lineas: preview.lineas.filter(l => l.seccion === seccion && l.incluida) }))
    .filter(s => s.lineas.length > 0)

  const subtotalPorSeccion: Record<ProformaSeccion, number> = {
    wms: preview.subtotalWms,
    flete: preview.subtotalFlete,
    paqueteria: preview.subtotalPaqueteria,
  }

  for (const { seccion, lineas } of seccionesConLineas) {
    if (y > 250) { doc.addPage(); y = 20 }

    doc.setFillColor(...NAVY)
    doc.rect(15, y, 180, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text(SECCION_LABEL[seccion], 18, y + 4.2)
    y += 9

    doc.setFillColor(240, 240, 240)
    doc.rect(15, y, 180, 5, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.setFont('helvetica', 'bold')
    doc.text('CONCEPTO', 18, y + 3.5)
    doc.text('REF.', 110, y + 3.5)
    doc.text('CANT', 145, y + 3.5, { align: 'right' })
    doc.text('MONTO', 192, y + 3.5, { align: 'right' })
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.setFontSize(7.5)
    for (const linea of lineas) {
      if (y > 270) { doc.addPage(); y = 20 }
      const conceptoLines = doc.splitTextToSize(linea.concepto, 88)
      doc.text(conceptoLines, 18, y + 3)
      doc.text(linea.referencia || '—', 110, y + 3)
      doc.text(String(linea.cantidad), 145, y + 3, { align: 'right' })
      doc.text(fmtMoney(linea.monto, linea.moneda), 192, y + 3, { align: 'right' })
      y += Math.max(5, conceptoLines.length * 3 + 2)
      doc.setDrawColor(230, 230, 230)
      doc.line(15, y, 195, y)
      y += 1
    }

    y += 1
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...NAVY)
    doc.text(`Subtotal ${SECCION_LABEL[seccion]}: ${fmtMoney(subtotalPorSeccion[seccion], preview.moneda)}`, 192, y, { align: 'right' })
    y += 8
  }

  // ── Totales ──────────────────────────────────────────────────────────────
  if (y > 255) { doc.addPage(); y = 20 }
  y += 2
  doc.setDrawColor(...GRAY)
  doc.line(115, y, 195, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...BLACK)
  doc.text('Subtotal:', 150, y)
  doc.text(fmtMoney(preview.subtotal, preview.moneda), 192, y, { align: 'right' })
  y += 5
  doc.text(`IVA (${preview.ivaPct}%):`, 150, y)
  doc.text(fmtMoney(preview.ivaMonto, preview.moneda), 192, y, { align: 'right' })
  y += 6

  doc.setFillColor(...RED)
  doc.rect(115, y - 4.5, 80, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL:', 150, y + 1)
  doc.text(fmtMoney(preview.total, preview.moneda), 192, y + 1, { align: 'right' })
  y += 14

  if (header.creadoPor) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text(`Generada por: ${header.creadoPor}`, 15, y)
  }

  // Footer en todas las páginas
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(
      `DOCUMENTO INTERNO · Proforma ${header.referencia} · Pág ${p}/${totalPages}`,
      105, 290, { align: 'center' },
    )
  }

  return doc.output('blob')
}
