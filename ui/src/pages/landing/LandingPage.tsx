import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { useI18n, useI18nStore, type Locale } from '@/store/i18nStore'
import { submitDemoRequest } from '@/api/landingApi'
import { FaceOrb } from './FaceOrb'
import '@/styles/landing.css'

const FINE_POINTER = window.matchMedia('(pointer: fine)').matches
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 3D hover tilt for bento tiles (skipped on touch / reduced motion). */
function handleTilt(e: MouseEvent<HTMLDivElement>) {
  if (!FINE_POINTER || REDUCED_MOTION) return
  const tile = e.currentTarget
  const b = tile.getBoundingClientRect()
  const rx = ((e.clientY - b.top) / b.height - 0.5) * -6
  const ry = ((e.clientX - b.left) / b.width - 0.5) * 6
  tile.style.transform = `perspective(700px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-2px)`
}

function resetTilt(e: MouseEvent<HTMLDivElement>) {
  e.currentTarget.style.transform = ''
}

/** Public pricing cards. Only the entry-band price is shown — the full tier
 * grid lives in the billing tables and is negotiated per tenant.
 *
 * One card, not one per sector: the product bills on active users, so a school
 * and a factory are on the same terms and splitting them into "Education" and
 * "Business" implied a difference in the plans that never existed. */
const PLANS = [
  { id: 'std', feats: 6, mailto: 'mailto:hello@codingin.id?subject=Netra%20—%20Penawaran' },
] as const

/** Rows for the daily-status mock. Shapes mirror the real roster: initials,
 * name, check-in time, and one of the three statuses the backend produces. */
const ROSTER = [
  { initials: 'BS', name: 'Budi Santoso', time: '07:58', status: 'ok' },
  { initials: 'SW', name: 'Sari Wijaya', time: '07:59', status: 'ok' },
  { initials: 'AP', name: 'Andi Pratama', time: '08:14', status: 'late' },
  { initials: 'RN', name: 'Rina Novita', time: '08:02', status: 'ok' },
  { initials: 'DH', name: 'Dedi Hermawan', time: '—', status: 'off' },
] as const

/**
 * Social-proof figures. Intentionally empty: the band renders only once real,
 * verifiable numbers are supplied. Never ship invented customer counts.
 */
const PROOF: { n: string; key: string }[] = []

/** True once the element has scrolled into view. Resolves immediately (and
 * skips the observer entirely) when the visitor asked for reduced motion. */
