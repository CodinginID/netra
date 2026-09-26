import { Clock, Edit2, Star, Trash2 } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { ScheduleOut } from '@/api/adminApi'
import { ActionMenu, type ActionMenuItem } from '@/components/ActionMenu'
import { sessionDayLists, useScheduleFormat, weekCells } from './scheduleDays'

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

  const summary = isSession
    ? `${fmt.dayRange(cells)} · ${uniform
      ? t('schedules.sessions_count', { count: sessions.length })
      : t('schedules.sessions_vary')}`
    : fmt.shiftSummary(cells)

  const items: ActionMenuItem[] = [
    { key: 'edit', label: t('common.edit'), icon: <Edit2 size={15} />, onSelect: onEdit },
  ]
  if (!s.is_default) {
    items.push({ key: 'default', label: t('schedules.make_default'), icon: <Star size={15} />, onSelect: onMakeDefault })
  }
  items.push({ key: 'delete', label: t('common.delete'), icon: <Trash2 size={15} />, danger: true, separatorBefore: true, onSelect: onDelete })

  return (
    <article className="sc-card" aria-labelledby={`sc-${s.id}`}>
      <div className="sc-head">
        <div className="sc-head-main">
          <div className="sc-title-row">
            <h3 id={`sc-${s.id}`} className="sc-name">{s.name}</h3>
            <span className="sc-pill">{isSession ? t('schedules.type_session') : t('schedules.type_shift')}</span>
            {s.is_default && <span className="sc-pill sc-pill--brand">{t('schedules.status_default')}</span>}
          </div>
          <div className="sc-summary">
            <Clock size={14} aria-hidden="true" />
            <span>{summary}</span>
          </div>
        </div>
        <ActionMenu label={t('schedules.actions', { name: s.name })} items={items} />
      </div>

      <ul className="sc-week" aria-label={t(isSession ? 'schedules.active_days' : 'schedules.day_hours_label')}>
        {cells.map((c) => {
          const dayName = t(`schedules.dayname_${c.iso}`)
          return (
            <li key={c.iso} className="sc-day">
              <span className="sc-day-label" aria-hidden="true">{t(`schedules.day_${c.iso}`)}</span>
              {c.on ? (
                <span className="sc-day-cell sc-day-cell--on" aria-label={`${dayName} ${c.start ?? '--:--'} – ${c.end ?? '--:--'}`}>
                  <span>{c.start ?? '--:--'}</span>
                  <span className="sc-day-end">{c.end ?? '--:--'}</span>
                </span>
              ) : (
                <span className="sc-day-cell sc-day-cell--off" aria-label={`${dayName} ${t('schedules.day_off')}`}>
                  {t('schedules.day_off')}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {isSession && sessions.length > 0 && (
        <ol className="sc-sessions">
          {sessions.map((x, i) => (
            <li key={i} className="sc-session">
              <span className="sc-session-no" aria-hidden="true">{i + 1}</span>
              <span className="sc-session-name">{x.name}</span>
              <span className="sc-session-time">{x.start} – {x.end}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="sc-foot">
        <span>{t('schedules.tolerance_label')} <strong>{t('schedules.minutes', { count: s.grace_minutes })}</strong></span>
        <span className="sc-dot" aria-hidden="true" />
        <span>{fmt.weekly(cells)}</span>
      </div>
    </article>
  )
}
