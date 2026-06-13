import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loginApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'
import '@/styles/auth.css'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setTokens = useAuthStore((s) => s.setTokens)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const tokens = await loginApi({
        username,
        password,
        ...(tenantSlug.trim() ? { tenant_slug: tenantSlug.trim() } : {}),
      })
      setTokens(tokens.access_token, tokens.refresh_token, tokens.role)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">👁</span>
          <h1 className="auth-title">netra</h1>
        </div>
        <p className="auth-subtitle">Face-Recognition Attendance</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="Enter username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="tenantSlug">
              Tenant Slug <span className="optional">(optional)</span>
            </label>
            <input
              id="tenantSlug"
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              autoComplete="organization"
              placeholder="your-organization"
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