function useInView(ref: { current: Element | null }) {
  const [inView, setInView] = useState(REDUCED_MOTION)
  useEffect(() => {
    if (REDUCED_MOTION) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.25 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return inView
}

/** Counts up to `to` on mount; renders the final value outright when motion
 * is reduced. */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(REDUCED_MOTION ? to : 0)
  useEffect(() => {
    if (REDUCED_MOTION) return
    let raf = 0
    const started = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / 1100)
      setN(Math.round(to * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{n}</>
}

const FEED_NAMES = ['Budi S.', 'Sari W.', 'Andi P.', 'Rina N.', 'Dedi H.', 'Maya K.', 'Tono W.', 'Lina S.']
const FEED_DEVICES = ['Kiosk Lobby-1', 'Kiosk Lobby-2', 'Gate-1', 'Gate-2']
const FEED_ROWS = 4
const FEED_START = 7 * 3600 + 58 * 60 + 41 // 07:58:41

function clock(totalSeconds: number) {
  const parts = [Math.floor(totalSeconds / 3600) % 24, Math.floor(totalSeconds / 60) % 60, totalSeconds % 60]
  return parts.map((n) => String(n).padStart(2, '0')).join(':')
}

function feedRow(seq: number) {
  return {
    seq,
    ts: FEED_START + seq * 13,
    name: FEED_NAMES[seq % FEED_NAMES.length],
    device: FEED_DEVICES[seq % FEED_DEVICES.length],
  }
}

/** The attendance feed actually streams: a new match is prepended every few
 * seconds while the panel is on screen. Idle when off-screen or backgrounded. */
function LiveFeed() {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const [rows, setRows] = useState(() =>
    Array.from({ length: FEED_ROWS }, (_, i) => feedRow(FEED_ROWS - 1 - i))
  )

  useEffect(() => {
    if (REDUCED_MOTION || !inView) return
    let seq = FEED_ROWS
    const id = window.setInterval(() => {
      if (document.hidden) return
      // Built outside the updater: React invokes updaters twice in StrictMode,
      // so advancing `seq` in there would double the feed's rate.
      const next = feedRow(seq++)
      setRows((prev) => [next, ...prev].slice(0, FEED_ROWS))
    }, 2500)
    return () => window.clearInterval(id)
  }, [inView])

  return (
    <div className="lp-feed" ref={ref} aria-hidden>
      <div className="lp-feed-bar">
        <span className="lp-feed-live">{t('landing.feed_live')}</span>
        <span>netra · realtime</span>
      </div>
      <div className="lp-feed-rows">
        {rows.map((row, i) => (
          <div className="lp-feed-row" data-pos={i} key={row.seq}>
            <span className="ts">{clock(row.ts)}</span>
            <span className="ok">✓ MATCH</span>
            <span>{row.name} — {t('landing.feed_in')} · {row.device}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Daily-status mock. Rows land one by one on scroll-in, then the last person
 * checks in — the dashboard updating without a refresh. */
function RosterPanel() {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)
  const [arrived, setArrived] = useState(REDUCED_MOTION)

  useEffect(() => {
    if (REDUCED_MOTION || !inView || arrived) return
    const id = window.setTimeout(() => setArrived(true), 1800)
    return () => window.clearTimeout(id)
  }, [inView, arrived])

  return (
    <div className="lp-panel" ref={ref} aria-hidden>
      <div className="lp-panel-bar">
        <span><b>{t('landing.sc_panel_t')}</b></span>
        <span>{t('landing.sc_panel_meta')}</span>
      </div>
      <div className="lp-panel-rows">
        {ROSTER.map((row, i) => {
          const last = i === ROSTER.length - 1
          const status = last && arrived ? 'ok' : row.status
          const time = last && arrived ? '08:21' : row.time
          const classes = [
            'lp-prow',
            inView && !REDUCED_MOTION ? 'lp-prow-in' : '',
            last && arrived && !REDUCED_MOTION ? 'lp-prow-flash' : '',
          ]
          return (
            <div
              className={classes.filter(Boolean).join(' ')}
              key={row.initials}
              style={inView && !REDUCED_MOTION ? { animationDelay: `${i * 90}ms` } : undefined}
            >
              <span className="lp-avatar">{row.initials}</span>
              <span>{row.name}</span>
              <span className="lp-prow-time">{time}</span>
              <span className={`lp-pill lp-pill-${status}`}>{t(`landing.sc_status_${status}`)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Demo request form — replaces the old mailto CTA. Submissions land in the
 * super admin dashboard for manual follow-up; nothing is emailed automatically. */
function DemoRequestForm() {
  const { t } = useI18n()
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const organization = String(form.get('organization') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()
    const message = String(form.get('message') ?? '').trim()

    setStatus('submitting')
    setError('')
    try {
      await submitDemoRequest({
        name,
        organization,
        email,
        phone: phone || undefined,
        message: message || undefined,
      })
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (status === 'success') {
    return <p className="lp-form-success">{t('landing.form_success')}</p>
  }

  return (
    <form className="lp-form" onSubmit={handleSubmit}>
      <div className="lp-form-row">
        <input name="name" type="text" required placeholder={t('landing.form_name')} />
        <input name="organization" type="text" required placeholder={t('landing.form_org')} />
      </div>
      <div className="lp-form-row">
        <input name="email" type="email" required placeholder={t('landing.form_email')} />
        <input name="phone" type="tel" placeholder={t('landing.form_phone')} />
      </div>
      <textarea name="message" rows={3} placeholder={t('landing.form_message')} />
      {status === 'error' && <p className="lp-form-error">{error}</p>}
      <button type="submit" className="lp-btn lp-btn-primary lp-btn-lg" disabled={status === 'submitting'}>
        {status === 'submitting' ? t('landing.form_sending') : t('landing.cta')}
      </button>
    </form>
  )
}

export function LandingPage() {
  const { t, locale, setLocale } = useI18n()

  // The landing defaults to English for first-time visitors; returning
  // visitors keep whatever locale they picked (persisted by i18nStore).
  useEffect(() => {
    if (!localStorage.getItem('netra-i18n')) {
      useI18nStore.getState().setLocale('en')
    }
  }, [])

  useEffect(() => {
    document.title = 'Netra — ' + t('landing.doc_title')
  }, [locale, t])

  // Scroll-reveal: below-the-fold cards drift up as they enter the viewport.
  useEffect(() => {
    if (REDUCED_MOTION) return
    const els = document.querySelectorAll<HTMLElement>(
      '.lp-stat, .lp-tile, .lp-step, .lp-feed, .lp-price, .lp-panel, .lp-ctaband'
    )
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((el, i) => {
      el.classList.add('lp-reveal')
      el.style.transitionDelay = `${(i % 3) * 70}ms`
      io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  const langBtn = (lang: Locale) => (
    <button
      type="button"
      className={`lp-lang-btn${locale === lang ? ' active' : ''}`}
      onClick={() => setLocale(lang)}
    >
      {lang.toUpperCase()}
    </button>
  )

  return (
    <div className="lp">
      <div className="lp-grid-bg" aria-hidden />

      <nav className="lp-nav">
        <div className="lp-logo">
          <Eye size={22} strokeWidth={2.5} />
          <span>netra</span>
        </div>
        <div className="lp-links">
          <a href="#features">{t('landing.nav_features')}</a>
          <a href="#how">{t('landing.nav_how')}</a>
          <a href="#pricing">{t('landing.nav_pricing')}</a>
          <a href="/docs/">{t('landing.nav_docs')}</a>
        </div>
        <div className="lp-actions">
          <div className="lp-lang-switch" role="group" aria-label="Language">
            {langBtn('en')}
            {langBtn('id')}
          </div>
          <Link to="/login" className="lp-btn lp-btn-ghost">{t('landing.sign_in')}</Link>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-hero-glow" aria-hidden />
        <div className="lp-hero-copy lp-fade" key={`hero-${locale}`}>
          <span className="lp-badge">
            <span className="lp-pulse" aria-hidden />
            {t('landing.badge')}
          </span>
          <h1>
            {t('landing.hero_pre')} <em>{t('landing.hero_em')}</em>
          </h1>
          <p>{t('landing.hero_p')}</p>
          <div className="lp-cta">
            <a href="#contact" className="lp-btn lp-btn-primary lp-btn-lg">{t('landing.cta')}</a>
          </div>
          <p className="lp-cta-note">{t('landing.cta_note')}</p>
        </div>
        <div className="lp-orb-wrap">
          <FaceOrb />
          <div className="lp-chip lp-chip-ok">
            <span className="lp-led" aria-hidden />
            <span>Budi — <b>{t('landing.chip_present')}</b></span>
            <b>07:58</b>
          </div>
          <div className="lp-chip lp-chip-count">
            <span><b><CountUp to={142} /></b> {t('landing.chip_count')}</span>
          </div>
        </div>
      </header>

      <section className="lp-stats lp-fade" key={`stats-${locale}`}>
        <div className="lp-stat">
          <div className="lp-stat-t">&lt; 1<span>s</span></div>
          <div className="lp-stat-d">{t('landing.stat1')}</div>
        </div>
        <div className="lp-stat">
          <div className="lp-stat-t"><span>∞</span> {t('landing.stat2_unit')}</div>
          <div className="lp-stat-d">{t('landing.stat2')}</div>
        </div>
        <div className="lp-stat">
          <div className="lp-stat-t">24<span>/7</span></div>
          <div className="lp-stat-d">{t('landing.stat3')}</div>
        </div>
      </section>

      {PROOF.length > 0 && (
        <section className="lp-proof lp-fade" key={`proof-${locale}`}>
          <p className="lp-proof-label">{t('landing.proof_label')}</p>
          <div className="lp-proof-items">
            {PROOF.map((item) => (
              <div className="lp-proof-item" key={item.key}>
                <span className="lp-proof-n">{item.n}</span>
                <span className="lp-proof-d">{t(item.key)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="lp-section lp-fade" id="features" key={`feat-${locale}`}>
        <p className="lp-eyebrow">{t('landing.feat_eyebrow')}</p>
        <h2>{t('landing.feat_h')}</h2>
        <p className="lp-section-sub">{t('landing.feat_sub')}</p>
        <div className="lp-bento">
          <div className="lp-tile lp-tile-wide" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="lp-ic" aria-hidden>◉</div>
            <div className="lp-tile-t">{t('landing.f1t')}</div>
            <div className="lp-tile-d">{t('landing.f1d')}</div>
            <div className="lp-pose-row" aria-hidden>
              <div className="lp-pose done"><span>◉</span>{t('landing.pose_front')} ✓</div>
              <div className="lp-pose done"><span>◐</span>{t('landing.pose_left')} ✓</div>
              <div className="lp-pose"><span>◑</span>{t('landing.pose_right')}…</div>
            </div>
          </div>
          <div className="lp-tile" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="lp-ic" aria-hidden>▣</div>
            <div className="lp-tile-t">{t('landing.f2t')}</div>
            <div className="lp-tile-d">{t('landing.f2d')}</div>
          </div>
          <div className="lp-tile" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="lp-ic" aria-hidden>⧉</div>
            <div className="lp-tile-t">{t('landing.f3t')}</div>
            <div className="lp-tile-d">{t('landing.f3d')}</div>
          </div>
          <div className="lp-tile" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="lp-ic" aria-hidden>≡</div>
            <div className="lp-tile-t">{t('landing.f4t')}</div>
            <div className="lp-tile-d">{t('landing.f4d')}</div>
          </div>
          <div className="lp-tile" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="lp-ic" aria-hidden>⇄</div>
            <div className="lp-tile-t">{t('landing.f5t')}</div>
            <div className="lp-tile-d">{t('landing.f5d')}</div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-fade" id="product" key={`prod-${locale}`}>
        <div className="lp-showcase">
          <div className="lp-showcase-copy">
            <p className="lp-eyebrow">{t('landing.sc_eyebrow')}</p>
            <h2>{t('landing.sc_h')}</h2>
            <p className="lp-section-sub">{t('landing.sc_sub')}</p>
            <ul className="lp-showcase-list">
              <li>{t('landing.sc_l1')}</li>
              <li>{t('landing.sc_l2')}</li>
              <li>{t('landing.sc_l3')}</li>
            </ul>
          </div>

          <RosterPanel />
        </div>
      </section>

      <section className="lp-section lp-fade" id="how" key={`how-${locale}`}>
        <p className="lp-eyebrow">{t('landing.how_eyebrow')}</p>
        <h2>{t('landing.how_h')}</h2>
        <p className="lp-section-sub">{t('landing.how_sub')}</p>
        <div className="lp-steps">
          <div className="lp-step">
            <div className="lp-step-t">{t('landing.st1t')}</div>
            <div className="lp-step-d">{t('landing.st1d')}</div>
          </div>
          <div className="lp-step">
            <div className="lp-step-t">{t('landing.st2t')}</div>
            <div className="lp-step-d">{t('landing.st2d')}</div>
          </div>
          <div className="lp-step">
            <div className="lp-step-t">{t('landing.st3t')}</div>
            <div className="lp-step-d">{t('landing.st3d')}</div>
          </div>
        </div>

        <LiveFeed />
      </section>

      <section className="lp-section lp-fade" id="pricing" key={`price-${locale}`}>
        <p className="lp-eyebrow">{t('landing.pr_eyebrow')}</p>
        <h2>{t('landing.pr_h')}</h2>
        <p className="lp-section-sub">{t('landing.pr_sub')}</p>

        <div className="lp-prices">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className="lp-price"
              onMouseMove={handleTilt}
              onMouseLeave={resetTilt}
            >
              <div className="lp-price-t">{t(`landing.pr_${plan.id}_t`)}</div>
              <div className="lp-price-d">{t(`landing.pr_${plan.id}_d`)}</div>
              <div className="lp-price-from">{t('landing.pr_from')}</div>
              <div className="lp-price-amt">
                {t(`landing.pr_${plan.id}_amt`)}
                <span>{t(`landing.pr_${plan.id}_unit`)}</span>
              </div>
              <ul className="lp-price-feats">
                {Array.from({ length: plan.feats }, (_, i) => i + 1).map((n) => (
                  <li key={n}>{t(`landing.pr_${plan.id}_f${n}`)}</li>
                ))}
              </ul>
              <a href={plan.mailto} className="lp-btn lp-btn-primary">
                {t('landing.pr_cta')}
              </a>
            </div>
          ))}
        </div>

        <p className="lp-price-note">{t('landing.pr_note')}</p>
        <p className="lp-price-note">{t('landing.pr_addon')}</p>
      </section>

      <section className="lp-ctaband lp-fade" id="contact" key={`cta-${locale}`}>
        <p className="lp-ctaband-t">{t('landing.band_h')}</p>
        <p className="lp-ctaband-d">{t('landing.band_d')}</p>
        <DemoRequestForm />
      </section>

      <footer className="lp-footer">
        <span>© 2026 Netra — CodingIn.ID</span>
        <span className="lp-footer-links">
          <a href="/docs/">{t('landing.nav_docs')}</a>
          <Link to="/login">{t('landing.sign_in')}</Link>
        </span>
      </footer>
    </div>
  )
}
