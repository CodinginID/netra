import { useState } from 'react'
import { Copy, Plus, X } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { SessionRule } from '@/api/adminApi'
import { Switch } from './ScheduleDayHours'
import {
  ISO_DAYS, PRESETS, dayMinutes, matchingPresetDays, presetDays, sessionsOn, useScheduleFormat,
  type SessionPlan,
} from './scheduleDays'

function SessionList({ sessions, onChange }: { sessions: SessionRule[]; onChange: (s: SessionRule[]) => void }) {
  const { t } = useI18n()
  const update = (i: number, key: keyof SessionRule, val: string) =>
    onChange(sessions.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)))
  return (
    <div className="ss-list">
      {sessions.map((s, i) => {
        const bad = dayMinutes(s.start, s.end) === null
        return (
          <div key={i} className="ss-row">
            <span className="ss-no" aria-hidden="true">{i + 1}</span>
            <input className="field-input" placeholder={t('schedules.session_name')} value={s.name} required
              aria-label={t('schedules.session_name')} onChange={(e) => update(i, 'name', e.target.value)} />
            <input className="field-input dh-time" type="time" value={s.start} required aria-invalid={bad}
              aria-label={t('schedules.session_start')} onChange={(e) => update(i, 'start', e.target.value)} />
            <span className="dh-sep">–</span>
            <input className="field-input dh-time" type="time" value={s.end} required aria-invalid={bad}
              aria-label={t('schedules.session_end')} onChange={(e) => update(i, 'end', e.target.value)} />
            <button type="button" className="btn btn-ghost btn-sm ss-remove" aria-label={t('schedules.delete_session')}
              disabled={sessions.length === 1} onClick={() => onChange(sessions.filter((_, j) => j !== i))}>
              <X size={15} />
            </button>
          </div>
        )
      })}
      {sessions.some((s) => dayMinutes(s.start, s.end) === null) && (
        <span className="dh-error" role="alert">{t('schedules.end_before_start')}</span>
      )}
      <button type="button" className="btn btn-ghost btn-sm ss-add"
        onClick={() => onChange([...sessions, { name: `${t('schedules.session_prefix')} ${sessions.length + 1}`, start: '07:00', end: '08:30' }])}>
        <Plus size={14} /> {t('schedules.add_session')}
      </button>
    </div>
  )
}

/** Session schedule: which days are on, and the sessions of each (or one set for all). */
export function SessionsEditor({ plan, onChange }: { plan: SessionPlan; onChange: (p: SessionPlan) => void }) {
  const { t } = useI18n()
  const fmt = useScheduleFormat()
  const activeIdx = plan.days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0)
  const [tab, setTab] = useState(activeIdx[0] ?? 0)
  const current = plan.days[tab] ? tab : activeIdx[0] ?? 0
  const preset = matchingPresetDays(plan.days)

  const setDays = (days: boolean[]) => onChange({ ...plan, days })
  const toggleSame = (same: boolean) =>
    onChange(same
      ? { ...plan, sameEveryDay: true, common: sessionsOn(plan, current).map((s) => ({ ...s })) }
      : { ...plan, sameEveryDay: false, perDay: plan.perDay.map(() => plan.common.map((s) => ({ ...s }))) })
  const setSessions = (list: SessionRule[]) =>
    onChange(plan.sameEveryDay
      ? { ...plan, common: list }
      : { ...plan, perDay: plan.perDay.map((l, i) => (i === current ? list : l)) })
  const copyToAll = () =>
    onChange({ ...plan, perDay: plan.perDay.map(() => plan.perDay[current].map((s) => ({ ...s }))) })

  return (
    <section className="dh" aria-labelledby="ss-title">
      <div className="dh-head">
        <div>
          <h3 id="ss-title" className="sf-section-title">{t('schedules.sessions_label')}</h3>
          <p className="sf-section-desc">{t('schedules.sessions_desc')}</p>
        </div>
        <div className="dh-presets" role="group" aria-label={t('schedules.presets')}>
          <span className="dh-presets-label">{t('schedules.presets')}:</span>
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`chip${preset === p ? ' chip--active' : ''}`}
              aria-pressed={preset === p} onClick={() => setDays(presetDays(p))}>
              {t(`schedules.preset_${p}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-days" role="group" aria-label={t('schedules.active_days')}>
        {ISO_DAYS.map((d, i) => (
          <button key={d} type="button" className={`ss-day${plan.days[i] ? ' ss-day--on' : ''}`}
            aria-pressed={plan.days[i]} aria-label={t(`schedules.dayname_${d}`)}
            onClick={() => setDays(plan.days.map((on, j) => (j === i ? !on : on)))}>
            {t(`schedules.day_${d}`)}
          </button>
        ))}
      </div>

      {activeIdx.length === 0 ? (
        <span className="dh-error" role="alert">{t('schedules.no_workday')}</span>
      ) : (
        <div className="dh-table ss-panel">
          <div className="ss-same">
            <Switch checked={plan.sameEveryDay} onChange={toggleSame} label={t('schedules.same_sessions')} />
            <span>
              <span className="sf-box-title">{t('schedules.same_sessions')}</span>
              <span className="sf-hint">{plan.sameEveryDay ? t('schedules.same_sessions_on') : t('schedules.same_sessions_off')}</span>
            </span>
          </div>

          {!plan.sameEveryDay && (
            <div className="ss-tabs" role="tablist" aria-label={t('schedules.active_days')}>
              {activeIdx.map((i) => {
                const list = plan.perDay[i]
                const span = list.length ? dayMinutes(list[0].start, list[list.length - 1].end) : null
                return (
                  <button key={i} type="button" role="tab" aria-selected={i === current}
                    className={`ss-tab${i === current ? ' ss-tab--active' : ''}`} onClick={() => setTab(i)}>
                    <span>{t(`schedules.day_${ISO_DAYS[i]}`)}</span>
                    <small>{t('schedules.sessions_count', { count: list.length })}{span !== null ? ` · ${fmt.duration(span)}` : ''}</small>
                  </button>
                )
              })}
            </div>
          )}

          <div className="ss-body" role={plan.sameEveryDay ? undefined : 'tabpanel'}>
            <SessionList sessions={sessionsOn(plan, current)} onChange={setSessions} />
          </div>

          {!plan.sameEveryDay && activeIdx.length > 1 && (
            <div className="dh-foot">
              <button type="button" className="btn btn-ghost btn-sm dh-copy" onClick={copyToAll}>
                <Copy size={14} /> {t('schedules.copy_sessions_to_all', { day: t(`schedules.dayname_${ISO_DAYS[current]}`) })}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
