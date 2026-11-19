import type { ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import * as api from '@/api/adminApi'
import { withTenantScope } from '@/api/adminApi'
import { queryKeys, useTenantScope } from '@/hooks/useApiQueries'
import { useAuthStore } from '@/store/authStore'
import '@/styles/pages/super-admin.css'

/** Mockup tone keys: g = success, w = warning, r = danger, b = brand, m = muted. */
export type Tone = 'g' | 'w' | 'r' | 'b' | 'm'

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`sa-chip sa-chip--${tone}`}>{children}</span>
}

/** Up to two initials from a display name ("PT Sinar Jaya" → "SJ"). */
export function initials(name: string): string {
  const words = name
    .replace(/^(pt|cv|ud|pd)\.?\s+/i, '')
    .split(/[\s\-_.]+/)
    .filter(Boolean)
  if (!words.length) return '?'
  const first = words[0][0] ?? ''
  const second = words.length > 1 ? words[1][0] : (words[0][1] ?? '')
  return (first + second).toUpperCase()
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`sa-av${className ? ` ${className}` : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function Who({ name, sub, mono }: { name: string; sub?: ReactNode; mono?: boolean }) {
  return (
    <div className="sa-who">
      <Avatar name={name} />
      <div className="sa-who-text">
        <div className="sa-who-name">{name}</div>
        {sub && <div className={`sa-who-sub${mono ? ' sa-mono' : ''}`}>{sub}</div>}
      </div>
    </div>
  )
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sa-head">
      <div>
        <h2>{title}</h2>
        {sub && <div className="sa-head-sub">{sub}</div>}
      </div>
      {actions && <div className="sa-head-actions">{actions}</div>}
    </div>
  )
}

interface StatTileProps {
  label: ReactNode
  value: ReactNode
  tone: Tone
  sub?: ReactNode
  onClick?: () => void
  ariaLabel?: string
}

/** A mockup stat tile: coloured dot + label, big number, optional sub line. */
export function StatTile({ label, value, tone, sub, onClick, ariaLabel }: StatTileProps) {
  const body = (
    <>
      <div className="sa-stat-label">
        <span className={`sa-dot sa-tone-${tone}`} aria-hidden="true" />
        {label}
      </div>
      <div className="sa-stat-value">{value}</div>
      {sub && <div className="sa-stat-sub">{sub}</div>}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className="sa-card sa-stat" onClick={onClick} aria-label={ariaLabel}>
        {body}
      </button>
    )
  }
  return <div className="sa-card sa-stat">{body}</div>
}

export interface PillOption<T extends string> {
  value: T
  label: string
  count?: number
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: PillOption<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className="sa-pills" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="sa-pill"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export interface DayBar {
  key: string
  label: string
  value: number
  caption: string
  today: boolean
}

/** Simple vertical bar chart — one bar per day, today highlighted. */
export function DayBars({ bars, max, ariaLabel }: { bars: DayBar[]; max: number; ariaLabel: string }) {
  const top = Math.max(max, 1)
  return (
    <div className="sa-bars" role="img" aria-label={ariaLabel}>
      {bars.map((b) => (
        <div key={b.key} className="sa-bar-col">
          <span className="sa-bar-val">{b.caption}</span>
          <div
            className={`sa-bar${b.today ? ' is-today' : ''}`}
            style={{ height: `${Math.round((b.value / top) * 100)}%` }}
          />
          <span className={`sa-bar-day${b.today ? ' is-today' : ''}`}>{b.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatCurrency(amount: number, currency: string = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

/** Local calendar date as YYYY-MM-DD (not UTC — "today" means the user's today). */
export function localDay(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function longToday(locale: string): string {
  return new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** The last `n` local days, oldest first (today last). */
export function lastDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return localDay(d)
  })
}

export function weekdayShort(day: string, locale: string): string {
  return new Date(`${day}T12:00`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'id-ID', { weekday: 'short' })
}

/**
 * Daily attendance recaps for several days, pinned to the current tenant scope
 * (shares the cache with `useDailyReport`). Failed days resolve to `undefined`.
 */
export function useDailyReports(days: string[]) {
  const token = useAuthStore((s) => s.accessToken)
  const tenantId = useTenantScope()
  return useQueries({
    queries: days.map((day) => ({
      queryKey: queryKeys.dailyReport(day, tenantId),
      queryFn: () => withTenantScope(tenantId, () => api.dailyReport(token!, day)),
      enabled: !!token,
      staleTime: 5 * 60_000,
    })),
  })
}

/** Unique people with at least one check-in in a daily recap. */
export function presentCount(recap: api.AttendanceRecap | undefined): number {
  if (!recap) return 0
  return recap.users.filter((u) => u.check_in > 0).length
}
