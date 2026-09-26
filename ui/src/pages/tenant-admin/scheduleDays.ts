import { useI18n } from '@/store/i18nStore'
import type { DayHours, ScheduleRules } from '@/api/adminApi'

/** One editable weekday. Index 0 = Monday (ISO weekday 1) … 6 = Sunday (7). */
export interface DayRow {
  enabled: boolean
  start: string
  end: string
}

export const ISO_DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const

export type DayPreset = 'weekdays' | 'mon_sat' | 'daily'
const PRESET_DAYS: Record<DayPreset, number> = { weekdays: 5, mon_sat: 6, daily: 7 }

/**
 * Rows for the editor. Legacy schedules (flat hours, no day_hours) apply their
 * hours on every day in the backend, so they open with all seven days on —
 * saving one untouched must not change how it is evaluated.
 */
export function initDayRows(rules?: ScheduleRules): DayRow[] {
  const start = rules?.workday_start ?? '08:00'
  const end = rules?.workday_end ?? '17:00'
  if (!rules) return ISO_DAYS.map((_, i) => ({ enabled: i < 5, start, end }))
  return ISO_DAYS.map((d) => {
    if (!rules.day_hours) return { enabled: true, start, end }
    const h = rules.day_hours[d]
    return h ? { enabled: true, start: h.start, end: h.end } : { enabled: false, start, end }
  })
}

/** Turn on exactly the preset's days, keeping each row's hours. */
export function applyPreset(rows: DayRow[], preset: DayPreset): DayRow[] {
  return rows.map((r, i) => ({ ...r, enabled: i < PRESET_DAYS[preset] }))
}

export function matchingPreset(rows: DayRow[]): DayPreset | null {
  const n = rows.findIndex((r) => !r.enabled)
  const count = n === -1 ? 7 : n
  if (rows.slice(count).some((r) => r.enabled)) return null
  return (Object.keys(PRESET_DAYS) as DayPreset[]).find((p) => PRESET_DAYS[p] === count) ?? null
}

export function copyFirstToAll(rows: DayRow[]): DayRow[] {
  const first = rows.find((r) => r.enabled)
  if (!first) return rows
  return rows.map((r) => (r.enabled ? { ...r, start: first.start, end: first.end } : r))
}

function toMinutes(hhmm: string | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Worked minutes for a day, or null when end is not after start (overnight is unsupported). */
export function dayMinutes(start: string | undefined, end: string | undefined): number | null {
  const s = toMinutes(start)
  const e = toMinutes(end)
  return s === null || e === null || e <= s ? null : e - s
}

export function rowsValid(rows: DayRow[]): boolean {
  return rows.some((r) => r.enabled) && rows.every((r) => !r.enabled || dayMinutes(r.start, r.end) !== null)
}

export function weeklyMinutes(rows: DayRow[]): number {
  return rows.reduce((sum, r) => sum + (r.enabled ? dayMinutes(r.start, r.end) ?? 0 : 0), 0)
}

/**
 * Shift rules from the editor rows. The flat workday_start/end mirror the first
 * working day so consumers that only know flat hours still see something sane;
 * the backend uses day_hours whenever it is present.
 */
export function dayRowsToRules(rows: DayRow[]): ScheduleRules {
  const day_hours: Record<string, DayHours> = {}
  rows.forEach((r, i) => {
    if (r.enabled) day_hours[ISO_DAYS[i]] = { start: r.start, end: r.end }
  })
  const first = rows.find((r) => r.enabled)
  return { type: 'shift', day_hours, workday_start: first?.start, workday_end: first?.end }
}

/** What a shift schedule does on each weekday, as the backend evaluates it. */
export interface WeekCell {
  iso: string
  on: boolean
  start?: string
  end?: string
}

export function weekCells(rules: ScheduleRules): WeekCell[] {
  return ISO_DAYS.map((iso) => {
    if (!rules.day_hours) return { iso, on: true, start: rules.workday_start, end: rules.workday_end }
    const h = rules.day_hours[iso]
    return h ? { iso, on: true, start: h.start, end: h.end } : { iso, on: false }
  })
}

export function useScheduleFormat() {
  const { t } = useI18n()

  const duration = (minutes: number): string => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h && m) return t('schedules.duration_hm', { h, m })
    return h ? t('schedules.duration_h', { h }) : t('schedules.duration_m', { m })
  }

  /** "Sen – Jum" for a contiguous run of 3+, else "Sen, Rab, Jum". */
  const dayRange = (cells: WeekCell[]): string => {
    const active = cells.filter((c) => c.on).map((c) => Number(c.iso))
    if (active.length === 7) return t('schedules.every_day')
    if (active.length === 0) return t('schedules.no_workday_short')
    const contiguous = active.length > 2 && active[active.length - 1] - active[0] === active.length - 1
    return contiguous
      ? `${t(`schedules.day_${active[0]}`)} – ${t(`schedules.day_${active[active.length - 1]}`)}`
      : active.map((d) => t(`schedules.day_${d}`)).join(', ')
  }

  /** Card subtitle for a shift schedule: days · hours (or "hours vary"). */
  const shiftSummary = (cells: WeekCell[]): string => {
    const spans = new Set(cells.filter((c) => c.on).map((c) => `${c.start ?? '--:--'} – ${c.end ?? '--:--'}`))
    const hours = spans.size === 1 ? [...spans][0] : t('schedules.hours_vary')
    return `${dayRange(cells)} · ${hours}`
  }

  const weekly = (cells: WeekCell[]): string => {
    const total = cells.reduce((sum, c) => sum + (c.on ? dayMinutes(c.start, c.end) ?? 0 : 0), 0)
    return t('schedules.per_week', { duration: duration(total) })
  }

  return { duration, dayRange, shiftSummary, weekly }
}
