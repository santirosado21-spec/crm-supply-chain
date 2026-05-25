// SLA de entrega — reglas de cumplimiento del TMS de paquetería.
//
//   OnTimeDelivery   = actual_delivery_date <= promised_delivery_date
//   OnTimeInduction  = induction_date <= created_at + 1 día
//   Delayed          = actual_delivery_date > promised_delivery_date
//   Returned         = tracking_status === 'devuelto'
//
// Funciones puras, sin dependencias de React ni de Supabase — testeables.

/** Parte YYYY-MM-DD de una fecha o timestamp ISO. Normalizar a fecha-sin-hora
 *  antes de comparar evita falsos "retrasado": comparar una fecha (medianoche
 *  UTC) contra un timestamp con hora/zona da resultados incorrectos. */
function dateOnly(s: string): string {
  return s.slice(0, 10)
}

/** Suma días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface SLAInput {
  promised_delivery_date?: string | null
  actual_delivery_date?:   string | null
  induction_date?:         string | null
  created_at?:             string | null
  tracking_status?:        string | null
}

export interface SLAResult {
  hasDelivery:     boolean
  onTime:          boolean
  delayed:         boolean
  hasInduction:    boolean
  onTimeInduction: boolean
  returned:        boolean
  inTransit:       boolean
  exception:       boolean
}

/** Evalúa todas las dimensiones de SLA de una guía. */
export function evaluateSLA(g: SLAInput): SLAResult {
  const promised  = g.promised_delivery_date
  const actual    = g.actual_delivery_date
  const induction = g.induction_date

  const hasDelivery = !!(promised && actual)
  // Comparación lexicográfica de YYYY-MM-DD — correcta para fechas ISO.
  const onTime  = hasDelivery && dateOnly(actual!) <= dateOnly(promised!)
  const delayed = hasDelivery && dateOnly(actual!) >  dateOnly(promised!)

  const hasInduction = !!(induction && g.created_at)
  const onTimeInduction = hasInduction &&
    dateOnly(induction!) <= addDays(dateOnly(g.created_at!), 1)

  return {
    hasDelivery, onTime, delayed, hasInduction, onTimeInduction,
    returned:  g.tracking_status === 'devuelto',
    inTransit: g.tracking_status === 'en_transito',
    exception: g.tracking_status === 'excepcion',
  }
}

/** Porcentaje entero seguro (0 si el denominador es 0). */
export function slaPct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}
