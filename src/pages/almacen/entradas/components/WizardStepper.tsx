import { Check, Lock } from 'lucide-react'
import { useEntradaWizard } from '../../../../context/EntradaWizardContext'
import type { WizardStep } from '../../../../types/warehouseEntry'

const STEPS: { n: WizardStep; label: string }[] = [
  { n: 1, label: 'Validar alta' },
  { n: 2, label: 'Generar receipt' },
  { n: 3, label: 'Verificar inventario' },
]

export function WizardStepper() {
  const { state, goToStep } = useEntradaWizard()
  const { currentStep, step1Complete, exportGenerated } = state

  const isReachable = (n: WizardStep): boolean => {
    if (n === 1) return true
    if (n === 2) return step1Complete
    return step1Complete && exportGenerated
  }
  const isDone = (n: WizardStep): boolean => {
    if (n === 1) return step1Complete && currentStep > 1
    if (n === 2) return exportGenerated && currentStep > 2
    return state.flowStatus === 'completada'
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
      <div className="flex items-center">
        {STEPS.map((s, idx) => {
          const active = currentStep === s.n
          const done = isDone(s.n)
          const reachable = isReachable(s.n)
          const clickable = reachable && !active
          return (
            <div key={s.n} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && goToStep(s.n)}
                className={`flex items-center gap-2.5 ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                    done || active ? 'text-white' : reachable ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-400'
                  }`}
                  style={done || active ? { background: 'var(--brand-navy)' } : undefined}
                >
                  {done ? <Check size={16} /> : !reachable ? <Lock size={13} /> : s.n}
                </span>
                <div className="hidden sm:block text-left">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 leading-none">Paso {s.n}</p>
                  <p className={`text-sm leading-tight ${active ? 'font-bold text-[#1e3a5f]' : reachable ? 'font-medium text-gray-600' : 'text-gray-400'}`}>
                    {s.label}
                  </p>
                </div>
              </button>
              {idx < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-3 rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: currentStep > s.n ? '100%' : '0%', background: 'var(--brand-navy)' }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
