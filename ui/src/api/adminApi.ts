import { useAuthStore } from '@/store/authStore'
import { refreshApi } from '@/api/authApi'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

/**
 * Mutable ref holding the current tenant context.
 * Set by `setApiTenantContext` (or the `useTenantApiHeaders` hook) so that
 * apiFetch picks up the tenant from the URL rather than localStorage.
 */
let _currentTenantId: string | null = null

/** Update the active tenant for all subsequent API calls. */
export function setApiTenantContext(tenantId: string | null) {
  _currentTenantId = tenantId
}

/** Read the current tenant context — used by enrollmentApi.ts. */
export function getApiTenantContext(): string | null {
  return _currentTenantId
}

function authHeaders(token: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  if (_currentTenantId) h['X-Tenant-Id'] = _currentTenantId
  return h
}

// Dedupe concurrent refreshes: many parallel requests hitting 401 at once should
// trigger a single /auth/refresh, then all retry with the new token.
let refreshPromise: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  const rt = useAuthStore.getState().refreshToken
  if (!rt) return null
  refreshPromise = (async () => {
    try {
      const tokens = await refreshApi(rt)
      useAuthStore.getState().updateTokens(tokens.access_token, tokens.refresh_token)
      return tokens.access_token
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

async function apiFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  let res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(token), ...init?.headers },
  })

  // On 401, attempt a single silent refresh and retry once before giving up.
  if (res.status === 401) {
    const newToken = await tryRefresh()
    if (newToken) {
      res = await fetch(url, {
        ...init,
        headers: { ...authHeaders(newToken), ...init?.headers },
      })
    }
    if (res.status === 401) {
      useAuthStore.getState().logout()
      throw new Error('Session expired')
    }
  }

  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail ?? json.error ?? `Request failed (${res.status})`)
  return (json.data ?? json) as T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  pages: number
}

/**
 * Coerce any list-shaped response into a valid PaginatedResponse.
 * Tolerates the server returning a bare array (legacy) or a partial/empty
 * envelope, so the UI never receives an `undefined` `items` array.
 */
function normalizePaginated<T>(raw: unknown): PaginatedResponse<T> {
  if (Array.isArray(raw)) {
    return { items: raw as T[], total: raw.length, page: 1, limit: raw.length || 10, pages: 1 }
  }
  const obj = (raw ?? {}) as Partial<PaginatedResponse<T>>
  const items = Array.isArray(obj.items) ? obj.items : []
  return {
    items,
    total: obj.total ?? items.length,
    page: obj.page ?? 1,
    limit: obj.limit ?? (items.length || 10),
    pages: obj.pages ?? 1,
  }
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
  deleted_at?: string
}

export interface UserCreate {
  full_name: string
  role?: string
  username?: string
  email?: string
  external_id?: string
  password?: string
}

export async function listUsers(token: string, params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<UserOut>> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.search) qs.set('search', params.search)
  const raw = await apiFetch<unknown>(`${API_BASE}/users${qs.toString() ? `?${qs}` : ''}`, token)
  return normalizePaginated<UserOut>(raw)
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
  deleted_at?: string
}

export interface DeviceRegistered extends DeviceOut {
  token: string
}

export async function listDevices(token: string, params?: { page?: number; limit?: number }): Promise<PaginatedResponse<DeviceOut>> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  const raw = await apiFetch<unknown>(`${API_BASE}/devices${qs.toString() ? `?${qs}` : ''}`, token)
  return normalizePaginated<DeviceOut>(raw)
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

/** Re-issue a fresh one-time token for an existing device (old token invalidated). */
export async function regenerateDeviceToken(token: string, deviceId: string): Promise<DeviceRegistered> {
  return apiFetch<DeviceRegistered>(`${API_BASE}/devices/${deviceId}/regenerate-token`, token, { method: 'POST' })
}

export async function deleteDevice(token: string, deviceId: string): Promise<void> {
  return apiFetch<void>(`${API_BASE}/devices/${deviceId}`, token, { method: 'DELETE' })
}

