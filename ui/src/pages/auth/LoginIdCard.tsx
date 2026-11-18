import { useI18n } from '@/store/i18nStore'

/**
 * Visual state of the ID card, mapped from the real login flow:
 * - idle  : waiting for input (step 1 or step 2)
 * - email : checking the email (step 1 submitted)
 * - auth  : verifying the password (step 2 submitted) — the only state with a moving scan line
 * - ok    : login succeeded, about to redirect (one-shot pop)
 * - fail  : login failed (one-shot shake)
 */
export type CardState = 'idle' | 'email' | 'auth' | 'ok' | 'fail'

export function cardLabels(state: CardState, step: 1 | 2): [string, string] {
  switch (state) {
    case 'email': return ['login.card_email', 'login.card_email_hint']
    case 'auth': return ['login.card_auth', 'login.card_auth_hint']
    case 'ok': return ['login.card_ok', 'login.card_ok_hint']
    case 'fail': return ['login.card_fail', 'login.card_fail_hint']
    default: return ['login.card_idle', step === 1 ? 'login.card_idle_hint' : 'login.card_idle_hint_password']
  }
}

const MOUTH: Record<CardState, string> = {
  idle: 'M50 81 Q60 86 70 81',
  email: 'M50 81 Q60 86 70 81',
  auth: 'M50 81 Q60 86 70 81',
  ok: 'M47 80 Q60 92 73 80',
  fail: 'M50 84 Q60 78 70 84',
}

export function LoginIdCard({ state, step }: { state: CardState; step: 1 | 2 }) {
  const { t } = useI18n()
  const [title, hint] = cardLabels(state, step)
  const eyeRy = state === 'ok' ? 2 : 4
  const scan = state === 'email' || state === 'auth'

  return (
    <div className={`login-idc-wrap is-${state}`}>
      <div className="login-idc-scale">
        <div className="login-idc" aria-hidden="true">
          <div className="login-idc-head">
            <span className="login-idc-chip" />
            <span className="login-idc-label">NETRA</span>
          </div>
          <svg viewBox="0 0 120 110" className="login-idc-face">
            <ellipse className="login-idc-outline" cx="60" cy="56" rx="30" ry="38" fill="rgba(94,234,212,.06)" stroke="currentColor" strokeWidth="1.4" />
            <ellipse cx="48" cy="50" rx="6" ry={eyeRy} fill="none" stroke="currentColor" strokeWidth="1.2" />
            <ellipse cx="72" cy="50" rx="6" ry={eyeRy} fill="none" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="48" cy="50" r="1.8" fill="currentColor" />
            <circle cx="72" cy="50" r="1.8" fill="currentColor" />
            <path d="M55 59 L60 67 L65 59" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.1" />
            <path d={MOUTH[state]} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            {scan && (
              <g className="login-idc-scan">
                <rect x="26" y="38" width="68" height="12" fill="#5eead4" fillOpacity=".14" />
                <rect x="26" y="43" width="68" height="1.6" rx=".8" fill="#5eead4" />
              </g>
            )}
          </svg>
          <div className="login-idc-lines">
            <span style={{ width: '45%' }} />
            <span style={{ width: '80%' }} />
          </div>
          <div className="login-idc-foot">
            <span className="login-idc-dot" />
            {t(title)}
          </div>
        </div>
      </div>

      <div className="login-idc-badge" role="status" aria-live="polite">
        <span className="login-idc-pill">
          <span className="login-idc-dot" />
          {t(title)}
        </span>
        <span className="login-idc-hint">{t(hint)}</span>
      </div>
    </div>
  )
}
