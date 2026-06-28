import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import { TenantContextBanner } from '@/components/TenantContextBanner'
import { useTenantApiHeaders } from '@/hooks/useTenantApiHeaders'

/**
 * Dashboard layout for tenant-scoped pages under /admin/tenants/:tenantId/*
 *
 * Renders the context banner and ensures the API layer is synced to the
 * current tenant from the URL.
 *
 * The sidebar nav items are provided by the parent SuperAdminDashboard
 * which detects tenant context and adjusts accordingly.
 */
export function TenantScopedDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // Sync tenant from URL → API headers
  useTenantApiHeaders()

  if (!tenantId) return null

  const handleSwitch = (newTenantId: string) => {
    const newPath = location.pathname.replace(`/tenants/${tenantId}`, `/tenants/${newTenantId}`)
    navigate(newPath, { replace: false })
  }

  return (
    <>
      <TenantContextBanner tenantId={tenantId} onSwitch={handleSwitch} />
      <Outlet />
    </>
  )
}
