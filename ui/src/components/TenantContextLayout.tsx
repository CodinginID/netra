import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { TenantContextBanner } from '@/components/TenantContextBanner'
import { useTenantApiHeaders } from '@/hooks/useTenantApiHeaders'

/**
 * Layout wrapper for tenant-scoped pages under /admin/tenants/:tenantId/*
 *
 * Renders the context banner above the page content and ensures the API
 * layer is synced to the current tenant from the URL.
 */
export function TenantContextLayout() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()

  // Sync tenant from URL → API headers
  useTenantApiHeaders()

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
