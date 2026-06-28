import { useEffect, useState } from 'react'
import { Sparkles, Keyboard, Search, LayoutDashboard } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/store/i18nStore'
import '@/styles/polish.css'

const STORAGE_KEY = 'netra.onboarding.seen.v1'

type Step = {
  icon: typeof Sparkles
  titleKey: string
  bodyKey: string
}

/**
 * First-time onboarding coachmarks. Shows a small carousel of tips once,
 * then persists "seen" in localStorage so it never reappears. Self-contained:
 * no dependency on other components or DOM anchors.
 */
const STEPS: Step[] = [
  {
    icon: LayoutDashboard,
    titleKey: 'onboarding.step1_title',
    bodyKey: 'onboarding.step1_body',
  },
  {
    icon: Search,
    titleKey: 'onboarding.step2_title',
    bodyKey: 'onboarding.step2_body',
  },
  {
    icon: Keyboard,
    titleKey: 'onboarding.step3_title',
    bodyKey: 'onboarding.step3_body',
  },
]

function hasSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return true // if storage is unavailable, don't nag the user
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function OnboardingTooltips() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  // Only coach signed-in users inside the app — never on the login/kiosk screens.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated && !hasSeen()) setVisible(true)
  }, [isAuthenticated])

  function dismiss() {
    markSeen()
    setVisible(false)
  }

  function next() {
    if (step >= STEPS.length - 1) {
      dismiss()
    } else {
      setStep((s) => s + 1)
    }
  }

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div
      className="ob-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.guide_label')}
    >
      <div className="ob-card">
        <div className="ob-illu" aria-hidden="true">
          <Icon size={28} strokeWidth={1.75} />
        </div>
        <h2 className="ob-title">{t(current.titleKey)}</h2>
        <p className="ob-body">{t(current.bodyKey)}</p>
        <div className="ob-footer">
          <div className="ob-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`ob-dot${i === step ? ' active' : ''}`} />
            ))}
          </div>
          <div className="ob-actions">
            {!isLast && (
              <button type="button" className="ob-skip" onClick={dismiss}>
                {t('onboarding.skip')}
              </button>
            )}
            <button type="button" className="ob-next" onClick={next}>
              {isLast ? t('onboarding.got_it') : t('onboarding.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
