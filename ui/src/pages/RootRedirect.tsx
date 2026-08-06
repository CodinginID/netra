import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { LandingPage } from '@/pages/landing/LandingPage'

export function RootRedirect() {
  const { isAuthenticated, role } = useAuthStore()

  if (isAuthenticated && role === 'super_admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  if (isAuthenticated && (role === 'tenant_admin' || role === 'supervisor')) {
    return <Navigate to="/tenant/attendance" replace />
  }

  // Anonymous visitors (or an unknown role) see the public landing page.
  return <LandingPage />
}
