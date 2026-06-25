import { useState } from 'react'
import {
  Loader2, Database, CheckCircle2, XCircle, AlertTriangle, Search, Download, Sparkles,
} from 'lucide-react'
import { useEntradaWizard } from '../../../../context/EntradaWizardContext'
import { ClienteExtensivSelector } from '../components/ClienteExtensivSelector'
import { NotaDropzone } from '../components/NotaDropzone'
import { downloadUnregistered } from '../../../../lib/entradaExports'

export function Step1Validador() {
  const {
    state, catalogCount, catalogLoading, extracting, unregisteredCount,
    extractedTotalQty, totalMismatch,
    setCustomer, setNotaFile, clearNota, runStep1Validation,
  } = useEntradaWizard()
  const [search, setSearch] = useState('')

  const { customerId, notaFileName, originalItems, step1Results, step1Complete, extractedVia, documentTotalQty } = state

  const stats = {
    total: step1Results.length,
    registered: step1Results.filter(r => r.registered).length,
    unregistered: unregisteredCount,
  }
  const filtered = search
    ? step1Results.filter(r => r.sku.toLowerCase().includes(search.toLowerCase()))
    : step1Results

  const canValidate = !!customerId && originalItems.length > 0 && !catalogLoading && !extracting

  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-bold text-[#1e3a5f]">Paso 1 — Validar alta de SKUs</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Escoge el cliente y sube la nota de entrada. El sistema verifica que todos los SKUs ya estén dados de alta en Extensiv.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <ClienteExtensivSelector
          value={customerId}
          onChange={setCustomer}
          statusSlot={
            <>
              {catalogLoading && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 size={14} className="animate-spin" /> Obteniendo catálogo de Extensiv...
                </div>
              )}
              {!catalogLoading && catalogCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Database size={14} /> {catalogCount.toLocaleString()} SKUs en el catálogo de Extensiv
                </div>
              )}
            </>
          }
        />

        <NotaDropzone
          fileName={notaFileName}
          onFile={setNotaFile}
          onClear={clearNota}
          disabled={!customerId}
          hint={customerId ? 'Arrastra o haz clic para subir la nota' : 'Primero selecciona un cliente'}
        />
      </div>

      {extracting && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#1e3a5f]">
          <Sparkles size={16} className="animate-pulse" /> Analizando la nota… esto puede tardar unos segundos.
        </div>
      )}

      {/* Auto-verificación por totales: la suma extraída debe coincidir con el total del documento */}
      {!extracting && originalItems.length > 0 && documentTotalQty != null && (
        totalMismatch ? (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            La suma de cantidades extraídas ({extractedTotalQty.toLocaleString()}) no coincide con el total del documento ({documentTotalQty.toLocaleString()}). Revisa que no falten ni sobren líneas antes de continuar.
          </div>
        ) : (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            Totales cuadran: {extractedTotalQty.toLocaleString()} unidades extraídas = total del documento.
          </div>
        )
      )}

      <div className="flex flex-wrap gap-3 mb-5">
        <button
          onClick={runStep1Validation}
          disabled={!canValidate}
          className="h-10 px-6 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40"
        >
          <Search size={16} /> Validar códigos
        </button>
        {stats.unregistered > 0 && (
          <button
            onClick={() => downloadUnregistered(step1Results, notaFileName || 'nota_entrada')}
            className="h-10 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors"
          >
            <Download size={16} /> Exportar SKUs faltantes
          </button>
        )}
      </div>

      {step1Results.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4 sm:gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.total}</p>
              <p className="text-xs text-gray-400 mt-1">SKUs totales</p>
            </div>
            <div className="bg-white rounded-xl border border-green-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-green-600" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.registered}</p>
              <p className="text-xs text-gray-400 mt-1">Registrados</p>
            </div>
            <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-red-600" style={{ fontFamily: 'Nunito, sans-serif' }}>{stats.unregistered}</p>
              <p className="text-xs text-gray-400 mt-1">Por dar de alta</p>
            </div>
          </div>

          {step1Complete ? (
            <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              Todos los códigos están dados de alta en Extensiv. Puedes continuar al Paso 2.
            </div>
          ) : (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              {stats.unregistered} SKU{stats.unregistered === 1 ? '' : 's'} deben darse de alta en Extensiv antes de continuar al Paso 2.
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
            <table className="min-w-[560px] w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">SKU (Documento)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Cantidad</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Estado en Extensiv</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.sku} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{r.sku}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.qty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      {r.registered ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 text-green-700 text-[11px] font-semibold">
                          <CheckCircle2 size={12} /> Registrado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-600 text-[11px] font-semibold">
                          <XCircle size={12} /> Necesita darse de alta
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {extractedVia && (
            <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
              {extractedVia === 'vision'
                ? <><Sparkles size={10} /> Extraído con IA (visión)</>
                : 'Extraído con lector local'}
            </p>
          )}
        </>
      )}
    </>
  )
}
