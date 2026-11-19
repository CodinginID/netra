/**
 * Small presentational building blocks shared by the tenant "people" pages
 * (Status harian, Absensi, Pengguna). Styles live in styles/pages/people.css
 * under the `tp-` prefix.
 */
import { useRef, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, Search } from 'lucide-react'
import '@/styles/pages/people.css'

export type Tone = 'g' | 'w' | 'r' | 'b' | 'm'

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : parts[0][1] ?? ''
  return (first + last).toUpperCase()
}

export function localeTag(locale: string): string {
  return locale === 'en' ? 'en-GB' : 'id-ID'
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="tp-head">
      <div className="tp-head-text">
        <h2 className="tp-title">{title}</h2>
        {subtitle && <p className="tp-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="tp-head-actions">{actions}</div>}
    </div>
  )
}

export function Avatar({ name }: { name: string | null | undefined }) {
  return <span className="tp-avatar" aria-hidden="true">{initials(name)}</span>
}

export function Who({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <div className="tp-who">
      <Avatar name={name} />
      <div className="tp-who-text">
        <div className="tp-who-name">{name}</div>
        {sub && <div className="tp-who-sub">{sub}</div>}
      </div>
    </div>
  )
}

export function Chip({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return <span className={`tp-chip tp-tone-${tone}`} title={title}>{children}</span>
}

export function StatCard({
  label,
  value,
  tone,
  sub,
  active,
  onClick,
}: {
  label: string
  value: ReactNode
  tone: Tone
  sub?: string
  active?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="tp-stat-label">
        <span className={`tp-dot tp-tone-${tone}`} aria-hidden="true" />
        {label}
      </span>
      <span className="tp-stat-value">{value}</span>
      {sub && <span className="tp-stat-sub">{sub}</span>}
    </>
  )
  if (!onClick) return <div className="tp-stat">{body}</div>
  return (
    <button type="button" className={`tp-stat tp-stat--btn${active ? ' is-active' : ''}`} aria-pressed={!!active} onClick={onClick}>
      {body}
    </button>
  )
}

export function StatRow({ children, skeleton }: { children?: ReactNode; skeleton?: number }) {
  if (skeleton) {
    return (
      <div className="tp-stats">
        {Array.from({ length: skeleton }, (_, i) => (
          <div key={i} className="tp-stat">
            <div className="skeleton skeleton-text sm" />
            <div className="skeleton skeleton-text" style={{ width: '40%', height: 24, marginTop: 8 }} />
          </div>
        ))}
      </div>
    )
  }
  return <div className="tp-stats">{children}</div>
}

export interface PillItem<K extends string> {
  key: K
  label: string
  count?: number
  /** Hide this pill on phones (keeps the phone row short). */
  desktopOnly?: boolean
}

export function Pills<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: PillItem<K>[]
  value: K
  onChange: (key: K) => void
  label: string
}) {
  return (
    <div className="tp-pills" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`tp-pill${it.key === value ? ' is-active' : ''}${it.desktopOnly ? ' tp-desktop-only' : ''}`}
          aria-pressed={it.key === value}
          onClick={() => onChange(it.key)}
        >
          {it.label}
          {it.count != null && <span className="tp-pill-count">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
}) {
  return (
    <label className="tp-search">
      <Search size={15} aria-hidden="true" />
      <input type="search" value={value} placeholder={placeholder} aria-label={label} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/** Button-looking date control: shows a formatted date, opens the native picker. */
export function DateButton({
  value,
  onChange,
  label,
  text,
  small,
  max,
  min,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  text: string
  small?: boolean
  max?: string
  min?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <span className={`tp-date${small ? ' tp-date--sm' : ''}`}>
      <CalendarDays size={15} aria-hidden="true" />
      <span className="tp-date-text" aria-hidden="true">{text}</span>
      <ChevronDown size={14} aria-hidden="true" className="tp-date-caret" />
      <input
        ref={ref}
        type="date"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onClick={() => {
          try { ref.current?.showPicker?.() } catch { /* not supported — native focus still works */ }
        }}
        onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
      />
    </span>
  )
}

/** Plain-text CSV download built from rows already on screen. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
