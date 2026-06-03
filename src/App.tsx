import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { SidebarProvider } from './context/SidebarContext'
import { ToastProvider } from './hooks/useToast'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { Login } from './pages/auth/Login'
import { HomePage } from './pages/home/HomePage'
import { WMSHome } from './pages/wms/WMSHome'
import { StorageBridgePage } from './pages/wms/StorageBridgePage'
import { EmisorConfigPage } from './pages/wms/EmisorConfigPage'
import { AlmacenPage } from './pages/almacen/AlmacenPage'
import { AlmacenHome } from './pages/almacen/AlmacenHome'
import { HoyPage } from './pages/almacen/HoyPage'
import { LaborStandardsPage } from './pages/almacen/LaborStandardsPage'
import { DistributionInboxPage } from './pages/almacen/DistributionInboxPage'
import { PizarronPage } from './pages/almacen/PizarronPage'
import { PizarronKioskPage } from './pages/almacen/PizarronKioskPage'
import { PizarronAdminPage } from './pages/almacen/PizarronAdminPage'
import { DiaPage } from './pages/almacen/DiaPage'
import { TMSHome } from './pages/tms/TMSHome'
import { TMSDashboard } from './pages/tms/TMSDashboard'
import { VehiculosPage } from './pages/tms/VehiculosPage'
import { OperadoresPage } from './pages/tms/OperadoresPage'
import { ViajesPage } from './pages/tms/ViajesPage'
import { CostosTransportePage } from './pages/tms/CostosTransportePage'
import { CotizadorPage } from './pages/cotizador/CotizadorPage'
import { TramitesPage } from './pages/tramites/TramitesPage'
import { ClientsList } from './pages/clients/ClientsList'
import { ClientDetail } from './pages/clients/ClientDetail'
import { RCPage } from './pages/billing/RCPage'
import { TarifariosPage } from './pages/tarifarios/TarifariosPage'
import { ServiciosPage } from './pages/servicios/ServiciosPage'
import { ValidadorSKUPage } from './pages/sac/ValidadorSKUPage'
import { ReceiptGeneratorPage } from './pages/almacen/ReceiptGeneratorPage'
import { TaskInbox } from './pages/tasks/TaskInbox'
import { TaskCalendar } from './pages/tasks/TaskCalendar'
import { TaskCreate } from './pages/tasks/TaskCreate'
import { TaskDetail } from './pages/tasks/TaskDetail'
import { TaskTemplates } from './pages/tasks/TaskTemplates'
import { ExecutiveCalendarPage } from './pages/tasks/ExecutiveCalendarPage'
import { TeamSettings } from './pages/tasks/admin/TeamSettings'
import { Reports } from './pages/tasks/admin/Reports'
import { AuditLog } from './pages/tasks/admin/AuditLog'
import { ExecutiveReportPage } from './pages/admin/ExecutiveReportPage'
import { WelcomeTour } from './components/features/WelcomeTour'
import { ALMACEN_ROLES, CALENDARIO_ROLES, EJECUTIVO_ROLES, TMS_ROLES, WMS_ROLES } from './config/permissions'

// Preserva el :id en el redirect compat /tasks/:id → /calendario/:id
function RedirectTaskToCalendario() {
  const { id } = useParams()
  return <Navigate to={id ? `/calendario/${id}` : '/calendario'} replace />
}

