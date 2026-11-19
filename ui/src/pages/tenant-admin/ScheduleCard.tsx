import { Edit2, Star, Trash2 } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { ScheduleOut } from '@/api/adminApi'
import { ActionMenu, type ActionMenuItem } from '@/components/ActionMenu'
import { sessionDayLists, useScheduleFormat, weekCells, type WeekCell } from './scheduleDays'

export function ScheduleCard({ schedule: s, onEdit, onDelete, onMakeDefault }: {
  schedule: ScheduleOut
  onEdit: () => void
  onDelete: () => void
  onMakeDefault: () => void
}) {
  const { t } = useI18n()
  const fmt = useScheduleFormat()
  const isSession = s.rules.type === 'session'
  const cells = weekCells(s.rules)
  // Session lists of the working days; one shared list when they are all equal.
  const dayLists = isSession ? sessionDayLists(s.rules).filter((l) => l !== null) : []
  const uniform = dayLists.every((l) => JSON.stringify(l) === JSON.stringify(dayLists[0]))
  const sessions = uniform ? dayLists[0] ?? [] : []

  const spans = new Set(cells.filter((c) => c.on).map((c) => `${c.start ?? '--:--'} – ${c.end ?? '--:--'}`))
  const headline = isSession
    ? (uniform ? t('schedules.sessions_per_day', { count: sessions.length }) : t('schedules.sessions_vary'))
    : spans.size === 1 ? [...spans][0] : t('schedules.hours_vary')

  const offCells: WeekCell[] = cells.map((c) => ({ ...c, on: !c.on }))
  const hasOff = cells.some((c) => !c.on) && cells.some((c) => c.on)
  const daysLine = hasOff
    ? `${fmt.dayRange(cells)} · ${t('schedules.days_off', { days: fmt.dayRange(offCells) })}`
    : fmt.dayRange(cells)

  const items: ActionMenuItem[] = [
    { key: 'edit', label: t('common.edit'), icon: <Edit2 size={15} />, onSelect: onEdit },
  ]
  if (!s.is_default) {
    items.push({ key: 'default', label: t('schedules.make_default'), icon: <Star size={15} />, onSelect: onMakeDefault })
  }
  items.push({ key: 'delete', label: t('common.delete'), icon: <Trash2 size={15} />, danger: true, separatorBefore: true, onSelect: onDelete })

  return (
    <article className="ops-card sc-card" aria-labelledby={`sc-${s.id}`}>
      <div className="sc-head">
        <div className="sc-head-main">
          <div className="sc-title-row">
            <h3 id={`sc-${s.id}`} className="sc-name">{s.name}</h3>
            {s.is_default && <span className="ops-chip ops-chip--b">{t('schedules.status_default')}</span>}
          </div>
          <span className="sc-type">{isSession ? t('schedules.type_session_long') : t('schedules.type_shift_long')}</span>
        </div>
        <ActionMenu label={t('schedules.actions', { name: s.name })} items={items} />
      </div>

      <button type="button" className="sc-body" onClick={onEdit} aria-label={`${t('common.edit')} ${s.name}`}>
        <span className="sc-hours">{headline}</span>
        <span className="sc-days">{daysLine}</span>
      </button>

      <div className="sc-foot">
        <ul className="sc-strip" aria-label={t(isSession ? 'schedules.active_days' : 'schedules.day_hours_label')}>
          {cells.map((c) => {
            const dayName = t(`schedules.dayname_${c.iso}`)
            const label = c.on ? `${dayName} ${c.start ?? '--:--'} – ${c.end ?? '--:--'}` : `${dayName} ${t('schedules.day_off')}`
            return (
              <li key={c.iso} className={`sc-strip-day${c.on ? ' sc-strip-day--on' : ''}`} title={label} aria-label={label}>
                <span aria-hidden="true">{t(`schedules.day_${c.iso}`).charAt(0)}</span>
              </li>
            )
          })}
        </ul>
        <span className="sc-tol">
          {t('schedules.tolerance_label')} {t('schedules.minutes', { count: s.grace_minutes })}
        </span>
      </div>
    </article>
  )
}
