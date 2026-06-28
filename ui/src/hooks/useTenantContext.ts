import { useParams, useSearchParams } from 'react-router-dom'

/**
 * Unified hook for obtaining the active tenant context.
 *
 * In the hybrid design, tenant context lives in the URL — either as a
 * route param (`/admin/tenants/:tenantId/...`) or as a query string
 * (`?tenant=...`). This hook abstracts both so the rest of the app
 * does not need to know where the tenantId came from.
 *
 * Returns `{ tenantId: string | null }` — `null` means global/no-tenant view.
 */
export function useTenantContext(): { tenantId: string | null } {
  const routeTenantId = useParams<{ tenantId: string }>().tenantId ?? null
  const [searchParams] = useSearchParams()
  const queryTenantId = searchParams.get('tenant')

  return {
    tenantId: routeTenantId ?? queryTenantId ?? null,
  }
}
