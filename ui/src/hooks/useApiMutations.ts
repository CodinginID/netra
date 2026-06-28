import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as api from '@/api/adminApi'
import { queryKeys } from './useApiQueries'

// ---- Mutation Hooks ----

export function useCreateUser(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: api.UserCreate) => api.createUser(token!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users() })
      onSuccess?.()
    },
  })
}

export function useUpdateUser(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: api.UserUpdate }) =>
      api.updateUser(token!, userId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users() })
      onSuccess?.()
    },
  })
}

export function useDeleteUser(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.deleteUser(token!, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users() })
      qc.invalidateQueries({ queryKey: queryKeys.trash('users') })
      onSuccess?.()
    },
  })
}

export function useRestoreUser(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.restoreUser(token!, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('users') })
      qc.invalidateQueries({ queryKey: queryKeys.users() })
      onSuccess?.()
    },
  })
}

export function useRegisterDevice(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.registerDevice(token!, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      onSuccess?.()
    },
  })
}

export function useRevokeDevice(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => api.revokeDevice(token!, deviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      onSuccess?.()
    },
  })
}

export function useRegenerateDeviceToken(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => api.regenerateDeviceToken(token!, deviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      onSuccess?.()
    },
  })
}

export function useDeleteDevice(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => api.deleteDevice(token!, deviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      qc.invalidateQueries({ queryKey: queryKeys.trash('devices') })
      onSuccess?.()
    },
  })
}

export function useRestoreDevice(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => api.restoreDevice(token!, deviceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('devices') })
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
      onSuccess?.()
    },
  })
}

export function useCreateSchedule(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: api.ScheduleCreate) => api.createSchedule(token!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() })
      onSuccess?.()
    },
  })
}

export function useUpdateSchedule(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, payload }: { scheduleId: string; payload: Partial<api.ScheduleCreate> }) =>
      api.updateSchedule(token!, scheduleId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() })
      onSuccess?.()
    },
  })
}

export function useDeleteSchedule(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => api.deleteSchedule(token!, scheduleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules() })
      qc.invalidateQueries({ queryKey: queryKeys.trash('schedules') })
      onSuccess?.()
    },
  })
}

export function useRestoreSchedule(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: string) => api.restoreSchedule(token!, scheduleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.trash('schedules') })
      qc.invalidateQueries({ queryKey: queryKeys.schedules() })
      onSuccess?.()
    },
  })
}

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

export function useCompleteOnboarding(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.completeOnboarding(token!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.onboarding() })
      onSuccess?.()
    },
  })
}

export function useDismissOnboarding(onSuccess?: () => void) {
  const token = useAuthStore((s) => s.accessToken)
  return useMutation({
    mutationFn: () => api.dismissOnboarding(token!),
    onSuccess,
  })
}
