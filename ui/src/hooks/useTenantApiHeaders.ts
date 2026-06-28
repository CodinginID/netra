import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTenantContext } from '@/hooks/useTenantContext'
import { setApiTenantContext } from '@/api/adminApi'

/**
 * Syncs the URL-based tenant context to the API layer.
 *
 * Must be rendered inside a route that may contain a tenant param.
 * When the tenant in the URL changes, this hook:
 *  1. Updates the shared tenant ref (so all API calls include X-Tenant-Id)
 *  2. Invalidates all react-query caches (so data refetches for the new tenant)
 */
export function useTenantApiHeaders() {
  const { tenantId } = useTenantContext()
  const qc = useQueryClient()

  useEffect(() => {
    setApiTenantContext(tenantId)
    // Invalidate all queries when tenant context changes so data refetches
    // under the new tenant scope.
    qc.invalidateQueries()
  }, [tenantId, qc])
}
