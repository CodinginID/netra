import type { ApiResponse, AuthTokens, LoginRequest } from '@/types/auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

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
