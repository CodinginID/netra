import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { OnboardingTooltips } from '@/components/OnboardingTooltips'
import { ProtectedRoute } from '@/router/ProtectedRoute'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RootRedirect } from '@/pages/RootRedirect'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { useWebSocketInvalidation } from '@/hooks/useWebSocketInvalidation'

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
import { DailyStatusPage } from '@/pages/tenant-admin/DailyStatusPage'
import { IntegrationPage } from '@/pages/tenant-admin/IntegrationPage'
import { TrashPage } from '@/pages/tenant-admin/TrashPage'

// Kiosk (public — device token auth)
import { KioskPage } from '@/pages/kiosk/KioskPage'

// Super Admin
import {
  SuperAdminDashboard,
  SuperAdminIndex,
  SuperAdminHomePage,
} from '@/pages/super-admin/SuperAdminDashboard'
import { TenantsPage } from '@/pages/super-admin/TenantsPage'
import { SettingsPage } from '@/pages/super-admin/SettingsPage'
import { TenantScopedDashboard } from '@/components/TenantScopedDashboard'

// Tenant Admin dashboard home
import { TenantAdminHomePage } from '@/pages/tenant-admin/TenantAdminDashboard'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

function AppRoutes() {
  // Must run inside QueryClientProvider — it calls useQueryClient().
  useWebSocketInvalidation()

  return (
    <ToastProvider>
      <KeyboardShortcuts />
      <OnboardingTooltips />
      <BrowserRouter>
        <Routes>
        {/* Public */}
        <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
        <Route path="/403" element={<ErrorBoundary><ForbiddenPage /></ErrorBoundary>} />
        <Route path="/attendance" element={<ErrorBoundary><KioskPage /></ErrorBoundary>} />

        {/* Root redirect */}
        <Route path="/" element={<ErrorBoundary><RootRedirect /></ErrorBoundary>} />

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
          <Route path="dashboard" element={<ErrorBoundary><TenantAdminHomePage /></ErrorBoundary>} />
          <Route path="users" element={<ErrorBoundary><UsersPage /></ErrorBoundary>} />
          <Route path="enrollment" element={<ErrorBoundary><EnrollmentPage /></ErrorBoundary>} />
          <Route path="devices" element={<ErrorBoundary><DevicesPage /></ErrorBoundary>} />
          <Route path="schedules" element={<ErrorBoundary><SchedulesPage /></ErrorBoundary>} />
          <Route path="attendance" element={<ErrorBoundary><AttendancePage /></ErrorBoundary>} />
          <Route path="status" element={<ErrorBoundary><DailyStatusPage /></ErrorBoundary>} />
          <Route path="integration" element={<ErrorBoundary><IntegrationPage /></ErrorBoundary>} />
          <Route path="trash" element={<ErrorBoundary><TrashPage /></ErrorBoundary>} />
        </Route>

        {/* Super Admin routes — tenant pages also rendered inside SuperAdminDashboard layout */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['super_admin']}>
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        >
          <Route index element={<SuperAdminIndex />} />
          <Route path="dashboard" element={<ErrorBoundary><SuperAdminHomePage /></ErrorBoundary>} />
          <Route path="tenants" element={<ErrorBoundary><TenantsPage /></ErrorBoundary>} />
          <Route path="trash" element={<ErrorBoundary><TrashPage /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />

          {/* Tenant-scoped routes — context-switched view for a specific tenant */}
          <Route path="tenants/:tenantId" element={<ErrorBoundary><TenantScopedDashboard /></ErrorBoundary>}>
            <Route index element={<ErrorBoundary><SuperAdminHomePage /></ErrorBoundary>} />
            <Route path="users" element={<ErrorBoundary><UsersPage /></ErrorBoundary>} />
            <Route path="enrollment" element={<ErrorBoundary><EnrollmentPage /></ErrorBoundary>} />
            <Route path="devices" element={<ErrorBoundary><DevicesPage /></ErrorBoundary>} />
            <Route path="schedules" element={<ErrorBoundary><SchedulesPage /></ErrorBoundary>} />
            <Route path="attendance" element={<ErrorBoundary><AttendancePage /></ErrorBoundary>} />
            <Route path="status" element={<ErrorBoundary><DailyStatusPage /></ErrorBoundary>} />
            <Route path="integration" element={<ErrorBoundary><IntegrationPage /></ErrorBoundary>} />
            <Route path="trash" element={<ErrorBoundary><TrashPage /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={<ErrorBoundary><NotFoundPage /></ErrorBoundary>} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  )
}
