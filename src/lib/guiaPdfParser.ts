/**
 * Orquestador impuro: extrae texto posicional de un PDF de guía de paquetería
 * (reusa `extractPDFGrid` de ptParser.ts, sin duplicar la lógica de pdfjs/worker)
 * y delega la detección de campos a `guiaPdfFieldExtractor.ts` (puro, testeable).
 *
 * No tiene test propio — igual que ptParser.ts, depende del worker de pdfjs
 * servido desde /public, que no resuelve en Vitest/Node sin un PDF real. Se
 * cubre con prueba manual (subir cualquier PDF en /sac/guias-paqueteria).
 */
import { extractPDFGrid } from './ptParser'
import { extractGuiaFieldsFromRows, emptyExtraction, type GuiaPdfExtraction } from './guiaPdfFieldExtractor'
export type { GuiaPdfExtraction }

/**
 * Recibe el File del PDF de la guía, regresa la extracción best-effort.
 * Nunca lanza — cualquier error (PDF corrupto, no es un PDF real, falla el
 * worker) resulta en una extracción vacía con `warnings` poblado, para que la
 * captura manual en GuiaForm nunca se bloquee.
 */
export async function extractGuiaDataFromPDF(file: File): Promise<GuiaPdfExtraction> {
  try {
    const rows = await extractPDFGrid(file)
    return extractGuiaFieldsFromRows(rows)
  } catch (e) {
    return emptyExtraction([], e instanceof Error ? e.message : 'No se pudo leer el PDF')
  }
}
