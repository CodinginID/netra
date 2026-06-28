import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function RootRedirect() {
  const { isAuthenticated, role } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (role === 'super_admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  if (role === 'tenant_admin' || role === 'supervisor') {
    return <Navigate to="/tenant/attendance" replace />
  }

  return <Navigate to="/login" replace />
}
