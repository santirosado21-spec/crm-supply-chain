// Generador de PDF de Carta Porte. Import dinámico de jsPDF (ya dependencia del repo).
// Reusa el patrón del Cotizador (CotizadorPage.generarPDF línea ~94).

import type { CartaPorte, Ubicacion } from '../types/cartaPorte'

const NAVY: [number, number, number] = [30, 58, 95]
const RED:  [number, number, number] = [196, 55, 60]
const GRAY: [number, number, number] = [120, 120, 120]
const BLACK: [number, number, number] = [40, 40, 40]

function fmtUbicacion(u: Ubicacion): string {
  const parts = [u.calle, u.numext, u.colonia].filter(Boolean).join(' ')
  const lugar = [u.municipio, u.estado].filter(Boolean).join(', ')
  return `${parts}${lugar ? ' · ' + lugar : ''} · C.P. ${u.cp}`
}

export async function generarCartaPortePDF(cp: CartaPorte): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

  // ── Header navy ────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, 210, 38, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.text('CARTA PORTE 3.1', 15, 18)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('CFDI 4.0 · Complemento Carta Porte (SIN TIMBRAR)', 15, 24)

  // Folio destacado derecha
  doc.setFontSize(9)
  doc.setTextColor(200, 200, 200)
  doc.text('FOLIO', 160, 14)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(cp.folio, 160, 21)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(220, 220, 220)
  doc.text(new Date(cp.fecha).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }), 160, 27)

  let y = 46

  // ── Emisor ────────────────────────────────────────────────────────────────
  doc.setFillColor(245, 247, 250)
  doc.roundedRect(15, y, 180, 20, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('EMISOR', 20, y + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text(cp.emisor_razon_social ?? 'Supply Chain México', 20, y + 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...BLACK)
  doc.text(`RFC: ${cp.emisor_rfc ?? '—'}  ·  Régimen: ${cp.emisor_regimen_fiscal ?? '—'}  ·  CP exp.: ${cp.emisor_cp_expedicion ?? '—'}`, 20, y + 16)
  y += 26

  // ── Helper para sección de Ubicación ──────────────────────────────────────
  const drawUbicacion = (label: string, color: [number, number, number], u: Ubicacion): void => {
    if (y > 250) { doc.addPage(); y = 20 }
    doc.setFillColor(...color)
    doc.rect(15, y, 180, 5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text(label, 18, y + 3.5)
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.setFontSize(10)
    doc.text(u.nombre || '(sin nombre)', 20, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...BLACK)
    doc.text(`RFC: ${u.rfc || '—'}`, 20, y + 4)
    const dir = fmtUbicacion(u)
    const wrapped = doc.splitTextToSize(dir, 175)
    doc.text(wrapped, 20, y + 8)
    if (u.referencia) {
      doc.setTextColor(...GRAY)
      doc.text(`Ref: ${u.referencia}`, 20, y + 12 + (wrapped.length - 1) * 4)
    }
    y += 12 + (wrapped.length - 1) * 4 + (u.referencia ? 4 : 0) + 4
  }

  drawUbicacion('ORIGEN / REMITENTE', NAVY, cp.remitente)
  cp.destinatarios.forEach((d, i) => {
    drawUbicacion(`DESTINO / DESTINATARIO #${i + 1}`, RED, d)
  })

  // ── Transporte ────────────────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20 }
  doc.setFillColor(...NAVY)
  doc.rect(15, y, 180, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('DATOS DEL TRANSPORTE', 18, y + 3.5)
  y += 8
  doc.setFontSize(8)
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')
  doc.text(`Placas: ${cp.transporte.placas || '—'}`, 20, y)
  doc.text(`Remolque: ${cp.transporte.remolque || '—'}`, 110, y)
  y += 4
  doc.text(`Línea: ${cp.transporte.linea || '—'}`, 20, y)
  doc.text(`Peso bruto vehicular: ${cp.transporte.pesoBrutoVehicular.toFixed(2)} kg`, 110, y)
  y += 4
  if (cp.transporte.rfcPermisionario) {
    doc.text(`RFC permisionario: ${cp.transporte.rfcPermisionario}`, 20, y)
    y += 4
  }
  y += 4

  // ── Figura del Transporte ─────────────────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 20 }
  doc.setFillColor(...NAVY)
  doc.rect(15, y, 180, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('FIGURA DEL TRANSPORTE (OPERADOR)', 18, y + 3.5)
  y += 8
  doc.setFontSize(8)
  doc.setTextColor(...BLACK)
  doc.setFont('helvetica', 'normal')
  doc.text(`Operador: ${cp.figura.operadorNombre || '—'}`, 20, y)
  y += 4
  doc.text(`RFC: ${cp.figura.operadorRfc || '—'}  ·  Licencia: ${cp.figura.operadorLicencia || '—'}`, 20, y)
  y += 8

  // ── Mercancías (tabla) ────────────────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 20 }
  doc.setFillColor(...NAVY)
  doc.rect(15, y, 180, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('MERCANCÍAS', 18, y + 3.5)
  y += 8

  // Header tabla
  doc.setFillColor(240, 240, 240)
  doc.rect(15, y, 180, 6, 'F')
  doc.setFontSize(7)
  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'bold')
  doc.text('DESCRIPCIÓN', 18, y + 4)
  doc.text('CLAVE SAT', 95, y + 4)
  doc.text('UN', 120, y + 4)
  doc.text('CANT', 132, y + 4, { align: 'right' })
  doc.text('PESO BRUTO', 160, y + 4, { align: 'right' })
  doc.text('PESO NETO', 192, y + 4, { align: 'right' })
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BLACK)
  doc.setFontSize(7.5)
  cp.mercancias.forEach(m => {
    if (y > 270) { doc.addPage(); y = 20 }
    const descLines = doc.splitTextToSize(m.descripcion || '—', 75)
    doc.text(descLines, 18, y + 3)
    doc.text(m.claveSat || '—', 95, y + 3)
    doc.text(m.unidad || '—', 120, y + 3)
    doc.text(String(m.cantidad ?? 0), 132, y + 3, { align: 'right' })
    doc.text(`${(m.pesoBruto ?? 0).toFixed(3)} kg`, 160, y + 3, { align: 'right' })
    doc.text(`${(m.pesoNeto ?? 0).toFixed(3)} kg`, 192, y + 3, { align: 'right' })
    y += Math.max(5, descLines.length * 3 + 2)
    doc.setDrawColor(230, 230, 230)
    doc.line(15, y, 195, y)
    y += 1
  })

  // Totales
  if (y > 260) { doc.addPage(); y = 20 }
  y += 2
  doc.setFillColor(...NAVY)
  doc.rect(110, y, 85, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text(`TOTAL BRUTO: ${cp.total_peso_bruto.toFixed(3)} kg`, 113, y + 4.5)
  doc.text(`NETO: ${cp.total_peso_neto.toFixed(3)} kg`, 175, y + 4.5, { align: 'right' })
  y += 12

  // ── Notas + footer ────────────────────────────────────────────────────────
  if (cp.notas) {
    if (y > 250) { doc.addPage(); y = 20 }
    doc.setTextColor(...GRAY)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    const notasWrapped = doc.splitTextToSize(`Notas: ${cp.notas}`, 175)
    doc.text(notasWrapped, 20, y)
    y += notasWrapped.length * 3 + 4
  }

  // Footer en todas las páginas
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(
      `DOCUMENTO INTERNO · SIN VALOR FISCAL (no timbrado) · Folio ${cp.folio} · Pág ${p}/${totalPages}`,
      105, 290, { align: 'center' },
    )
  }

  return doc.output('blob')
}
