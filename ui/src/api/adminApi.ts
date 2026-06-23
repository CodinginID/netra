import { useAuthStore } from '@/store/authStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

function authHeaders(token: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const tenantId = useAuthStore.getState().selectedTenantId
  if (tenantId) h['X-Tenant-Id'] = tenantId
  return h
}

async function apiFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(token), ...init?.headers },
  })
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail ?? json.error ?? `Request failed (${res.status})`)
  return (json.data ?? json) as T
}

// --------------------------------------------------------------------------- //
// Users
// --------------------------------------------------------------------------- //
export interface UserOut {
  id: string
  tenant_id: string | null
  full_name: string
  role: string
  username: string | null
  email: string | null
  external_id: string | null
  is_active: boolean
  enrolled: boolean
  created_at: string
}

export interface UserCreate {
  full_name: string
  role?: string
  username?: string
  email?: string
  external_id?: string
  password?: string
}

export async function listUsers(token: string): Promise<UserOut[]> {
  return apiFetch<UserOut[]>(`${API_BASE}/users`, token)
}

export async function createUser(token: string, payload: UserCreate): Promise<UserOut> {
  return apiFetch<UserOut>(`${API_BASE}/users`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface UserUpdate {
  full_name?: string
  role?: string
  username?: string
  is_active?: boolean
}

export async function updateUser(token: string, userId: string, payload: UserUpdate): Promise<UserOut> {
  return apiFetch<UserOut>(`${API_BASE}/users/${userId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteUser(token: string, userId: string): Promise<void> {
  return apiFetch<void>(`${API_BASE}/users/${userId}`, token, { method: 'DELETE' })
}

// --------------------------------------------------------------------------- //
// Devices
// --------------------------------------------------------------------------- //
export interface DeviceOut {
  id: string
  name: string
  status: 'active' | 'revoked'
  last_seen_at: string | null
  created_at: string
}

export interface DeviceRegistered extends DeviceOut {
  token: string
}

export async function listDevices(token: string): Promise<DeviceOut[]> {
  return apiFetch<DeviceOut[]>(`${API_BASE}/devices`, token)
}

export async function registerDevice(token: string, name: string): Promise<DeviceRegistered> {
  return apiFetch<DeviceRegistered>(`${API_BASE}/devices`, token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function revokeDevice(token: string, deviceId: string): Promise<DeviceOut> {
  return apiFetch<DeviceOut>(`${API_BASE}/devices/${deviceId}/revoke`, token, { method: 'POST' })
}

// --------------------------------------------------------------------------- //
// Schedules
// --------------------------------------------------------------------------- //
export interface SessionRule {
  name: string
  start: string // "HH:MM"
  end: string   // "HH:MM"
}

export interface ScheduleRules {
  type?: 'shift' | 'session'
  workday_start?: string
  workday_end?: string
  work_days?: string
  sessions?: SessionRule[]
  holidays?: string[]
}

export interface ScheduleOut {
  id: string
  name: string
  rules: ScheduleRules
  grace_minutes: number
  geofence: Record<string, unknown> | null
  is_default: boolean
  created_at: string
}

export interface ScheduleCreate {
  name: string
  rules?: ScheduleRules
  grace_minutes?: number
  is_default?: boolean
}

export async function listSchedules(token: string): Promise<ScheduleOut[]> {
  return apiFetch<ScheduleOut[]>(`${API_BASE}/schedules`, token)
}

export async function createSchedule(
  token: string,
  payload: ScheduleCreate,
): Promise<ScheduleOut> {
  return apiFetch<ScheduleOut>(`${API_BASE}/schedules`, token, {
    method: 'POST',
    body: JSON.stringify({ rules: {}, grace_minutes: 0, ...payload }),
  })
}

export async function updateSchedule(
  token: string,
  scheduleId: string,
  payload: Partial<ScheduleCreate>,
): Promise<ScheduleOut> {
  return apiFetch<ScheduleOut>(`${API_BASE}/schedules/${scheduleId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteSchedule(token: string, scheduleId: string): Promise<void> {
  return apiFetch<void>(`${API_BASE}/schedules/${scheduleId}`, token, { method: 'DELETE' })
}

// --------------------------------------------------------------------------- //
// Attendance
// --------------------------------------------------------------------------- //
export interface AttendanceOut {
  id: string
  user_id: string
  type: 'check_in' | 'check_out'
  status: 'on_time' | 'late' | 'early_leave'
  occurred_at: string
  liveness_score: number | null
  device_id: string | null
  created_at: string
}

export async function listAttendance(
  token: string,
  params?: { from?: string; to?: string },
): Promise<AttendanceOut[]> {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  const url = `${API_BASE}/attendance${qs.toString() ? `?${qs}` : ''}`
  return apiFetch<AttendanceOut[]>(url, token)
}

export function exportAttendanceUrl(from: string, to: string, format: 'csv' | 'xlsx'): string {
  return `${API_BASE}/reports/attendance/export?from=${from}&to=${to}&format=${format}`
}

// --------------------------------------------------------------------------- //
// Reports / Dashboard stats
// --------------------------------------------------------------------------- //
export interface UserRecap {
  user_id: string
  full_name: string
  on_time: number
  late: number
  early_leave: number
  check_in: number
  check_out: number
}

export interface AttendanceRecap {
  period_start: string
  period_end: string
  total_records: number
  on_time: number
  late: number
  early_leave: number
  check_in: number
  check_out: number
  users: UserRecap[]
}

export async function dailyReport(token: string, date: string): Promise<AttendanceRecap> {
  return apiFetch<AttendanceRecap>(
    `${API_BASE}/reports/attendance/daily?date=${date}`,
    token,
  )
}

// --------------------------------------------------------------------------- //
// Tenants (super admin)
// --------------------------------------------------------------------------- //
export interface TenantOut {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended'
  config: Record<string, unknown>
  created_at: string
}

export interface TenantCreate {
  name: string
  slug: string
  admin_username: string
  admin_password: string
  admin_full_name: string
  config?: { vertical?: { mode: string } }
}

export async function listTenants(token: string): Promise<TenantOut[]> {
  return apiFetch<TenantOut[]>(`${API_BASE}/tenants`, token)
}

export async function createTenant(token: string, payload: TenantCreate): Promise<TenantOut> {
  return apiFetch<TenantOut>(`${API_BASE}/tenants`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function suspendTenant(token: string, tenantId: string): Promise<TenantOut> {
  return apiFetch<TenantOut>(`${API_BASE}/tenants/${tenantId}/suspend`, token, { method: 'POST' })
}

export async function activateTenant(token: string, tenantId: string): Promise<TenantOut> {
  return apiFetch<TenantOut>(`${API_BASE}/tenants/${tenantId}/activate`, token, { method: 'POST' })
}
