import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as api from '@/api/adminApi'
import { withTenantScope } from '@/api/adminApi'
import { queryKeys, useTenantScope } from './useApiQueries'

/**
 * Runs a tenant-scoped API call pinned to the scope of the view that fired it.
 *
 * Writes need the same pinning as reads: a mutation that went out without a
 * tenant used to be applied in whatever scope the backend guessed. It now
 * carries the scope explicitly, and the backend rejects the request outright if
 * one is missing.
 */
function useScopedCall() {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return <T,>(fn: (token: string) => Promise<T>): Promise<T> =>
    withTenantScope(tenantId, () => fn(token!))
}

// ---- Mutation Hooks ----

export function useCreateUser(onSuccess?: (user: api.UserCreateOut) => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: api.UserCreate) => call((t) => api.createUser(t, payload)),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: queryKeys.users() })
      // Adding someone back revives their deleted record, so it leaves the trash.
      qc.invalidateQueries({ queryKey: queryKeys.trash('users') })
      onSuccess?.(user)
    },
  })
}

export function useUpdateUser(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: api.UserUpdate }) =>
      call((t) => api.updateUser(t, userId, payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users() })
      onSuccess?.()
    },
  })
}

export function useDeleteUser(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => call((t) => api.deleteUser(t, userId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users() })
      qc.invalidateQueries({ queryKey: queryKeys.trash('users') })
      onSuccess?.()
    },
  })
}

export function useRestoreUser(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => call((t) => api.restoreUser(t, userId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('users') })
      qc.invalidateQueries({ queryKey: queryKeys.users() })
      onSuccess?.()
    },
  })
}

export function useRegisterDevice(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => call((t) => api.registerDevice(t, name)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      onSuccess?.()
    },
  })
}

export function useRevokeDevice(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => call((t) => api.revokeDevice(t, deviceId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      onSuccess?.()
    },
  })
}

export function useRegenerateDeviceToken(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => call((t) => api.regenerateDeviceToken(t, deviceId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      onSuccess?.()
    },
  })
}

// ---- API keys (integration) ----
export function useCreateApiKey(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; scopes: string[]; expires_in_days?: number | null }) =>
      call((t) => api.createApiKey(t, payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys() })
      onSuccess?.()
    },
  })
}

export function useUpdateApiKeyOrigins(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ keyId, allowedOrigins }: { keyId: string; allowedOrigins: string[] }) =>
      call((t) => api.updateApiKeyOrigins(t, keyId, allowedOrigins)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys() })
      onSuccess?.()
    },
  })
}

export function useRotateApiKey(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => call((t) => api.rotateApiKey(t, keyId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys() })
      onSuccess?.()
    },
  })
}

export function useRevokeApiKey(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => call((t) => api.revokeApiKey(t, keyId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys() })
      onSuccess?.()
    },
  })
}

export function useDeleteApiKey(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => call((t) => api.deleteApiKey(t, keyId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys() })
      onSuccess?.()
    },
  })
}

export function useDeleteDevice(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => call((t) => api.deleteDevice(t, deviceId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      qc.invalidateQueries({ queryKey: queryKeys.trash('devices') })
      onSuccess?.()
    },
  })
}

export function useRestoreDevice(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => call((t) => api.restoreDevice(t, deviceId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('devices') })
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      onSuccess?.()
    },
  })
}

export function useCreateSchedule(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: api.ScheduleCreate) => call((t) => api.createSchedule(t, payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() })
      onSuccess?.()
    },
  })
}

export function useUpdateSchedule(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, payload }: { scheduleId: string; payload: Partial<api.ScheduleCreate> }) =>
      call((t) => api.updateSchedule(t, scheduleId, payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() })
      onSuccess?.()
    },
  })
}

export function useDeleteSchedule(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => call((t) => api.deleteSchedule(t, scheduleId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() })
      qc.invalidateQueries({ queryKey: queryKeys.trash('schedules') })
      onSuccess?.()
    },
  })
}

export function useRestoreSchedule(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => call((t) => api.restoreSchedule(t, scheduleId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('schedules') })
      qc.invalidateQueries({ queryKey: queryKeys.schedules() })
      onSuccess?.()
    },
  })
}

export function useHardDeleteTrashUser(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entityId: string) => call((t) => api.hardDeleteTrashUser(t, entityId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('users') })
      onSuccess?.()
    },
  })
}

export function useHardDeleteTrashDevice(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entityId: string) => call((t) => api.hardDeleteTrashDevice(t, entityId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('devices') })
      onSuccess?.()
    },
  })
}

export function useHardDeleteTrashSchedule(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entityId: string) => call((t) => api.hardDeleteTrashSchedule(t, entityId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('schedules') })
      onSuccess?.()
    },
  })
}

// ---- Tenant administration (platform-level; /tenants is not tenant-scoped) ----

export function useCreateTenant(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: api.TenantCreate) => api.createTenant(token!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants() })
      onSuccess?.()
    },
  })
}

export function useSuspendTenant(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId: string) => api.suspendTenant(token!, tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants() })
      onSuccess?.()
    },
  })
}

export function useActivateTenant(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId: string) => api.activateTenant(token!, tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants() })
      onSuccess?.()
    },
  })
}

export function useDeleteTenant(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId: string) => api.deleteTenant(token!, tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tenants() })
      qc.invalidateQueries({ queryKey: queryKeys.trash('tenants') })
      onSuccess?.()
    },
  })
}

export function useCompleteOnboarding(onSuccess?: () => void) {
  const call = useScopedCall()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => call((t) => api.completeOnboarding(t)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.onboarding() })
      onSuccess?.()
    },
  })
}

export function useDismissOnboarding(onSuccess?: () => void) {
  const call = useScopedCall()
  return useMutation({
    mutationFn: () => call((t) => api.dismissOnboarding(t)),
    onSuccess,
  })
}
