import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { TenantContextBanner } from '@/components/TenantContextBanner'

/**
 * Layout wrapper for tenant-scoped pages under /admin/tenants/:tenantId/*
 *
 * Renders the context banner above the page content. The tenant reaches the API
 * through each query's own scope (`useTenantScope`), not through this layout.
 */
export function TenantContextLayout() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()

  if (!tenantId) return null

  const handleSwitch = (newTenantId: string) => {
    // Replace the tenant param in the URL — same route structure, different tenant
    const currentPath = window.location.pathname
    const newPath = currentPath.replace(`/tenants/${tenantId}`, `/tenants/${newTenantId}`)
    navigate(newPath, { replace: false })
  }

  return (
    <>
      <TenantContextBanner tenantId={tenantId} onSwitch={handleSwitch} />
      <Outlet />
    </>
  )
}
