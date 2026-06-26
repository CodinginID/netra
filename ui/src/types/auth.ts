export type Role =
  | 'super_admin'
  | 'tenant_admin'
  | 'supervisor'
  | 'end_user'
  | 'kiosk'

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  role: Role
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}
