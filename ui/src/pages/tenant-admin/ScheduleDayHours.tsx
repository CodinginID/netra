import { Copy } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import {
  ISO_DAYS, applyPreset, copyFirstToAll, dayMinutes, matchingPreset, useScheduleFormat, weeklyMinutes,
  type DayPreset, type DayRow,
} from './scheduleDays'

const PRESETS: DayPreset[] = ['weekdays', 'mon_sat', 'daily']

/** An on/off switch; a real button so it is keyboard- and screen-reader-operable. */
export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`sw${checked ? ' sw--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="sw-thumb" />
    </button>
  )
}

/** Per-weekday working hours: a switch, start / end and computed duration per day. */
export function DayHoursEditor({ rows, onChange }: { rows: DayRow[]; onChange: (rows: DayRow[]) => void }) {
  const { t } = useI18n()
  const fmt = useScheduleFormat()
  const update = (i: number, patch: Partial<DayRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const activePreset = matchingPreset(rows)
  const workDays = rows.filter((r) => r.enabled).length

  return (
    <section className="dh" aria-labelledby="dh-title">
      <div className="dh-head">
        <div>
          <h3 id="dh-title" className="sf-section-title">{t('schedules.day_hours_label')}</h3>
          <p className="sf-section-desc">{t('schedules.day_hours_desc')}</p>
        </div>
        <div className="dh-presets" role="group" aria-label={t('schedules.presets')}>
          <span className="dh-presets-label">{t('schedules.presets')}:</span>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip${activePreset === p ? ' chip--active' : ''}`}
              aria-pressed={activePreset === p}
              onClick={() => onChange(applyPreset(rows, p))}
            >
              {t(`schedules.preset_${p}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="dh-table" role="table" aria-labelledby="dh-title">
        <div className="dh-row dh-row--head" role="row">
          <span role="columnheader">{t('schedules.col_day')}</span>
          <span role="columnheader">{t('schedules.time_in')}</span>
          <span role="columnheader">{t('schedules.time_out')}</span>
          <span role="columnheader" className="dh-dur">{t('schedules.col_duration')}</span>
        </div>
        {rows.map((r, i) => {
          const dayName = t(`schedules.dayname_${ISO_DAYS[i]}`)
          const minutes = r.enabled ? dayMinutes(r.start, r.end) : null
          return (
            <div key={ISO_DAYS[i]} className={`dh-row${r.enabled ? '' : ' dh-row--off'}`} role="row">
              <span className="dh-day" role="cell">
                <Switch checked={r.enabled} onChange={(v) => update(i, { enabled: v })} label={t('schedules.workday_toggle', { day: dayName })} />
                {dayName}
              </span>
              {r.enabled ? (
                <>
                  <span role="cell">
                    <input className="field-input dh-time" type="time" value={r.start} required
                      aria-label={`${t('schedules.time_in')} ${dayName}`}
                      aria-invalid={minutes === null}
                      onChange={(e) => update(i, { start: e.target.value })} />
                  </span>
                  <span role="cell">
                    <input className="field-input dh-time" type="time" value={r.end} required
                      aria-label={`${t('schedules.time_out')} ${dayName}`}
                      aria-invalid={minutes === null}
                      onChange={(e) => update(i, { end: e.target.value })} />
                  </span>
                  <span role="cell" className={`dh-dur${minutes === null ? ' dh-dur--error' : ''}`}>
                    {minutes === null ? t('schedules.end_before_start') : fmt.duration(minutes)}
                  </span>
                </>
              ) : (
                <span role="cell" className="dh-off">{t('schedules.day_off_desc')}</span>
              )}
            </div>
          )
        })}
        <div className="dh-foot">
          <button type="button" className="btn btn-ghost btn-sm dh-copy" onClick={() => onChange(copyFirstToAll(rows))} disabled={workDays < 2}>
            <Copy size={14} /> {t('schedules.apply_all_days')}
          </button>
          {workDays === 0 ? (
            <span className="dh-error" role="alert">{t('schedules.no_workday')}</span>
          ) : (
            <span className="dh-total">
              <strong>{t('schedules.workday_count', { count: workDays })}</strong> · {t('schedules.per_week', { duration: fmt.duration(weeklyMinutes(rows)) })}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
