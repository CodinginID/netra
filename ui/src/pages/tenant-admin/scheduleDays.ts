import { useI18n } from '@/store/i18nStore'
import type { DayHours, ScheduleRules } from '@/api/adminApi'

/** One editable weekday. Index 0 = Monday (ISO weekday 1) … 6 = Sunday (7). */
export interface DayRow {
  enabled: boolean
  start: string
  end: string
}

export const ISO_DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const

/** Rows for the editor. Legacy schedules (flat hours only) open as Mon–Fri. */
export function initDayRows(rules?: ScheduleRules): DayRow[] {
  const start = rules?.workday_start ?? '08:00'
  const end = rules?.workday_end ?? '17:00'
  return ISO_DAYS.map((d, i) => {
    if (rules?.day_hours) {
      const h = rules.day_hours[d]
      return h ? { enabled: true, start: h.start, end: h.end } : { enabled: false, start, end }
    }
    return { enabled: i < 5, start, end }
  })
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

/** List-row summary: working days and hours ("Sen–Jum" / "08:00 – 17:00"). */
export function useDaySummary() {
  const { t } = useI18n()
  return (rules: ScheduleRules): { days: string; hours: string } => {
    if (!rules.day_hours) {
      return {
        days: t('schedules.work_days'),
        hours: `${rules.workday_start ?? '--:--'} – ${rules.workday_end ?? '--:--'}`,
      }
    }
    const active = ISO_DAYS.filter((d) => rules.day_hours?.[d])
    const contiguous = active.length > 2
      && Number(active[active.length - 1]) - Number(active[0]) === active.length - 1
    const days = contiguous
      ? `${t(`schedules.day_${active[0]}`)} – ${t(`schedules.day_${active[active.length - 1]}`)}`
      : active.map((d) => t(`schedules.day_${d}`)).join(', ')
    const spans = new Set(active.map((d) => `${rules.day_hours![d].start} – ${rules.day_hours![d].end}`))
    const hours = spans.size === 1 ? [...spans][0] : t('schedules.hours_vary')
    return { days, hours }
  }
}
