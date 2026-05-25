import { Header } from '../../components/layout/Header'
import { Sidebar } from '../../components/layout/Sidebar'
import { PizarronBoard } from '../../components/almacen/PizarronBoard'

export function PizarronPage() {
  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden" style={{ background: 'var(--page-bg)' }}>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden touch-pan-y p-6">
          <PizarronBoard />
        </main>
      </div>
    </div>
  )
}
