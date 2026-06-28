import { useEffect, useState } from 'react'
import { Sparkles, Keyboard, Search, LayoutDashboard } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import '@/styles/polish.css'

const STORAGE_KEY = 'netra.onboarding.seen.v1'

type Step = {
  icon: typeof Sparkles
  title: string
  body: string
}

/**
 * First-time onboarding coachmarks. Shows a small carousel of tips once,
 * then persists "seen" in localStorage so it never reappears. Self-contained:
 * no dependency on other components or DOM anchors.
 */
const STEPS: Step[] = [
  {
    icon: LayoutDashboard,
    title: 'Selamat datang di Netra',
    body: 'Kelola kehadiran berbasis pengenalan wajah dari satu dasbor. Mari kenali beberapa hal cepat.',
  },
  {
    icon: Search,
    title: 'Cari & filter di mana saja',
    body: 'Setiap halaman daftar punya pencarian dan filter di bagian atas untuk menemukan data dengan cepat.',
  },
  {
    icon: Keyboard,
    title: 'Pintasan keyboard',
    body: 'Tekan tanda tanya (?) kapan saja untuk melihat daftar pintasan keyboard yang tersedia.',
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
      aria-label="Panduan pengenalan"
    >
      <div className="ob-card">
        <div className="ob-illu" aria-hidden="true">
          <Icon size={28} strokeWidth={1.75} />
        </div>
        <h2 className="ob-title">{current.title}</h2>
        <p className="ob-body">{current.body}</p>
        <div className="ob-footer">
          <div className="ob-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`ob-dot${i === step ? ' active' : ''}`} />
            ))}
          </div>
          <div className="ob-actions">
            {!isLast && (
              <button type="button" className="ob-skip" onClick={dismiss}>
                Lewati
              </button>
            )}
            <button type="button" className="ob-next" onClick={next}>
              {isLast ? 'Mengerti' : 'Lanjut'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
