import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/router/ProtectedRoute'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RootRedirect } from '@/pages/RootRedirect'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'

// Tenant Admin
import {
  TenantAdminDashboard,
  TenantAdminIndex,
} from '@/pages/tenant-admin/TenantAdminDashboard'
import { UsersPage } from '@/pages/tenant-admin/UsersPage'
import { EnrollmentPage } from '@/pages/tenant-admin/EnrollmentPage'
import { DevicesPage } from '@/pages/tenant-admin/DevicesPage'
import { SchedulesPage } from '@/pages/tenant-admin/SchedulesPage'
import { AttendancePage } from '@/pages/tenant-admin/AttendancePage'

// Kiosk (public — device token auth)
import { KioskPage } from '@/pages/kiosk/KioskPage'

// Super Admin
import {
  SuperAdminDashboard,
  SuperAdminIndex,
} from '@/pages/super-admin/SuperAdminDashboard'
import { TenantsPage } from '@/pages/super-admin/TenantsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/kiosk" element={<KioskPage />} />

        {/* Root redirect */}
        <Route path="/" element={<RootRedirect />} />

        {/* Tenant Admin routes */}
        <Route
          path="/tenant"
          element={
            <ProtectedRoute roles={['tenant_admin', 'supervisor']}>
              <TenantAdminDashboard />
            </ProtectedRoute>
          }
        >
          <Route index element={<TenantAdminIndex />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="enrollment" element={<EnrollmentPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="schedules" element={<SchedulesPage />} />
          <Route path="attendance" element={<AttendancePage />} />
        </Route>

        {/* Super Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['super_admin']}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        >
          <Route index element={<SuperAdminIndex />} />
          <Route path="tenants" element={<TenantsPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
