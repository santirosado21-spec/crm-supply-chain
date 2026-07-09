import type { ProformaLineaPreview, ProformaSeccion, Moneda } from '../../../lib/proformaBuilder'

const SECCION_LABEL: Record<ProformaSeccion, string> = {
  wms: 'Almacén (WMS · Extensiv)',
  flete: 'Flete propio',
  paqueteria: 'Paquetería',
}

const SECCION_COLOR: Record<ProformaSeccion, string> = {
  wms: '#1e3a5f',
  flete: '#28a745',
  paqueteria: '#7c3aed',
}

const fmt = (n: number, moneda: Moneda) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${moneda}`

interface Props {
  lineas:        ProformaLineaPreview[]
  moneda:        Moneda
  /** Si true, muestra checkbox para incluir/excluir cada línea. */
  editable?:     boolean
  onToggleLinea?: (linea: ProformaLineaPreview) => void
}

export function ProformaLineasTable({ lineas, moneda, editable, onToggleLinea }: Props) {
  const secciones = (['wms', 'flete', 'paqueteria'] as ProformaSeccion[])
    .map(seccion => ({ seccion, lineas: lineas.filter(l => l.seccion === seccion) }))
    .filter(s => s.lineas.length > 0)

  if (secciones.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-10 text-center text-sm text-gray-400">
        Sin movimientos para este cliente en el periodo elegido.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {secciones.map(({ seccion, lineas: lineasSeccion }) => {
        const subtotal = lineasSeccion.filter(l => l.incluida).reduce((s, l) => s + l.monto, 0)
        return (
          <div key={seccion} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: SECCION_COLOR[seccion] }}>
              <span className="text-xs font-bold uppercase tracking-wider text-white">{SECCION_LABEL[seccion]}</span>
              <span className="text-xs font-bold text-white">{fmt(subtotal, moneda)}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-[11px] font-semibold text-gray-500 uppercase">
                  {editable && <th className="px-3 py-2 w-8"></th>}
                  <th className="px-3 py-2">Concepto</th>
                  <th className="px-3 py-2">Referencia</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {lineasSeccion.map((l, i) => (
                  <tr
                    key={`${seccion}-${i}`}
                    className={`border-b border-gray-50 last:border-0 ${l.incluida ? '' : 'opacity-40'}`}
                  >
                    {editable && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={l.incluida}
                          onChange={() => onToggleLinea?.(l)}
                          className="rounded border-gray-300"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-gray-800">
                      {l.concepto}
                      {!l.incluida && l.motivoExclusion && (
                        <span className="block text-[10px] text-amber-600">{l.motivoExclusion}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-gray-500">{l.referencia || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{l.cantidad}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">{fmt(l.monto, l.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
