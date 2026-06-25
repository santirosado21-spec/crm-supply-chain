import { useState } from 'react'
import {
  Loader2, CheckCircle2, AlertTriangle, XCircle, Search, Download,
} from 'lucide-react'
import { useEntradaWizard } from '../../../../context/EntradaWizardContext'
import { downloadDiscrepancies } from '../../../../lib/entradaExports'

export function Step3Validacion() {
  const { state, verifyLoading, runStep3Verification, setAnomaly } = useEntradaWizard()
  const { step3Results, notaFileName, customerId } = state
  const [search, setSearch] = useState('')

  const stats = {
    total: step3Results.length,
    confirmed: step3Results.filter(r => r.status === 'confirmed').length,
    qtyDiff: step3Results.filter(r => r.status === 'qty_diff').length,
    notFound: step3Results.filter(r => r.status === 'not_found').length,
  }
  const hasDiscrepancies = stats.qtyDiff + stats.notFound > 0
  const filtered = search
    ? step3Results.filter(r => r.sku.toLowerCase().includes(search.toLowerCase()))
    : step3Results

  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-bold text-[#1e3a5f]">Paso 3 — Verificar inventario</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Confirma que la nota original ya está reflejada en el inventario actual de Extensiv. Anota cualquier anomalía o inconsistencia por SKU.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <button
          onClick={runStep3Verification}
          disabled={verifyLoading || !customerId}
          className="h-10 px-6 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40"
        >
          {verifyLoading ? (
            <><Loader2 size={16} className="animate-spin" /> Verificando contra Extensiv...</>
          ) : (
            <><Search size={16} /> Verificar entrada</>
          )}
        </button>
        {hasDiscrepancies && (
          <button
            onClick={() => downloadDiscrepancies(step3Results, notaFileName || 'entrada')}
            className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors"
          >
            <Download size={16} /> Exportar discrepancias
          </button>
        )}
      </div>

      {step3Results.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4 sm:gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.total}</p>
              <p className="text-xs text-gray-400 mt-1">Líneas totales</p>
            </div>
            <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-green-600" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.confirmed}</p>
              <p className="text-xs text-gray-400 mt-1">Confirmadas</p>
            </div>
            <div className="bg-white rounded-xl border border-yellow-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-yellow-600" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.qtyDiff}</p>
              <p className="text-xs text-gray-400 mt-1">Diferencia de cantidad</p>
            </div>
            <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-red-600" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.notFound}</p>
              <p className="text-xs text-gray-400 mt-1">No encontradas</p>
            </div>
          </div>

          {!hasDiscrepancies && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              Entrada validada — todo coincide con el inventario actual en Extensiv.
            </div>
          )}

          <div className="mb-3">
            <div className="relative w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar SKU..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 w-full"
              />
            </div>
          </div>

          <div className="max-w-full overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="min-w-[820px] w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">SKU</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Qty Documento</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Qty Extensiv (onHand)</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Anomalía / Nota</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.sku} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{r.sku}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.qtyDoc.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${
                      r.status === 'confirmed' ? 'text-green-600' : r.status === 'qty_diff' ? 'text-yellow-600' : 'text-red-500'
                    }`}>
                      {r.qtyExt === null ? '—' : r.qtyExt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'confirmed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 text-green-700 text-[11px] font-semibold">
                          <CheckCircle2 size={12} /> Confirmado
                        </span>
                      ) : r.status === 'qty_diff' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-50 text-yellow-700 text-[11px] font-semibold">
                          <AlertTriangle size={12} /> Diferencia
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-600 text-[11px] font-semibold">
                          <XCircle size={12} /> No encontrado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={r.anomaly}
                        onChange={e => setAnomaly(r.sku, e.target.value)}
                        placeholder="Anota una inconsistencia…"
                        className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none text-xs text-gray-700"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
