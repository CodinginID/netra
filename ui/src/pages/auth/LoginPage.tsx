import { useState, useRef, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, Lock, Mail, ArrowRight, ArrowLeft, BookOpen, Check } from 'lucide-react'
import { checkEmailApi, loginApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/store/i18nStore'
import { LoginIdCard, type CardState } from './LoginIdCard'
import '@/styles/auth.css'

type ScanState = 'idle' | 'scanning' | 'verified' | 'failed'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setTokens = useAuthStore((s) => s.setTokens)
  const { t } = useI18n()

  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [checkingEmail, setCheckingEmail] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'
  const loading = scanState === 'scanning'
  const cardState: CardState = checkingEmail
    ? 'email'
    : scanState === 'scanning' ? 'auth'
    : scanState === 'verified' ? 'ok'
    : scanState === 'failed' ? 'fail'
    : 'idle'

  async function handleContinue(e: FormEvent) {
    e.preventDefault()
    const value = email.trim().toLowerCase()
    if (!value) return
    setError(null)
    setCheckingEmail(true)
    try {
      const exists = await checkEmailApi(value)
      if (!exists) {
        setError(t('login.email_not_found'))
        cardRef.current?.classList.add('shake')
        setTimeout(() => cardRef.current?.classList.remove('shake'), 600)
        return
      }
      setStep(2)
    } catch {
      setError(t('login.cannot_verify'))
    } finally {
      setCheckingEmail(false)
    }
  }

  function handleBack() {
    setStep(1)
    setError(null)
    setScanState('idle')
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setScanState('scanning')

    try {
      const tokens = await loginApi({ email: email.trim().toLowerCase(), password })
      setScanState('verified')
      await new Promise((r) => setTimeout(r, 900))
      setTokens(tokens.access_token, tokens.refresh_token, tokens.role)
      navigate(from, { replace: true })
    } catch (err) {
      setScanState('failed')
      setError(err instanceof Error ? err.message : t('login.sign_in'))
      // keep the "failed" card state visible briefly, then return to idle
      setTimeout(() => setScanState((s) => (s === 'failed' ? 'idle' : s)), 1400)
    }
  }

  return (
    <div className="auth-container">
      <aside className="auth-brand">
        <div className="auth-brand-logo">
          <span className="auth-brand-mark"><Eye size={18} strokeWidth={2.5} /></span>
          <span>netra</span>
        </div>
        <div className="auth-brand-stage">
          <LoginIdCard state={cardState} step={step} />
        </div>
      </aside>

      <a href="/docs/" className="auth-docs-btn">
        <BookOpen size={15} />
        <span>{t('login.docs_button')}</span>
        <ArrowRight size={14} className="auth-docs-btn-arrow" />
      </a>

      <main className="auth-panel">
        <div className="auth-card" ref={cardRef}>
          <div className="auth-card-head">
            <h1 className="auth-title">{t('login.welcome')}</h1>
            <p className="auth-subtitle">{t('login.subtitle')}</p>
          </div>

          {step === 1 ? (
            <form onSubmit={handleContinue} className="auth-form" key="step-1">
              <div className="form-group">
                <label htmlFor="email">{t('login.email')}</label>
                <div className="input-icon-wrapper">
                  <Mail className="input-icon" size={17} />
                  <input
                    id="email"
                    type="email"
                    className="input-with-icon"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder={t('login.email_placeholder')}
                    autoFocus
                    disabled={checkingEmail}
                  />
                </div>
              </div>

              {error && <p className="auth-error" role="alert">{error}</p>}

              <button type="submit" className="btn-primary" disabled={checkingEmail} aria-busy={checkingEmail}>
                {checkingEmail
                  ? <><span className="btn-spinner" aria-hidden /> {t('login.checking')}</>
                  : <>{t('login.continue')} <ArrowRight size={17} /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn} className="auth-form auth-step-2" key="step-2">
              <button type="button" className="auth-username-chip" onClick={handleBack}>
                <Mail size={14} />
                <span className="auth-username-chip-email">{email}</span>
                <span className="auth-username-chip-change">
                  <ArrowLeft size={13} /> {t('login.change')}
                </span>
              </button>

              <div className="form-group">
                <label htmlFor="password">{t('login.password')}</label>
                <div className="input-icon-wrapper">
                  <Lock className="input-icon" size={17} />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="input-with-icon input-with-trailing"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder={t('login.password_placeholder')}
                    autoFocus
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="input-trailing-btn"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t('login.hide_password_aria') : t('login.show_password_aria')}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                  >
                    {showPassword ? t('login.hide') : t('login.show')}
                  </button>
                </div>
              </div>

              {error && <p className="auth-error" role="alert">{error}</p>}

              <button
                type="submit"
                className={`btn-primary${scanState === 'verified' ? ' btn-verified' : ''}`}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? (
                  <><span className="btn-spinner" aria-hidden /> {t('login.authenticating')}</>
                ) : scanState === 'verified' ? (
                  <><Check size={17} strokeWidth={2.75} /> {t('login.access_granted')}</>
                ) : (
                  <>{t('login.sign_in_with_arrow')} <ArrowRight size={17} /></>
                )}
              </button>
            </form>
          )}

          <p className="auth-powered">{t('login.powered_by')} <strong>Netra</strong></p>
        </div>
      </main>
    </div>
  )
}
