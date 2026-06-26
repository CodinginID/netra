import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as api from '@/api/adminApi'

// ---- Query Keys ----
// Param-based keys omit the trailing arg when no params are given, so a bare
// prefix (e.g. ['users']) used for invalidation correctly PREFIX-MATCHES every
// param variation (['users', {page,limit}]). Returning ['users', undefined]
// would NOT match ['users', {...}], so invalidation would silently miss and the
// UI would only update on a full reload.
export const queryKeys = {
  users: (params?: { page?: number; limit?: number; search?: string }) =>
    (params ? ['users', params] : ['users']) as readonly unknown[],
  devices: (params?: { page?: number; limit?: number }) =>
    (params ? ['devices', params] : ['devices']) as readonly unknown[],
  schedules: (params?: { page?: number; limit?: number }) =>
    (params ? ['schedules', params] : ['schedules']) as readonly unknown[],
  attendance: (params?: { page?: number; limit?: number; from?: string; to?: string; user_id?: string }) =>
    (params ? ['attendance', params] : ['attendance']) as readonly unknown[],
  tenants: (params?: { page?: number; limit?: number; search?: string }) =>
    (params ? ['tenants', params] : ['tenants']) as readonly unknown[],
  trash: (type: 'users' | 'devices' | 'schedules') =>
    ['trash', type] as readonly unknown[],
  onboarding: () => ['onboarding'] as readonly unknown[],
  dailyReport: (date: string) => ['dailyReport', date] as readonly unknown[],
}

// ---- Query Hooks ----

export function useUsers(params?: { page?: number; limit?: number; search?: string }) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => api.listUsers(token!, params),
    enabled: !!token,
  })
}

export function useDevices(params?: { page?: number; limit?: number }) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.devices(params),
    queryFn: () => api.listDevices(token!, params),
    enabled: !!token,
  })
}

export function useSchedules(params?: { page?: number; limit?: number }) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.schedules(params),
    queryFn: () => api.listSchedules(token!, params),
    enabled: !!token,
  })
}

export function useAttendance(params?: { page?: number; limit?: number; from?: string; to?: string; user_id?: string }) {
  const token = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: queryKeys.attendance(params),
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
  return useQuery({
    queryKey: queryKeys.dailyReport(date),
    queryFn: () => api.dailyReport(token!, date),
    enabled: !!token,
  })
}
