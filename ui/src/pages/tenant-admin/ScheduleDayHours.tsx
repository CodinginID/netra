import { useI18n } from '@/store/i18nStore'
import { ISO_DAYS, type DayRow } from './scheduleDays'

export function DayHoursEditor({ rows, onChange }: { rows: DayRow[]; onChange: (rows: DayRow[]) => void }) {
  const { t } = useI18n()
  const update = (i: number, patch: Partial<DayRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const firstEnabled = rows.find((r) => r.enabled)
  const applyToAll = () =>
    firstEnabled && onChange(rows.map((r) => (r.enabled ? { ...r, start: firstEnabled.start, end: firstEnabled.end } : r)))

  return (
    <fieldset className="day-hours">
      <legend className="day-hours-legend">{t('schedules.day_hours_label')}</legend>
      {rows.map((r, i) => {
        const dayName = t(`schedules.day_${ISO_DAYS[i]}`)
        return (
          <div key={ISO_DAYS[i]} className={`day-hours-row${r.enabled ? '' : ' day-hours-row--off'}`}>
            <label className="day-hours-day">
              <input type="checkbox" checked={r.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
              {dayName}
            </label>
            {r.enabled ? (
              <>
                <input className="field-input" type="time" value={r.start} required
                  aria-label={`${t('schedules.time_in')} ${dayName}`}
                  onChange={(e) => update(i, { start: e.target.value })} />
                <span className="day-hours-sep">–</span>
                <input className="field-input" type="time" value={r.end} required
                  aria-label={`${t('schedules.time_out')} ${dayName}`}
                  onChange={(e) => update(i, { end: e.target.value })} />
              </>
            ) : (
              <span className="day-hours-off">{t('schedules.day_off')}</span>
            )}
          </div>
        )
      })}
      {firstEnabled ? (
        <button type="button" className="btn btn-ghost btn-sm day-hours-apply" onClick={applyToAll}>
          {t('schedules.apply_all_days')}
        </button>
      ) : (
        <span className="day-hours-error" role="alert">{t('schedules.no_workday')}</span>
      )}
    </fieldset>
  )
}
