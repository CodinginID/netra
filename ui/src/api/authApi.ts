import type { ApiResponse, AuthTokens, LoginRequest } from '@/types/auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export async function checkEmailApi(email: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/check-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const json: ApiResponse<{ exists: boolean }> = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Request failed')
  return json.data?.exists ?? false
}

export async function loginApi(payload: LoginRequest): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const json: ApiResponse<AuthTokens> = await res.json()

  if (!res.ok || json.error || !json.data) {
    throw new Error(json.error ?? 'Login failed')
  }

  return json.data
}

/** Exchange a refresh token for a fresh access + refresh pair. */
export async function refreshApi(refreshToken: string): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  const json: ApiResponse<AuthTokens> = await res.json().catch(() => ({ data: null, error: 'parse' }))
  if (!res.ok || json.error || !json.data) {
    throw new Error(json.error ?? 'Refresh failed')
  }
  return json.data
}

/** Change the current user's own password (requires a valid access token). */
export async function changePasswordApi(
  accessToken: string,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  })
  const json: ApiResponse<unknown> = await res.json().catch(() => ({ data: null, error: 'parse' }))
  if (!res.ok || json.error) {
    throw new Error(json.error ?? 'Gagal mengubah password')
  }
}
