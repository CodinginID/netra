import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { Role } from '@/types/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
  roles?: Role[]
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { isAuthenticated, role } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && roles.length > 0 && role && !roles.includes(role)) {
    return <Navigate to="/403" replace />
  }

  return <>{children}</>
}
