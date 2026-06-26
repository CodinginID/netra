import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useWebSocket } from './useWebSocket'
import { queryKeys } from './useApiQueries'

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Global WebSocket integration with React Query.
 * Connects to the WS endpoint and automatically invalidates caches when events arrive.
 * Use this ONCE at the app root (App.tsx or DashboardLayout).
 */
export function useWebSocketInvalidation() {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  const today = todayString()

  const { on } = useWebSocket(token, { enabled: true })

  // attendance.recorded -> invalidate today's attendance, daily report, and all users
  useEffect(() => {
    if (!token) return
    return on('attendance.recorded', () => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance({ from: today, to: today }) })
      qc.invalidateQueries({ queryKey: queryKeys.dailyReport(today) })
    })
  }, [on, qc, today, token])

  // attendance.late -> invalidate today's attendance and daily report
  useEffect(() => {
    if (!token) return
    return on('attendance.late', () => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance({ from: today, to: today }) })
      qc.invalidateQueries({ queryKey: queryKeys.dailyReport(today) })
    })
  }, [on, qc, today, token])

  // device.revoked -> invalidate devices list
  useEffect(() => {
    if (!token) return
    return on('device.revoked', () => {
      qc.invalidateQueries({ queryKey: queryKeys.devices() })
    })
  }, [on, qc, token])

  // user.enrolled -> invalidate users list
  useEffect(() => {
    if (!token) return
    return on('user.enrolled', () => {
      qc.invalidateQueries({ queryKey: queryKeys.users() })
    })
  }, [on, qc, token])
}