function App() {
  return (
    <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
      <SidebarProvider>
        <WelcomeTour />
        <Routes>
          <Route path="/" element={
            <ProtectedRoute><HomePage /></ProtectedRoute>
          } />
          <Route path="/login" element={<Login />} />

          {/* WMS */}
          <Route path="/wms" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><WMSHome /></ProtectedRoute>
          } />
          <Route path="/wms/storage-bridge" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><StorageBridgePage /></ProtectedRoute>
          } />
          <Route path="/wms/emisor-config" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><EmisorConfigPage /></ProtectedRoute>
          } />
          {/* Receipt Import vive ahora en el módulo Almacén; compat redirect */}
          <Route path="/wms/receipt-generator" element={<Navigate to="/almacen/receipt-generator" replace />} />
          {/* Compat: /wms/cedis ya no se expone desde WMS — el Mapa de almacén
              vive solo en /almacen/cedis. Redirige a home para no romper
              bookmarks viejos (los usuarios sin acceso a almacén ven home). */}
          <Route path="/wms/cedis" element={<Navigate to="/" replace />} />

          {/* Almacén — módulo exclusivo de admin + almacén */}
          <Route path="/almacen" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><AlmacenHome /></ProtectedRoute>
          } />
          <Route path="/almacen/hoy" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><HoyPage /></ProtectedRoute>
          } />
          <Route path="/almacen/dia" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><DiaPage /></ProtectedRoute>
          } />
          <Route path="/almacen/distribucion" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><DistributionInboxPage /></ProtectedRoute>
          } />
          <Route path="/almacen/pizarron" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><PizarronPage /></ProtectedRoute>
          } />
          {/* Kiosk: sin ProtectedRoute — pantalla compartida en LAN del CEDIS */}
          <Route path="/almacen/pizarron-kiosk" element={<PizarronKioskPage />} />
          <Route path="/almacen/pizarron-admin" element={
            <ProtectedRoute allowedRoles={['admin', 'almacen']}><PizarronAdminPage /></ProtectedRoute>
          } />
          <Route path="/almacen/estandares" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><LaborStandardsPage /></ProtectedRoute>
          } />
          {/* Herramientas dentro del módulo Almacén — mismas páginas que /wms/*,
              gated por ALMACEN_ROLES. El rol almacén solo entra por estas rutas
              porque no tiene acceso a /wms/*. */}
          <Route path="/almacen/cedis" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><AlmacenPage /></ProtectedRoute>
          } />
          <Route path="/almacen/receipt-generator" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><ReceiptGeneratorPage /></ProtectedRoute>
          } />
          {/* Compat redirect viejo */}
          <Route path="/almacen-layout" element={<Navigate to="/almacen/cedis" replace />} />

          {/* TMS */}
          <Route path="/tms" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><TMSHome /></ProtectedRoute>
          } />
          <Route path="/tms/dashboard" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><TMSDashboard /></ProtectedRoute>
          } />
          <Route path="/tms/vehiculos" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><VehiculosPage /></ProtectedRoute>
          } />
          <Route path="/tms/operadores" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><OperadoresPage /></ProtectedRoute>
          } />
          <Route path="/tms/viajes" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><ViajesPage /></ProtectedRoute>
          } />
          <Route path="/tms/costos" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><CostosTransportePage /></ProtectedRoute>
          } />
          <Route path="/cotizador" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><CotizadorPage /></ProtectedRoute>
          } />
          <Route path="/tramites" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><TramitesPage /></ProtectedRoute>
          } />

          {/* Clientes */}
          <Route path="/clients" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><ClientsList /></ProtectedRoute>
          } />
          <Route path="/clients/:id" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><ClientDetail /></ProtectedRoute>
          } />

          {/* WMS Billing */}
          <Route path="/rc" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><RCPage /></ProtectedRoute>
          } />
          <Route path="/tarifarios" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><TarifariosPage /></ProtectedRoute>
          } />
          <Route path="/servicios" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><ServiciosPage /></ProtectedRoute>
          } />
          <Route path="/sac/validador" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><ValidadorSKUPage /></ProtectedRoute>
          } />
          {/* Compat redirect: ruta vieja /sac/receipt-generator → módulo Almacén */}
          <Route path="/sac/receipt-generator" element={<Navigate to="/almacen/receipt-generator" replace />} />
          {/* Calendario (cross-team) — antes Task Tracker, ahora expuesto desde WMS / TMS */}
          <Route path="/calendario" element={
            <ProtectedRoute allowedRoles={CALENDARIO_ROLES}><TaskInbox /></ProtectedRoute>
          } />
          <Route path="/calendario/semana" element={
            <ProtectedRoute allowedRoles={CALENDARIO_ROLES}><TaskCalendar /></ProtectedRoute>
          } />
          <Route path="/calendario/nueva" element={
            <ProtectedRoute allowedRoles={CALENDARIO_ROLES}><TaskCreate /></ProtectedRoute>
          } />
          <Route path="/calendario/plantillas" element={
            <ProtectedRoute allowedRoles={CALENDARIO_ROLES}><TaskTemplates /></ProtectedRoute>
          } />
          <Route path="/calendario/ejecutivo" element={
            <ProtectedRoute allowedRoles={EJECUTIVO_ROLES}><ExecutiveCalendarPage /></ProtectedRoute>
          } />
          <Route path="/calendario/admin/equipo" element={
            <ProtectedRoute allowedRoles={['admin']}><TeamSettings /></ProtectedRoute>
          } />
          <Route path="/calendario/admin/reportes" element={
            <ProtectedRoute allowedRoles={['admin']}><Reports /></ProtectedRoute>
          } />
          <Route path="/calendario/admin/auditoria" element={
            <ProtectedRoute allowedRoles={['admin']}><AuditLog /></ProtectedRoute>
          } />
          <Route path="/calendario/:id" element={
            <ProtectedRoute><TaskDetail /></ProtectedRoute>
          } />

          {/* Compat redirects /tasks/* → /calendario/* */}
          <Route path="/tasks" element={<Navigate to="/calendario" replace />} />
          <Route path="/tasks/calendar" element={<Navigate to="/calendario/semana" replace />} />
          <Route path="/tasks/new" element={<Navigate to="/calendario/nueva" replace />} />
          <Route path="/tasks/templates" element={<Navigate to="/calendario/plantillas" replace />} />
          <Route path="/tasks/admin/team" element={<Navigate to="/calendario/admin/equipo" replace />} />
          <Route path="/tasks/admin/reports" element={<Navigate to="/calendario/admin/reportes" replace />} />
          <Route path="/tasks/admin/audit-log" element={<Navigate to="/calendario/admin/auditoria" replace />} />
          <Route path="/tasks/:id" element={<RedirectTaskToCalendario />} />

          <Route path="/admin/executive-report" element={
            <ProtectedRoute allowedRoles={['admin']}><ExecutiveReportPage /></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SidebarProvider>
      </BrowserRouter>
    </AuthProvider>
    </ToastProvider>
  )
}

export default App
