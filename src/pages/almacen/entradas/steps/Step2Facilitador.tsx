import { useState } from 'react'
import {
  Download, XCircle, Plus, AlertTriangle, FileInput, CheckCircle2,
} from 'lucide-react'
import { useEntradaWizard } from '../../../../context/EntradaWizardContext'
import { generateReceiptExcel } from '../../receiptExport'

export function Step2Facilitador() {
  const {
    state, setRef, updateStep2Item, addStep2Item, deleteStep2Item, markExportGenerated,
  } = useEntradaWizard()
  const { ref, step2Items, extractedVia, exportGenerated, exportFileName } = state
  const [error, setError] = useState('')

  const canExport = !!ref.trim() && step2Items.length > 0

  const handleDownload = () => {
    const cleaned = step2Items
      .map(i => ({ sku: i.sku.trim().toUpperCase(), qty: Number(i.qty) || 0, serialNumber: i.serialNumber }))
      .filter(i => i.sku && i.qty > 0)
    if (cleaned.length === 0) {
      setError('No hay items válidos para exportar')
      return
    }
    setError('')
    const finalRef = ref.trim() || 'PT'
    generateReceiptExcel(finalRef, cleaned)
    const safeRef = finalRef.replace(/[^\w-]/g, '_')
    markExportGenerated(`Receipt_${safeRef}.xlsx`)
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-bold text-[#1e3a5f]">Paso 2 — Facilitador de entradas</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Revisa y corrige los items extraídos de la nota, luego genera el Receipt_Import.xlsx para subirlo a Extensiv.
        </p>
      </div>

      {step2Items.length === 0 ? (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          No hay items. Vuelve al Paso 1 y sube la nota de entrada.
        </div>
      ) : (
        <>
          {/* Ref */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
            <label className="text-xs font-semibold text-gray-600 mb-2 block">
              Ref # <span className="text-red-500">*</span>
              <span className="text-[10px] font-normal text-gray-400 ml-2">
                (detectado automáticamente — puedes corregirlo)
              </span>
            </label>
            <input
              type="text"
              value={ref}
              onChange={e => setRef(e.target.value)}
              placeholder="Ej: SO2554"
              className={`w-full max-w-xs h-10 px-3 rounded-lg border text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 ${
                ref.trim() ? 'border-green-300 bg-green-50/30' : 'border-amber-300 bg-amber-50/30'
              }`}
            />
            {!ref.trim() && (
              <p className="text-[10px] text-amber-700 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={10} /> Escribe el Ref# para poder exportar.
              </p>
            )}
          </div>

          {/* Tabla editable */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-600">Items extraídos ({step2Items.length})</p>
                {extractedVia === 'vision' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1e3a5f] bg-[#1e3a5f]/10 rounded-full px-2 py-0.5">
                    IA (visión)
                  </span>
                )}
                {extractedVia === 'text' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                    Lector local
                  </span>
                )}
              </div>
              <button onClick={addStep2Item} className="flex items-center gap-1 text-[11px] font-medium text-[#1e3a5f] hover:underline">
                <Plus size={12} /> Agregar línea
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">SKU</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider w-24">Cantidad</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 text-[11px] uppercase tracking-wider">Serial #</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {step2Items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/40">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={item.sku}
                        onChange={e => updateStep2Item(idx, 'sku', e.target.value)}
                        className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none font-mono text-xs font-semibold text-gray-800"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={item.qty}
                        onChange={e => updateStep2Item(idx, 'qty', Number(e.target.value))}
                        className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none text-right text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={item.serialNumber ?? ''}
                        onChange={e => updateStep2Item(idx, 'serialNumber', e.target.value || null)}
                        placeholder="(opcional)"
                        className="w-full h-8 px-2 rounded border border-transparent hover:border-gray-200 focus:border-[#1e3a5f] focus:outline-none font-mono text-xs text-gray-700"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => deleteStep2Item(idx)} className="text-gray-300 hover:text-red-500 p-1" title="Eliminar línea">
                        <XCircle size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3 items-center flex-wrap">
            <button
              onClick={handleDownload}
              disabled={!canExport}
              className="h-10 px-6 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={16} /> Generar Receipt_Import.xlsx
            </button>
            {!canExport && (
              <span className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {step2Items.length === 0 ? 'No hay items.' : 'Falta el Ref#.'}
              </span>
            )}
          </div>

          {exportGenerated && (
            <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>
                Generado <span className="font-mono font-semibold">{exportFileName}</span>. Súbelo a Extensiv (entrada física y virtual) y continúa al Paso 3 para verificar.
              </span>
            </div>
          )}

          <p className="text-[10px] text-gray-400 mt-3 flex items-center gap-1">
            <FileInput size={10} />
            El archivo se exporta listo para importar a Extensiv. Puedes corregir manualmente cualquier línea antes de exportar.
          </p>
        </>
      )}
    </>
  )
}
