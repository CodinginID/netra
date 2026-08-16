import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@/components/Toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { OnboardingTooltips } from '@/components/OnboardingTooltips'
import { ProtectedRoute } from '@/router/ProtectedRoute'
import { RouteFade } from '@/components/RouteFade'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RootRedirect } from '@/pages/RootRedirect'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { useWebSocketInvalidation } from '@/hooks/useWebSocketInvalidation'
import { useAuthStore } from '@/store/authStore'

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
import { TenantBillingPage } from '@/pages/tenant-admin/TenantBillingPage'

// Kiosk (public — device token auth)
import { KioskPage } from '@/pages/kiosk/KioskPage'

// Embed (public — one-time embed-token auth, rendered inside a client app)
import { EmbedEnrollPage } from '@/pages/embed/EmbedEnrollPage'

// Super Admin
import {
  SuperAdminDashboard,
  SuperAdminIndex,
  SuperAdminHomePage,
  TenantAdminHomePage,
} from '@/pages/super-admin/SuperAdminDashboard'
import { TenantsPage } from '@/pages/super-admin/TenantsPage'
import { SettingsPage } from '@/pages/super-admin/SettingsPage'
import { TenantScopedDashboard } from '@/components/TenantScopedDashboard'
import { PlansEditor } from '@/pages/super-admin/PlansEditor'
import { SubscriptionsPage } from '@/pages/super-admin/SubscriptionsPage'
import { InvoicesPage } from '@/pages/super-admin/InvoicesPage'
import { BillingSummaryPage } from '@/pages/super-admin/BillingSummaryPage'
import { UsagePage } from '@/pages/super-admin/UsagePage'
import { DemoRequestsPage } from '@/pages/super-admin/DemoRequestsPage'

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

// Wait for the persisted auth store to finish rehydrating AND for the
// silent refresh to complete before rendering routes.  Without this guard,
// the app would paint with an expired access token on a hard refresh, the
// first API call would get a 401, and the user would be redirected to
// `/login` even though they have a valid refresh token.
let appReadyPromise: Promise<void> | null = null

function useAppReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (appReadyPromise) {
      appReadyPromise.then(() => setReady(true))
      return
    }
    // An async Promise executor would swallow any throw in here, leaving the
    // promise forever pending and the app stuck on a blank screen. As an async
    // IIFE the failure surfaces, and the catch lets the app boot anyway.
    appReadyPromise = (async () => {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) return

      // Wait for the persisted store to finish rehydrating.
      await new Promise<void>((r) => {
        const unsub = useAuthStore.persist.onFinishHydration(() => {
          unsub()
          r()
        })
        // If already hydrated (no localStorage or already restored), resolve.
        if (useAuthStore.getState().refreshToken) r()
      })

      // Run silentRefresh and wait for it to COMPLETE before resolving.
      // This ensures the access token is fresh when routes render.
      await useAuthStore.getState().silentRefresh()
    })().catch((err) => {
      console.error('[netra] app bootstrap failed, continuing unauthenticated', err)
    })
    appReadyPromise.then(() => setReady(true))
  }, [])
  return ready
}

function AppShell() {
  const ready = useAppReady()
  if (!ready) return null // prevent flash of un-authenticated UI
  return <AppRoutes />
}

function AppRoutes() {
  // Must run inside QueryClientProvider — it calls useQueryClient().
  useWebSocketInvalidation()

  return (
    <ToastProvider>
      <KeyboardShortcuts />
      <OnboardingTooltips />
      <BrowserRouter>
        <RouteFade>
        <Routes>
        {/* Public */}
        <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
        <Route path="/403" element={<ErrorBoundary><ForbiddenPage /></ErrorBoundary>} />
        <Route path="/attendance" element={<ErrorBoundary><KioskPage /></ErrorBoundary>} />
        <Route path="/embed/enroll" element={<ErrorBoundary><EmbedEnrollPage /></ErrorBoundary>} />

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
          <Route path="billing" element={<ErrorBoundary><TenantBillingPage /></ErrorBoundary>} />
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

          {/* Billing routes — platform-level */}
          <Route path="billing" element={<ErrorBoundary><BillingSummaryPage /></ErrorBoundary>} />
          <Route path="billing/summary" element={<ErrorBoundary><BillingSummaryPage /></ErrorBoundary>} />
          <Route path="billing/plans" element={<ErrorBoundary><PlansEditor /></ErrorBoundary>} />
          <Route path="billing/subscriptions" element={<ErrorBoundary><SubscriptionsPage /></ErrorBoundary>} />
          <Route path="billing/invoices" element={<ErrorBoundary><InvoicesPage /></ErrorBoundary>} />
          <Route path="billing/usage" element={<ErrorBoundary><UsagePage /></ErrorBoundary>} />
          <Route path="demo-requests" element={<ErrorBoundary><DemoRequestsPage /></ErrorBoundary>} />

          {/* Tenant-scoped routes — context-switched view for a specific tenant */}
          <Route path="tenants/:tenantId" element={<ErrorBoundary><TenantScopedDashboard /></ErrorBoundary>}>
            <Route index element={<ErrorBoundary><TenantAdminHomePage /></ErrorBoundary>} />
            <Route path="users" element={<ErrorBoundary><UsersPage /></ErrorBoundary>} />
            <Route path="enrollment" element={<ErrorBoundary><EnrollmentPage /></ErrorBoundary>} />
            <Route path="devices" element={<ErrorBoundary><DevicesPage /></ErrorBoundary>} />
            <Route path="schedules" element={<ErrorBoundary><SchedulesPage /></ErrorBoundary>} />
            <Route path="attendance" element={<ErrorBoundary><AttendancePage /></ErrorBoundary>} />
            <Route path="status" element={<ErrorBoundary><DailyStatusPage /></ErrorBoundary>} />
            <Route path="integration" element={<ErrorBoundary><IntegrationPage /></ErrorBoundary>} />
            <Route path="billing" element={<ErrorBoundary><TenantBillingPage /></ErrorBoundary>} />
            <Route path="trash" element={<ErrorBoundary><TrashPage /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={<ErrorBoundary><NotFoundPage /></ErrorBoundary>} />
        </Routes>
        </RouteFade>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}
