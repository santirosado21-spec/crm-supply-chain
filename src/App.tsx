import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import { DistributionInboxPage } from './pages/almacen/DistributionInboxPage'
import { PizarronPage } from './pages/almacen/PizarronPage'
import { PizarronKioskPage } from './pages/almacen/PizarronKioskPage'
import { PizarronAdminPage } from './pages/almacen/PizarronAdminPage'
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
import { CartaInstruccionPage } from './pages/sac/CartaInstruccionPage'
import { GuiasPaqueteriaPage } from './pages/tms/GuiasPaqueteriaPage'
import { CartaPortePage } from './pages/tms/CartaPortePage'
import { CartasRecibidasPage } from './pages/tms/CartasRecibidasPage'
import { CarriersConfigPage } from './pages/tms/CarriersConfigPage'
import { ShippingRulesPage } from './pages/tms/ShippingRulesPage'
import { ParcelTrackingMapPage } from './pages/tms/ParcelTrackingMapPage'
import { ParcelDashboardPage } from './pages/tms/ParcelDashboardPage'
import { ParcelOrdersPage } from './pages/tms/ParcelOrdersPage'
import { OrderTemplatesPage } from './pages/tms/OrderTemplatesPage'
import { ManifestsPage } from './pages/tms/ManifestsPage'
import { ShipmentProfilePage } from './pages/tms/ShipmentProfilePage'
import { DeliveryPerformancePage } from './pages/tms/DeliveryPerformancePage'
import { MarkupProfilesPage } from './pages/tms/MarkupProfilesPage'
import { AddressesPage } from './pages/tms/AddressesPage'
import { TaskInbox } from './pages/tasks/TaskInbox'
import { TaskCalendar } from './pages/tasks/TaskCalendar'
import { TaskCreate } from './pages/tasks/TaskCreate'
import { TaskDetail } from './pages/tasks/TaskDetail'
import { TaskTemplates } from './pages/tasks/TaskTemplates'
import { TeamSettings } from './pages/tasks/admin/TeamSettings'
import { Reports } from './pages/tasks/admin/Reports'
import { ExtensivBilling } from './pages/tasks/admin/ExtensivBilling'
import { AuditLog } from './pages/tasks/admin/AuditLog'
import { ExecutiveReportPage } from './pages/admin/ExecutiveReportPage'
import { WelcomeTour } from './components/features/WelcomeTour'
import { ALMACEN_ROLES, TASK_ROLES, TMS_ROLES, WMS_ROLES, PARCEL_ROLES } from './config/permissions'

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

          {/* Almacén */}
          <Route path="/almacen" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><AlmacenPage /></ProtectedRoute>
          } />
          <Route path="/almacen/receipt-generator" element={
            <ProtectedRoute allowedRoles={ALMACEN_ROLES}><ReceiptGeneratorPage /></ProtectedRoute>
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
          <Route path="/tms/carta-porte" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><CartaPortePage /></ProtectedRoute>
          } />
          <Route path="/tms/cartas-recibidas" element={
            <ProtectedRoute allowedRoles={TMS_ROLES}><CartasRecibidasPage /></ProtectedRoute>
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
          {/* Compat redirect: ruta vieja /sac/receipt-generator → /almacen */}
          <Route path="/sac/receipt-generator" element={<Navigate to="/almacen/receipt-generator" replace />} />
          <Route path="/sac/carta-instruccion" element={
            <ProtectedRoute allowedRoles={WMS_ROLES}><CartaInstruccionPage /></ProtectedRoute>
          } />
          <Route path="/tms/guias-paqueteria" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><GuiasPaqueteriaPage /></ProtectedRoute>
          } />
          <Route path="/tms/parcel-map" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><ParcelTrackingMapPage /></ProtectedRoute>
          } />
          <Route path="/tms/parcel-dashboard" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><ParcelDashboardPage /></ProtectedRoute>
          } />
          {/* TMS Paquetería · Techship replica */}
          <Route path="/tms/orders" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><ParcelOrdersPage /></ProtectedRoute>
          } />
          <Route path="/tms/orders/templates" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><OrderTemplatesPage /></ProtectedRoute>
          } />
          <Route path="/tms/manifests" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><ManifestsPage /></ProtectedRoute>
          } />
          <Route path="/tms/insights/shipment-profile" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><ShipmentProfilePage /></ProtectedRoute>
          } />
          <Route path="/tms/insights/delivery-performance" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><DeliveryPerformancePage /></ProtectedRoute>
          } />
          <Route path="/tms/addresses" element={
            <ProtectedRoute allowedRoles={PARCEL_ROLES}><AddressesPage /></ProtectedRoute>
          } />
          <Route path="/tms/markup-profiles" element={
            <ProtectedRoute allowedRoles={['admin']}><MarkupProfilesPage /></ProtectedRoute>
          } />
          <Route path="/tms/carriers" element={
            <ProtectedRoute allowedRoles={['admin']}><CarriersConfigPage /></ProtectedRoute>
          } />
          <Route path="/tms/carriers/reglas" element={
            <ProtectedRoute allowedRoles={['admin']}><ShippingRulesPage /></ProtectedRoute>
          } />
          {/* Compat redirect: la ruta vieja /sac/guias-paqueteria sigue funcionando
              mientras los bookmarks/links externos se actualizan. */}
          <Route path="/sac/guias-paqueteria" element={<Navigate to="/tms/guias-paqueteria" replace />} />
          {/* Task Tracker */}
          <Route path="/tasks" element={
            <ProtectedRoute allowedRoles={TASK_ROLES}><TaskInbox /></ProtectedRoute>
          } />
          <Route path="/tasks/calendar" element={
            <ProtectedRoute allowedRoles={TASK_ROLES}><TaskCalendar /></ProtectedRoute>
          } />
          <Route path="/tasks/new" element={
            <ProtectedRoute allowedRoles={TASK_ROLES}><TaskCreate /></ProtectedRoute>
          } />
          <Route path="/tasks/templates" element={
            <ProtectedRoute allowedRoles={TASK_ROLES}><TaskTemplates /></ProtectedRoute>
          } />
          <Route path="/tasks/admin/team" element={
            <ProtectedRoute allowedRoles={['admin']}><TeamSettings /></ProtectedRoute>
          } />
          <Route path="/tasks/admin/reports" element={
            <ProtectedRoute allowedRoles={['admin']}><Reports /></ProtectedRoute>
          } />
          <Route path="/tasks/admin/extensiv-billing" element={
            <ProtectedRoute allowedRoles={['admin', 'cobranza']}><ExtensivBilling /></ProtectedRoute>
          } />
          <Route path="/tasks/admin/audit-log" element={
            <ProtectedRoute allowedRoles={['admin']}><AuditLog /></ProtectedRoute>
          } />
          <Route path="/admin/executive-report" element={
            <ProtectedRoute allowedRoles={['admin']}><ExecutiveReportPage /></ProtectedRoute>
          } />
          <Route path="/tasks/:id" element={
            <ProtectedRoute><TaskDetail /></ProtectedRoute>
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
