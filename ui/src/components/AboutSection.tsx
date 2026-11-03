import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { RELEASES, type Release } from '@/data/releases'

const muted = { fontSize: 13, color: 'var(--color-text-secondary)' }

function formatDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function ReleaseItem({ release, locale }: { release: Release; locale: 'id' | 'en' }) {
  const { t } = useI18n()
  const isCurrent = release.version === __APP_VERSION__
  return (
    <li style={{ padding: '10px 0', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {release.version && <strong>v{release.version}</strong>}
        <span style={muted}>{formatDate(release.date, locale)}</span>
        {isCurrent && <span className="badge badge-green">{t('about.current')}</span>}
      </div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
        {release.notes[locale].map((note) => <li key={note}>{note}</li>)}
      </ul>
    </li>
  )
}

/** Settings → About: what the app is, the running version, and a collapsible release history. */
export function AboutSection() {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="data-card" style={{ maxWidth: 640, marginTop: 16, padding: 20 }}>
      <h3 style={{ margin: '0 0 4px' }}>{t('about.title')}</h3>
      <p style={{ ...muted, margin: '0 0 12px' }}>{t('about.desc')}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
        <span style={muted}>{t('about.version')}</span>
        <span style={{ fontWeight: 500 }}>v{__APP_VERSION__}</span>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginTop: 8, paddingLeft: 0 }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="release-history"
      >
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {open ? t('about.hide_history') : t('about.show_history')}
      </button>
      {open && (
        <ul id="release-history" style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {RELEASES.map((r) => <ReleaseItem key={r.date} release={r} locale={locale} />)}
        </ul>
      )}
    </div>
  )
}
