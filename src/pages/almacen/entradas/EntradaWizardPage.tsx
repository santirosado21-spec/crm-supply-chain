import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, Check, Loader2, Plus, History,
} from 'lucide-react'
import { Header } from '../../../components/layout/Header'
import { Sidebar } from '../../../components/layout/Sidebar'
import { useToast } from '../../../hooks/useToast'
import { EntradaWizardProvider, useEntradaWizard } from '../../../context/EntradaWizardContext'
import { Step1Validador } from './steps/Step1Validador'
import { CloseTaskModal } from '../../../components/tasks/CloseTaskModal'
// Paso 2 (Generar receipt) y Paso 3 (Verificar inventario) se desactivaron
// temporalmente — el wizard solo usa el Paso 1 por ahora. El código de esos
// pasos (WizardStepper, Step2Facilitador, Step3Validacion) se conserva sin
// usar por si se re-habilita el flujo completo más adelante.

function WizardInner() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()
  const {
    state, error, saving, lastSavedAt,
    finishAfterStep1, resetWizard, resumeFromEntry,
  } = useEntradaWizard()
  const { step1Complete, flowStatus, originalItems } = state
  const [finishing, setFinishing] = useState(false)
  const [finishBusy, setFinishBusy] = useState(false)

  // Override de PRUEBA: permite finalizar sin que todos los SKUs estén dados
  // de alta, cuando ya hay una nota cargada. Solo para pruebas; en producción se valida.
  const showStep1Override = !step1Complete && originalItems.length > 0

  // Resume / clean — solo una vez al montar.
  const inited = useRef(false)
  useEffect(() => {
    if (inited.current) return
    inited.current = true
    if (id) void resumeFromEntry(id)
    else resetWizard()
  }, [id, resumeFromEntry, resetWizard])

  // Al crear la entrada, fija la URL con su id para que un refresh pueda reanudar.
  useEffect(() => {
    if (state.entryId && !id) navigate(`/almacen/entradas/${state.entryId}`, { replace: true })
  }, [state.entryId, id, navigate])

  const confirmFinish = async (evidenceUrl: string) => {
    setFinishBusy(true)
    try {
      await finishAfterStep1(evidenceUrl)
      toast.success('Entrada completada', 'La entrada quedó registrada en el historial.')
      navigate('/almacen/entradas/historial')
    } catch (e: unknown) {
      toast.error('No se pudo finalizar', e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setFinishBusy(false)
    }
  }

  const handleNew = () => {
    resetWizard()
    inited.current = true
    navigate('/almacen/entradas')
  }

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-10 touch-pan-y">
          <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-[#1e3a5f]">Entradas — Validar alta</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Un cliente, una nota: valida que todos los SKUs estén dados de alta y que los totales cuadren.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                {saving ? (
                  <><Loader2 size={11} className="animate-spin" /> Guardando…</>
                ) : lastSavedAt ? (
                  <><Check size={11} className="text-green-500" /> Guardado {lastSavedAt.toLocaleTimeString()}</>
                ) : null}
              </span>
              <button
                onClick={() => navigate('/almacen/entradas/historial')}
                className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
              >
                <History size={14} /> Historial
              </button>
              <button
                onClick={handleNew}
                className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
              >
                <Plus size={14} /> Nueva entrada
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          <Step1Validador />

          {/* Footer: solo Finalizar — Pasos 2 y 3 desactivados por ahora. */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-gray-100 flex-wrap">
            {!step1Complete && (
              <span className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Todos los SKUs deben estar dados de alta para continuar.
              </span>
            )}
            {showStep1Override && (
              <button
                onClick={() => setFinishing(true)}
                title="Solo para pruebas: finaliza sin que todos los SKUs estén dados de alta"
                className="h-10 px-4 rounded-lg border border-dashed border-amber-400 bg-amber-50 text-sm font-medium text-amber-700 flex items-center gap-2 hover:bg-amber-100 transition-colors"
              >
                Finalizar sin validar (prueba)
              </button>
            )}
            <button
              onClick={() => setFinishing(true)}
              disabled={!step1Complete || flowStatus === 'completada'}
              className="h-10 px-6 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#16304d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check size={16} /> Finalizar entrada
            </button>
          </div>
        </main>
      </div>

      {finishing && (
        <CloseTaskModal
          title="Finalizar entrada"
          busy={finishBusy}
          onCancel={() => setFinishing(false)}
          onConfirm={confirmFinish}
        />
      )}
    </div>
  )
}

export function EntradaWizardPage() {
  return (
    <EntradaWizardProvider>
      <WizardInner />
    </EntradaWizardProvider>
  )
}