// --------------------------------------------------------------------------- //
// API keys (server-to-server integration)
// --------------------------------------------------------------------------- //
export interface ApiKeyOut {
  id: string
  name: string
  prefix: string
  scopes: string[]
  status: 'active' | 'revoked'
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

export interface ApiKeyCreated extends ApiKeyOut {
  key: string
}

export async function listApiKeys(token: string): Promise<ApiKeyOut[]> {
  return apiFetch<ApiKeyOut[]>(`${API_BASE}/api-keys`, token)
}

export async function listApiKeyScopes(token: string): Promise<Record<string, string>> {
  return apiFetch<Record<string, string>>(`${API_BASE}/api-keys/scopes`, token)
}

export async function createApiKey(
  token: string,
  payload: { name: string; scopes: string[]; expires_in_days?: number | null },
): Promise<ApiKeyCreated> {
  return apiFetch<ApiKeyCreated>(`${API_BASE}/api-keys`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function rotateApiKey(token: string, keyId: string): Promise<ApiKeyCreated> {
  return apiFetch<ApiKeyCreated>(`${API_BASE}/api-keys/${keyId}/rotate`, token, { method: 'POST' })
}

export async function revokeApiKey(token: string, keyId: string): Promise<ApiKeyOut> {
  return apiFetch<ApiKeyOut>(`${API_BASE}/api-keys/${keyId}/revoke`, token, { method: 'POST' })
}

export async function deleteApiKey(token: string, keyId: string): Promise<void> {
  return apiFetch<void>(`${API_BASE}/api-keys/${keyId}`, token, { method: 'DELETE' })
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
  deleted_at?: string
}

export interface ScheduleCreate {
  name: string
  rules?: ScheduleRules
  grace_minutes?: number
  is_default?: boolean
}

export async function listSchedules(token: string, params?: { page?: number; limit?: number }): Promise<PaginatedResponse<ScheduleOut>> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  const raw = await apiFetch<unknown>(`${API_BASE}/schedules${qs.toString() ? `?${qs}` : ''}`, token)
  return normalizePaginated<ScheduleOut>(raw)
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
export interface AttendanceLocation {
  lat?: number
  lng?: number
  outside_geofence?: boolean
}

export interface AttendanceOut {
  id: string
  user_id: string
  type: 'check_in' | 'check_out'
  status: 'on_time' | 'late' | 'early_leave'
  occurred_at: string
  liveness_score: number | null
  device_id: string | null
  location: AttendanceLocation | null
  created_at: string
}

export async function listAttendance(
  token: string,
  params?: { page?: number; limit?: number; from?: string; to?: string; user_id?: string },
): Promise<PaginatedResponse<AttendanceOut>> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.user_id) qs.set('user_id', params.user_id)
  const raw = await apiFetch<unknown>(`${API_BASE}/attendance${qs.toString() ? `?${qs}` : ''}`, token)
  return normalizePaginated<AttendanceOut>(raw)
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
// Daily roster status (who's attended / absent today)
// --------------------------------------------------------------------------- //
export type DailyStatusValue = 'absent' | 'present' | 'late' | 'checked_out'

export interface DailyStatus {
  user_id: string
  full_name: string
  external_id: string | null
  status: DailyStatusValue
  check_in_at: string | null
  check_out_at: string | null
}

export async function dailyStatus(token: string, date: string): Promise<DailyStatus[]> {
  const raw = await apiFetch<unknown>(`${API_BASE}/reports/attendance/status?date=${date}`, token)
  return Array.isArray(raw) ? (raw as DailyStatus[]) : []
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
  admin_email: string
  admin_password: string
  admin_full_name: string
  admin_username?: string
  config?: { vertical?: { mode: string } }
}

export async function listTenants(token: string, params?: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<TenantOut>> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.search) qs.set('search', params.search)
  const raw = await apiFetch<unknown>(`${API_BASE}/tenants${qs.toString() ? `?${qs}` : ''}`, token)
  return normalizePaginated<TenantOut>(raw)
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

// --------------------------------------------------------------------------- //
// Trash / Recycle Bin
// --------------------------------------------------------------------------- //
export async function listDeletedUsers(token: string): Promise<PaginatedResponse<UserOut>> {
  return normalizePaginated<UserOut>(await apiFetch<unknown>(`${API_BASE}/users/trash`, token))
}

export async function restoreUser(token: string, userId: string): Promise<UserOut> {
  return apiFetch<UserOut>(`${API_BASE}/users/${userId}/restore`, token, { method: 'POST' })
}

export async function listDeletedDevices(token: string): Promise<PaginatedResponse<DeviceOut>> {
  return normalizePaginated<DeviceOut>(await apiFetch<unknown>(`${API_BASE}/devices/trash`, token))
}

export async function restoreDevice(token: string, deviceId: string): Promise<DeviceOut> {
  return apiFetch<DeviceOut>(`${API_BASE}/devices/${deviceId}/restore`, token, { method: 'POST' })
}

export async function listDeletedSchedules(token: string): Promise<PaginatedResponse<ScheduleOut>> {
  return normalizePaginated<ScheduleOut>(await apiFetch<unknown>(`${API_BASE}/schedules/trash`, token))
}

export async function restoreSchedule(token: string, scheduleId: string): Promise<ScheduleOut> {
  return apiFetch<ScheduleOut>(`${API_BASE}/schedules/${scheduleId}/restore`, token, { method: 'POST' })
}

// --------------------------------------------------------------------------- //
// Onboarding
// --------------------------------------------------------------------------- //
export interface OnboardingStatus {
  completed: boolean
  steps: {
    welcome: boolean
    schedule: boolean
    device: boolean
    users: boolean
    test: boolean
  }
}

export async function getOnboardingStatus(token: string): Promise<OnboardingStatus> {
  return apiFetch<OnboardingStatus>(`${API_BASE}/onboarding/status`, token)
}

export async function completeOnboarding(token: string): Promise<{ completed: boolean; completed_at: string }> {
  return apiFetch<{ completed: boolean; completed_at: string }>(`${API_BASE}/onboarding/complete`, token, { method: 'POST' })
}

export async function dismissOnboarding(token: string): Promise<{ dismissed: boolean }> {
  return apiFetch<{ dismissed: boolean }>(`${API_BASE}/onboarding/dismiss`, token, { method: 'POST' })
}
