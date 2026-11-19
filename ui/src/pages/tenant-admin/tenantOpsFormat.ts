/** Small date helpers shared by the Perangkat / Integrasi / Billing / Tempat sampah pages. */

const DAY = 86_400_000

function tag(locale: string): string {
  return locale === 'en' ? 'en-US' : 'id-ID'
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "5 menit lalu" / "kemarin" / "3 minggu lalu"; null when the value is missing or invalid. */
export function relativeTime(value: string | null | undefined, locale: string, now = Date.now()): string | null {
  const d = parse(value)
  if (!d) return null
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' })
  const diff = d.getTime() - now
  const abs = Math.abs(diff)
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60_000, 'second'],
    [3_600_000, 'minute'],
    [DAY, 'hour'],
    [7 * DAY, 'day'],
    [30 * DAY, 'week'],
    [365 * DAY, 'month'],
  ]
  const units: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: DAY, week: 7 * DAY, month: 30 * DAY }
  for (const [limit, unit] of steps) {
    if (abs < limit) return rtf.format(Math.round(diff / units[unit]), unit)
  }
  return rtf.format(Math.round(diff / (365 * DAY)), 'year')
}

/** "12 Feb 2027" */
export function shortDate(value: string | null | undefined, locale: string): string | null {
  const d = parse(value)
  return d ? d.toLocaleDateString(tag(locale), { day: 'numeric', month: 'short', year: 'numeric' }) : null
}

/** "Nov 2026" */
export function monthYear(value: string | null | undefined, locale: string): string | null {
  const d = parse(value)
  return d ? d.toLocaleDateString(tag(locale), { month: 'short', year: 'numeric' }) : null
}

/** Whole days from now until `value` (negative when already past); null when missing. */
export function daysUntil(value: string | null | undefined, now = Date.now()): number | null {
  const d = parse(value)
  return d ? Math.ceil((d.getTime() - now) / DAY) : null
}

/** Two-letter initials for an avatar. */
export function initialsOf(name: string): string {
  const parts = name.split(/[\s._@-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}
