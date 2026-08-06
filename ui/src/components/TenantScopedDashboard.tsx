import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import { TenantContextBanner } from '@/components/TenantContextBanner'

/**
 * Dashboard layout for tenant-scoped pages under /admin/tenants/:tenantId/*
 *
 * Renders the context banner. It deliberately does NOT push the tenant into the
 * API layer: each query and mutation reads the tenant from the URL itself (see
 * `useTenantScope`) and pins its own request. Syncing it from an effect here
 * used to race the child pages' requests, which fired first and were answered
 * under the previous tenant's scope.
 *
 * The sidebar nav items are provided by the parent SuperAdminDashboard
 * which detects tenant context and adjusts accordingly.
 */
export function TenantScopedDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

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
