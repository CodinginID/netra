import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as api from '@/api/adminApi'
import { useTenantContext } from '@/hooks/useTenantContext'

// ---- Query Keys ----
// Param-based keys omit the trailing arg when no params are given, so a bare
// prefix (e.g. ['users']) used for invalidation correctly PREFIX-MATCHES every
// param variation (['users', {page,limit}]). Returning ['users', undefined]
// would NOT match ['users', {...}], so invalidation would silently miss and the
// UI would only update on a full reload.
//
// tenantId is included in the key to scope queries per tenant — without it,
// switching tenants would reuse cached data from the previous tenant.
// Note: the hooks (not the keys) handle tenantId via useTenantContext() below.
export const queryKeys = {
  users: (params?: { page?: number; limit?: number; search?: string; tenantId?: string | null }) => {
    const key: unknown[] = ['users']
    if (params) key.push(params)
    return key as readonly unknown[]
  },
  devices: (params?: { page?: number; limit?: number; tenantId?: string | null }) => {
    const key: unknown[] = ['devices']
    if (params) key.push(params)
    return key as readonly unknown[]
  },
  schedules: (params?: { page?: number; limit?: number; tenantId?: string | null }) => {
    const key: unknown[] = ['schedules']
    if (params) key.push(params)
    return key as readonly unknown[]
  },
  attendance: (params?: { page?: number; limit?: number; from?: string; to?: string; user_id?: string; tenantId?: string | null }) => {
    const key: unknown[] = ['attendance']
    if (params) key.push(params)
    return key as readonly unknown[]
  },
  tenants: (params?: { page?: number; limit?: number; search?: string }) =>
    (params ? ['tenants', params] : ['tenants']) as readonly unknown[],
  trash: (type: 'users' | 'devices' | 'schedules') =>
    ['trash', type] as readonly unknown[],
  apiKeys: () => ['apiKeys'] as readonly unknown[],
  apiKeyScopes: () => ['apiKeyScopes'] as readonly unknown[],
  onboarding: () => ['onboarding'] as readonly unknown[],
  dailyReport: (date: string, tenantId?: string | null) => ['dailyReport', date, { tenantId }] as readonly unknown[],
  dailyStatus: (date: string, tenantId?: string | null) => ['dailyStatus', date, { tenantId }] as readonly unknown[],
}

// ---- Query Hooks ----

/**
 * Returns the current tenantId from URL context, or null for global views.
 * Centralized so all tenant-scoped hooks can share the same source of truth.
 */
function currentTenantId(): string | null {
  try {
    const ctx = useTenantContext()
    return ctx.tenantId
  } catch {
    return null
  }
}

export function useUsers(params?: { page?: number; limit?: number; search?: string }) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = currentTenantId()
  return useQuery({
    queryKey: queryKeys.users({ ...params, tenantId }),
    queryFn: () => api.listUsers(token!, params),
    enabled: !!token,
  })
}

export function useDevices(params?: { page?: number; limit?: number }) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = currentTenantId()
  return useQuery({
    queryKey: queryKeys.devices({ ...params, tenantId }),
    queryFn: () => api.listDevices(token!, params),
    enabled: !!token,
  })
}

export function useApiKeys() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.apiKeys(),
    queryFn: () => api.listApiKeys(token!),
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
  const tenantId = currentTenantId()
  return useQuery({
    queryKey: queryKeys.schedules({ ...params, tenantId }),
    queryFn: () => api.listSchedules(token!, params),
    enabled: !!token,
  })
}

export function useAttendance(params?: { page?: number; limit?: number; from?: string; to?: string; user_id?: string }) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = currentTenantId()
  return useQuery({
    queryKey: queryKeys.attendance({ ...params, tenantId }),
    queryFn: () => api.listAttendance(token!, params),
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
  return useQuery({
    queryKey: queryKeys.trash('users'),
    queryFn: () => api.listDeletedUsers(token!),
    enabled: !!token,
    staleTime: 60_000, // trash changes rarely
  })
}

export function useDeletedDevices() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.trash('devices'),
    queryFn: () => api.listDeletedDevices(token!),
    enabled: !!token,
    staleTime: 60_000,
  })
}

export function useDeletedSchedules() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.trash('schedules'),
    queryFn: () => api.listDeletedSchedules(token!),
    enabled: !!token,
    staleTime: 60_000,
  })
}

export function useOnboardingStatus() {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.onboarding(),
    queryFn: () => api.getOnboardingStatus(token!),
    enabled: !!token,
    staleTime: 5 * 60_000, // onboarding rarely changes
  })
}

export function useDailyReport(date: string) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = currentTenantId()
  return useQuery({
    queryKey: queryKeys.dailyReport(date, tenantId),
    queryFn: () => api.dailyReport(token!, date),
    enabled: !!token,
  })
}

export function useDailyStatus(date: string) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = currentTenantId()
  return useQuery({
    queryKey: queryKeys.dailyStatus(date, tenantId),
    queryFn: () => api.dailyStatus(token!, date),
    enabled: !!token,
  })
}
