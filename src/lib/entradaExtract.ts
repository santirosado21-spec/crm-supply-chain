/**
 * Extracción unificada de items desde una nota de entrada (PDF / Excel / CSV).
 *
 * Encapsula el patrón repetido en las páginas de Almacén: para PDFs intenta
 * primero la extracción con IA (visión) y cae al lector local si falla o no
 * encuentra nada; para Excel/CSV usa directamente el lector local.
 *
 * Lo usan el wizard de entradas y las páginas sueltas (Validador de Códigos,
 * Facilitador, Validación de Entrada) para no divergir en el comportamiento.
 */
import { extractReceiptItemsFromPT, type PTLineItem } from './ptParser'
import { extractReceiptItemsWithVision } from './visionExtract'

export interface FileExtraction {
  items: PTLineItem[]
  ref:   string | null
  via:   'vision' | 'text' | null
}

export function isPdfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Extrae items + ref de una nota. No lanza por fallo de visión: cae al lector
 * local. Devuelve `via: null` si no se encontró nada (el caller decide el error).
 */
export async function extractItemsFromFile(file: File): Promise<FileExtraction> {
  // PDFs → visión primero (también cubre escaneados / imagen).
  if (isPdfFile(file)) {
    try {
      const ext = await extractReceiptItemsWithVision(file)
      if (ext.items.length > 0) {
        return { items: ext.items, ref: ext.ref ?? null, via: 'vision' }
      }
    } catch (visionErr) {
      console.warn('Extracción con IA falló, usando lector local:', visionErr)
    }
  }

  // Excel / CSV, o fallback si la visión falló / no encontró nada.
  const { ref, items } = await extractReceiptItemsFromPT(file)
  return { items, ref: ref ?? null, via: items.length > 0 ? 'text' : null }
}
