import type { ApiResponse, AuthTokens, LoginRequest } from '@/types/auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export async function checkUsernameApi(username: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/check-username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
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
