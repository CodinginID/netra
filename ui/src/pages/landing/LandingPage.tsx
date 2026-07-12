import { useEffect, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { useI18n, useI18nStore, type Locale } from '@/store/i18nStore'
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
            <span><b>142</b> {t('landing.chip_count')}</span>
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

        <div className="lp-feed" aria-hidden>
          <div className="lp-feed-bar">
            <span className="lp-feed-live">{t('landing.feed_live')}</span>
            <span>netra · realtime</span>
          </div>
          <div className="lp-feed-rows">
            <div className="lp-feed-row"><span className="ts">07:58:41</span><span className="ok">✓ MATCH</span><span>Budi S. — {t('landing.feed_in')} · Kiosk Lobby-1</span></div>
            <div className="lp-feed-row dim"><span className="ts">07:58:12</span><span className="ok">✓ MATCH</span><span>Sari W. — {t('landing.feed_in')} · Kiosk Lobby-1</span></div>
            <div className="lp-feed-row dimmer"><span className="ts">07:57:49</span><span className="ok">✓ MATCH</span><span>Andi P. — {t('landing.feed_in')} · Gate-2</span></div>
          </div>
        </div>
      </section>

      <section className="lp-ctaband lp-fade" id="contact" key={`cta-${locale}`}>
        <p className="lp-ctaband-t">{t('landing.band_h')}</p>
        <p className="lp-ctaband-d">{t('landing.band_d')}</p>
        <a href="mailto:hello@codingin.id?subject=Netra%20Demo" className="lp-btn lp-btn-primary lp-btn-lg">
          {t('landing.cta')}
        </a>
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
