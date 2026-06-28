import { useState, useRef, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, ArrowRight, ArrowLeft } from 'lucide-react'
import { checkEmailApi, loginApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/store/i18nStore'
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
      const card = cardRef.current
      card?.classList.add('shake')
      setError(err instanceof Error ? err.message : t('login.sign_in'))
      setTimeout(() => {
        card?.classList.remove('shake')
        setScanState('idle')
      }, 600)
    }
  }

  return (
    <div className="auth-container">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-brand-logo">
            <Eye size={28} strokeWidth={2.5} />
            <span>netra</span>
          </div>
          <FaceScanVisual state={scanState} />
        </div>
      </aside>

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
                  <Mail className="input-icon" size={18} />
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

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="btn-primary" disabled={checkingEmail}>
                {checkingEmail
                  ? <><span className="btn-spinner" aria-hidden /> {t('login.checking')}</>
                  : <>{t('login.continue')} <ArrowRight size={18} /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn} className="auth-form auth-step-2" key="step-2">
              <button type="button" className="auth-username-chip" onClick={handleBack}>
                <Mail size={14} />
                <span>{email}</span>
                <ArrowLeft size={13} />
              </button>

              <div className="form-group">
                <label htmlFor="password">{t('login.password')}</label>
                <div className="input-icon-wrapper">
                  <Lock className="input-icon" size={18} />
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
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className={`btn-primary${scanState === 'verified' ? ' btn-verified' : ''}`} disabled={loading}>
                {loading ? (
                  <><span className="btn-spinner" aria-hidden /> {t('login.authenticating')}</>
                ) : scanState === 'verified' ? (
                  <>&#10003;&nbsp;{t('login.access_granted')}</>
                ) : (
                  <>{t('login.sign_in_with_arrow')} <ArrowRight size={18} /></>
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

function FaceScanVisual({ state }: { state: ScanState }) {
  const { t } = useI18n()
  return (
    <div className={`auth-face-scan ${state}`}>
      <svg viewBox="0 0 220 240" className="face-scan-svg" aria-hidden="true">
        {/* Corner brackets */}
        <path d="M 32 86 L 32 56 L 62 56" fill="none" stroke="rgba(107,216,203,0.85)" strokeWidth="2.5" strokeLinecap="round" className="bracket"/>
        <path d="M 188 86 L 188 56 L 158 56" fill="none" stroke="rgba(107,216,203,0.85)" strokeWidth="2.5" strokeLinecap="round" className="bracket"/>
        <path d="M 32 178 L 32 208 L 62 208" fill="none" stroke="rgba(107,216,203,0.85)" strokeWidth="2.5" strokeLinecap="round" className="bracket"/>
        <path d="M 188 178 L 188 208 L 158 208" fill="none" stroke="rgba(107,216,203,0.85)" strokeWidth="2.5" strokeLinecap="round" className="bracket"/>
        {/* Face oval */}
        <ellipse cx="110" cy="132" rx="58" ry="72" fill="none" stroke="rgba(107,216,203,0.3)" strokeWidth="1.5" strokeDasharray="5 4"/>
        {/* Mesh lines */}
        <line x1="52" y1="112" x2="168" y2="112" stroke="rgba(107,216,203,0.1)" strokeWidth="1"/>
        <line x1="52" y1="132" x2="168" y2="132" stroke="rgba(107,216,203,0.1)" strokeWidth="1"/>
        <line x1="52" y1="152" x2="168" y2="152" stroke="rgba(107,216,203,0.1)" strokeWidth="1"/>
        <line x1="52" y1="172" x2="168" y2="172" stroke="rgba(107,216,203,0.1)" strokeWidth="1"/>
        {/* Eyes */}
        <ellipse cx="88" cy="118" rx="13" ry="8" fill="none" stroke="rgba(107,216,203,0.55)" strokeWidth="1.5" className="eye"/>
        <ellipse cx="132" cy="118" rx="13" ry="8" fill="none" stroke="rgba(107,216,203,0.55)" strokeWidth="1.5" className="eye"/>
        <circle cx="88" cy="118" r="2.5" fill="#6bd8cb"/>
        <circle cx="132" cy="118" r="2.5" fill="#6bd8cb"/>
        {/* Nose */}
        <path d="M 100 134 L 110 146 L 120 134" fill="none" stroke="rgba(107,216,203,0.4)" strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx="110" cy="146" r="2" fill="rgba(107,216,203,0.6)"/>
        {/* Mouth */}
        <path d="M 95 162 Q 110 172 125 162" fill="none" stroke="rgba(107,216,203,0.4)" strokeWidth="1.5"/>
        {/* Top landmark */}
        <circle cx="110" cy="62" r="3" fill="rgba(107,216,203,0.5)"/>
        <line x1="110" y1="62" x2="110" y2="70" stroke="rgba(107,216,203,0.3)" strokeWidth="1"/>
        {/* Side landmarks */}
        <circle cx="52" cy="132" r="2" fill="rgba(107,216,203,0.4)"/>
        <circle cx="168" cy="132" r="2" fill="rgba(107,216,203,0.4)"/>
        {/* Scan glow */}
        <rect x="38" y="90" width="144" height="6" fill="rgba(107,216,203,0.12)" rx="3" className="scan-glow"/>
        {/* Scan line */}
        <rect x="38" y="93" width="144" height="2" fill="rgba(107,216,203,0.9)" rx="1" className="scan-line"/>
        {/* Verified overlay circle */}
        <circle cx="110" cy="132" r="30" fill="none" stroke="rgba(107,216,203,0)" strokeWidth="2" className="verified-ring"/>
      </svg>

      <div className="face-scan-status">
        {state === 'scanning' && (
          <span className="face-scan-badge scanning">
            <span className="badge-dot" />{t('login.scanning_badge')}
          </span>
        )}
        {state === 'verified' && (
          <span className="face-scan-badge verified">&#10003; {t('login.access_granted')}</span>
        )}
        {state === 'failed' && (
          <span className="face-scan-badge failed">&#10007; {t('login.access_denied')}</span>
        )}
        {state === 'idle' && (
          <span className="face-scan-badge">&#10003; {t('login.identity_verified')}</span>
        )}
        <span className="face-scan-meta">
          {state === 'scanning' ? t('login.processing_biometrics') : t('login.liveness_meta')}
        </span>
      </div>
    </div>
  )
}
