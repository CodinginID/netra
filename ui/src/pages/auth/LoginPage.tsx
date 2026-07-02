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
      {/* 3D ID Card with face */}
      <div className="face-scan-card">
        <div className="face-scan-card-inner">
          {/* Card front face */}
          <div className="face-scan-card-face">
            {/* Card header */}
            <div className="face-scan-card-header">
              <div className="face-scan-card-chip" />
              <span className="face-scan-card-label">netra</span>
            </div>

            {/* Face photo area */}
            <div className="face-scan-photo">
              <svg viewBox="0 0 120 140" className="face-scan-face-svg" aria-hidden="true">
                {/* Living head — breathes & bobs subtly */}
                <g className="face-head">
                  {/* Face silhouette */}
                  <ellipse cx="60" cy="55" rx="32" ry="40" fill="rgba(107,216,203,0.08)" stroke="rgba(107,216,203,0.3)" strokeWidth="1.5"/>

                  {/* Eyes — blink together via scaleY */}
                  <g className="face-eyes">
                    <ellipse cx="48" cy="48" rx="7" ry="4.5" fill="none" stroke="rgba(107,216,203,0.6)" strokeWidth="1.2" className="face-eye"/>
                    <ellipse cx="72" cy="48" rx="7" ry="4.5" fill="none" stroke="rgba(107,216,203,0.6)" strokeWidth="1.2" className="face-eye"/>
                    {/* Pupils — glance around */}
                    <g className="face-pupils">
                      <circle cx="48" cy="48" r="2" fill="#6bd8cb" className="eye-pupil"/>
                      <circle cx="72" cy="48" r="2" fill="#6bd8cb" className="eye-pupil"/>
                    </g>
                  </g>

                  {/* Nose */}
                  <path d="M 55 58 L 60 66 L 65 58" fill="none" stroke="rgba(107,216,203,0.35)" strokeWidth="1.2" strokeLinejoin="round"/>

                  {/* Mouth — neutral by default, smiles when verified */}
                  <path d="M 50 75 Q 60 82 70 75" fill="none" stroke="rgba(107,216,203,0.35)" strokeWidth="1.2" className="face-mouth face-mouth-neutral"/>
                  <path d="M 48 74 Q 60 88 72 74" fill="none" stroke="rgba(52,211,153,0.7)" strokeWidth="1.4" strokeLinecap="round" className="face-mouth face-mouth-smile"/>

                  {/* Face mesh points */}
                  <g className="face-mesh">
                    <circle cx="48" cy="48" r="1.5" fill="rgba(107,216,203,0.5)" className="mesh-dot"/>
                    <circle cx="72" cy="48" r="1.5" fill="rgba(107,216,203,0.5)" className="mesh-dot"/>
                    <circle cx="60" cy="58" r="1.5" fill="rgba(107,216,203,0.5)" className="mesh-dot"/>
                    <circle cx="52" cy="65" r="1.5" fill="rgba(107,216,203,0.5)" className="mesh-dot"/>
                    <circle cx="68" cy="65" r="1.5" fill="rgba(107,216,203,0.5)" className="mesh-dot"/>
                    <circle cx="60" cy="75" r="1.5" fill="rgba(107,216,203,0.5)" className="mesh-dot"/>
                    <circle cx="40" cy="58" r="1.5" fill="rgba(107,216,203,0.5)" className="mesh-dot"/>
                    <circle cx="80" cy="58" r="1.5" fill="rgba(107,216,203,0.5)" className="mesh-dot"/>
                  </g>
                </g>

                {/* Scan line across face — scanner overlay, stays in frame */}
                <rect x="20" y="60" width="80" height="1.5" fill="rgba(107,216,203,0.8)" rx="0.75" className="scan-line"/>
                <rect x="20" y="58" width="80" height="5" fill="rgba(107,216,203,0.1)" rx="2.5" className="scan-glow"/>

                {/* Radar pulse */}
                <circle cx="60" cy="60" r="0" fill="none" stroke="rgba(107,216,203,0.3)" strokeWidth="1" className="radar-scan"/>
              </svg>
            </div>

            {/* Card info lines */}
            <div className="face-scan-card-info">
              <div className="face-scan-info-line short" />
              <div className="face-scan-info-line long" />
              <div className="face-scan-info-line medium" />
            </div>

            {/* Scan status indicator */}
            <div className="face-scan-card-footer">
              <div className={`face-scan-status-dot ${state === 'scanning' ? 'active' : state === 'verified' ? 'success' : state === 'failed' ? 'error' : 'idle'}`} />
              <span className="face-scan-card-footer-text">
                {state === 'scanning' ? 'Scanning...' : state === 'verified' ? 'Verified' : state === 'failed' ? 'Failed' : 'Ready'}
              </span>
            </div>
          </div>
        </div>
      </div>

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
