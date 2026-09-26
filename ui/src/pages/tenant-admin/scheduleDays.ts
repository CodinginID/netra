import { useI18n } from '@/store/i18nStore'
import type { DayHours, ScheduleRules, SessionRule } from '@/api/adminApi'

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

export const PRESETS: DayPreset[] = ['weekdays', 'mon_sat', 'daily']

/** Which weekdays (Mon first) a preset turns on. */
export function presetDays(preset: DayPreset): boolean[] {
  return ISO_DAYS.map((_, i) => i < PRESET_DAYS[preset])
}

export function matchingPresetDays(days: boolean[]): DayPreset | null {
  return PRESETS.find((p) => presetDays(p).every((on, i) => on === days[i])) ?? null
}

/** Turn on exactly the preset's days, keeping each row's hours. */
export function applyPreset(rows: DayRow[], preset: DayPreset): DayRow[] {
  const days = presetDays(preset)
  return rows.map((r, i) => ({ ...r, enabled: days[i] }))
}

export function matchingPreset(rows: DayRow[]): DayPreset | null {
  return matchingPresetDays(rows.map((r) => r.enabled))
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

// ── Session schedules ──────────────────────────────────────────────────────

/** Editor state for a session schedule. `perDay[i]` is used only when `sameEveryDay` is off. */
export interface SessionPlan {
  days: boolean[]
  sameEveryDay: boolean
  common: SessionRule[]
  perDay: SessionRule[][]
}

const DEFAULT_SESSIONS: SessionRule[] = [{ name: 'Sesi 1', start: '07:30', end: '09:00' }]
const cloneSessions = (s: SessionRule[]) => s.map((x) => ({ ...x }))
const sameSessions = (a: SessionRule[], b: SessionRule[]) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Plan for the editor. Legacy session rules (flat `sessions`, no day_sessions)
 * apply every day in the backend, so they open with all seven days on.
 */
export function initSessionPlan(rules?: ScheduleRules): SessionPlan {
  const flat = rules?.sessions?.length ? rules.sessions : DEFAULT_SESSIONS
  const ds = rules?.day_sessions
  if (!ds) {
    return {
      days: ISO_DAYS.map((_, i) => (rules?.type === 'session' ? true : i < 5)),
      sameEveryDay: true,
      common: cloneSessions(flat),
      perDay: ISO_DAYS.map(() => cloneSessions(flat)),
    }
  }
  const days = ISO_DAYS.map((d) => !!ds[d]?.length)
  const firstList = ISO_DAYS.map((d) => ds[d]).find((l) => l?.length) ?? flat
  const perDay = ISO_DAYS.map((d) => cloneSessions(ds[d]?.length ? ds[d] : firstList))
  const lists = ISO_DAYS.filter((_, i) => days[i]).map((d) => ds[d])
  return {
    days,
    sameEveryDay: lists.every((l) => sameSessions(l, lists[0])),
    common: cloneSessions(firstList),
    perDay,
  }
}

export function sessionsOn(plan: SessionPlan, dayIndex: number): SessionRule[] {
  return plan.sameEveryDay ? plan.common : plan.perDay[dayIndex]
}

export function sessionPlanValid(plan: SessionPlan): boolean {
  const lists = plan.days.map((on, i) => (on ? sessionsOn(plan, i) : null)).filter((l): l is SessionRule[] => !!l)
  return lists.length > 0 && lists.every((l) =>
    l.length > 0 && l.every((s) => s.name.trim() && dayMinutes(s.start, s.end) !== null))
}

/** Session rules: day_sessions per working day, plus flat `sessions` (first day) for old readers. */
export function sessionPlanToRules(plan: SessionPlan): ScheduleRules {
  const day_sessions: Record<string, SessionRule[]> = {}
  plan.days.forEach((on, i) => {
    if (on) day_sessions[ISO_DAYS[i]] = cloneSessions(sessionsOn(plan, i))
  })
  const first = Object.values(day_sessions)[0] ?? []
  return { type: 'session', day_sessions, sessions: first }
}

/** Sessions per weekday as the backend evaluates them; null = day off. */
export function sessionDayLists(rules: ScheduleRules): (SessionRule[] | null)[] {
  return ISO_DAYS.map((d) => {
    if (!rules.day_sessions) return rules.sessions ?? []
    return rules.day_sessions[d]?.length ? rules.day_sessions[d] : null
  })
}

/** What a shift schedule does on each weekday, as the backend evaluates it. */
export interface WeekCell {
  iso: string
  on: boolean
  start?: string
  end?: string
}

export function weekCells(rules: ScheduleRules): WeekCell[] {
  if (rules.type === 'session') {
    // A session day spans its first start to its last end.
    return sessionDayLists(rules).map((list, i) => (list === null
      ? { iso: ISO_DAYS[i], on: false }
      : { iso: ISO_DAYS[i], on: true, start: list[0]?.start, end: list[list.length - 1]?.end }))
  }
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
