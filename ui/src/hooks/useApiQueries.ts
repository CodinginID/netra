import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as api from '@/api/adminApi'
import { PLATFORM_TENANT_SCOPE, withTenantScope, type TenantScope } from '@/api/adminApi'
import { useTenantContext } from '@/hooks/useTenantContext'

// ---- Query Keys ----
// Param-based keys omit the trailing arg when no params are given, so a bare
// prefix (e.g. ['users']) used for invalidation correctly PREFIX-MATCHES every
// param variation (['users', {page,limit}]). Returning ['users', undefined]
// would NOT match ['users', {...}], so invalidation would silently miss and the
// UI would only update on a full reload.
//
// EVERY tenant-scoped key carries the scope. A key that omits it (as apiKeys,
// onboarding and trash once did) makes react-query serve the previous tenant's
// cached response after a tenant switch — the "Integration" and "Trash" menus
// showing another tenant's rows was exactly this.
export const queryKeys = {
  users: (params?: { page?: number; limit?: number; search?: string; tenantId?: TenantScope }) => {
    const key: unknown[] = ['users']
    if (params) key.push(params)
    return key as readonly unknown[]
  },
  devices: (params?: { page?: number; limit?: number; tenantId?: TenantScope }) => {
    const key: unknown[] = ['devices']
    if (params) key.push(params)
    return key as readonly unknown[]
  },
  schedules: (params?: { page?: number; limit?: number; tenantId?: TenantScope }) => {
    const key: unknown[] = ['schedules']
    if (params) key.push(params)
    return key as readonly unknown[]
  },
  attendance: (params?: { page?: number; limit?: number; from?: string; to?: string; user_id?: string; tenantId?: TenantScope }) => {
    const key: unknown[] = ['attendance']
    if (params) key.push(params)
    return key as readonly unknown[]
  },
  // Platform-level: the tenant list is never tenant-scoped.
  tenants: (params?: { page?: number; limit?: number; search?: string }) =>
    (params ? ['tenants', params] : ['tenants']) as readonly unknown[],
  trash: (type: 'users' | 'devices' | 'schedules' | 'tenants', tenantId?: TenantScope) =>
    (tenantId === undefined ? ['trash', type] : ['trash', type, { tenantId }]) as readonly unknown[],
  apiKeys: (tenantId?: TenantScope) =>
    (tenantId === undefined ? ['apiKeys'] : ['apiKeys', { tenantId }]) as readonly unknown[],
  apiKeyScopes: () => ['apiKeyScopes'] as readonly unknown[],
  onboarding: (tenantId?: TenantScope) =>
    (tenantId === undefined ? ['onboarding'] : ['onboarding', { tenantId }]) as readonly unknown[],
  dailyReport: (date: string, tenantId?: TenantScope) => ['dailyReport', date, { tenantId }] as readonly unknown[],
  dailyStatus: (date: string, tenantId?: TenantScope) => ['dailyStatus', date, { tenantId }] as readonly unknown[],
}

// ---- Tenant scope ----

/**
 * The tenant scope every tenant-scoped request must be pinned to.
 *
 * - A tenant in the URL (`/admin/tenants/:tenantId/...` or `?tenant=`) scopes to
 *   that tenant.
 * - A super admin with no tenant selected is on a platform-wide view, and says
 *   so explicitly via the `*` sentinel.
 * - Everyone else gets `null`: their tenant is fixed by their JWT and cannot be
 *   changed by a header.
 *
 * Read during render and passed into both the query key and the request, so the
 * two can never disagree — the previous design set a module global from an
 * effect that ran after the request had already gone out.
 */
export function useTenantScope(): TenantScope {
  const role = useAuthStore((s) => s.role)
  let urlTenantId: string | null = null
  try {
    urlTenantId = useTenantContext().tenantId
  } catch {
    urlTenantId = null // rendered outside a Router (tests, kiosk shells)
  }
  if (urlTenantId) return urlTenantId
  return role === 'super_admin' ? PLATFORM_TENANT_SCOPE : null
}

// ---- Query Hooks ----

export function useUsers(params?: { page?: number; limit?: number; search?: string }) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.users({ ...params, tenantId }),
    queryFn: () => withTenantScope(tenantId, () => api.listUsers(token!, params)),
    enabled: !!token,
  })
}

export function useDevices(params?: { page?: number; limit?: number }) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.devices({ ...params, tenantId }),
    queryFn: () => withTenantScope(tenantId, () => api.listDevices(token!, params)),
    enabled: !!token,
  })
}

export function useApiKeys() {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.apiKeys(tenantId),
    queryFn: () => withTenantScope(tenantId, () => api.listApiKeys(token!)),
    enabled: !!token,
  })
}

export function useApiKeyScopes() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.apiKeyScopes(),
    queryFn: () => api.listApiKeyScopes(token!),
    enabled: !!token,
  })
}

export function useSchedules(params?: { page?: number; limit?: number }) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.schedules({ ...params, tenantId }),
    queryFn: () => withTenantScope(tenantId, () => api.listSchedules(token!, params)),
    enabled: !!token,
  })
}

export function useAttendance(params?: { page?: number; limit?: number; from?: string; to?: string; user_id?: string }) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.attendance({ ...params, tenantId }),
    queryFn: () => withTenantScope(tenantId, () => api.listAttendance(token!, params)),
    enabled: !!token,
  })
}

export function useTenants(params?: { page?: number; limit?: number; search?: string }) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.tenants(params),
    queryFn: () => api.listTenants(token!, params),
    enabled: !!token,
  })
}

export function useDeletedUsers() {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.trash('users', tenantId),
    queryFn: () => withTenantScope(tenantId, () => api.listDeletedUsers(token!)),
    enabled: !!token,
    staleTime: 60_000, // trash changes rarely
  })
}

export function useDeletedDevices() {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.trash('devices', tenantId),
    queryFn: () => withTenantScope(tenantId, () => api.listDeletedDevices(token!)),
    enabled: !!token,
    staleTime: 60_000,
  })
}

export function useDeletedSchedules() {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.trash('schedules', tenantId),
    queryFn: () => withTenantScope(tenantId, () => api.listDeletedSchedules(token!)),
    enabled: !!token,
    staleTime: 60_000,
  })
}

export function useOnboardingStatus() {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.onboarding(tenantId),
    queryFn: () => withTenantScope(tenantId, () => api.getOnboardingStatus(token!)),
    enabled: !!token,
    staleTime: 5 * 60_000, // onboarding rarely changes
  })
}

export function useDailyReport(date: string) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.dailyReport(date, tenantId),
    queryFn: () => withTenantScope(tenantId, () => api.dailyReport(token!, date)),
    enabled: !!token,
  })
}

export function useDailyStatus(date: string) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQuery({
    queryKey: queryKeys.dailyStatus(date, tenantId),
    queryFn: () => withTenantScope(tenantId, () => api.dailyStatus(token!, date)),
    enabled: !!token,
  })
}
