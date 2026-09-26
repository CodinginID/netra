import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { useModalA11y } from '@/hooks/useModalA11y'
import type { ScheduleCreate, ScheduleOut, ScheduleRules, SessionRule } from '@/api/adminApi'
import { DayHoursEditor, Switch } from './ScheduleDayHours'
import { dayMinutes, dayRowsToRules, initDayRows, rowsValid, type DayRow } from './scheduleDays'

type ScheduleType = 'shift' | 'session'

const GRACE_MAX = 240
const GRACE_STEP = 5

function SessionsEditor({ sessions, onChange }: { sessions: SessionRule[]; onChange: (s: SessionRule[]) => void }) {
  const { t } = useI18n()
  const update = (i: number, key: keyof SessionRule, val: string) =>
    onChange(sessions.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)))
  return (
    <section className="dh" aria-labelledby="ss-title">
      <div className="dh-head">
        <div>
          <h3 id="ss-title" className="sf-section-title">{t('schedules.sessions_label')}</h3>
          <p className="sf-section-desc">{t('schedules.sessions_desc')}</p>
        </div>
      </div>
      <div className="ss-list">
        {sessions.map((s, i) => (
          <div key={i} className="ss-row">
            <span className="ss-no" aria-hidden="true">{i + 1}</span>
            <input className="field-input" placeholder={t('schedules.session_name')} value={s.name} required
              aria-label={t('schedules.session_name')} onChange={(e) => update(i, 'name', e.target.value)} />
            <input className="field-input dh-time" type="time" value={s.start} required
              aria-label={t('schedules.session_start')} onChange={(e) => update(i, 'start', e.target.value)} />
            <span className="dh-sep">–</span>
            <input className="field-input dh-time" type="time" value={s.end} required
              aria-label={t('schedules.session_end')} onChange={(e) => update(i, 'end', e.target.value)} />
            <button type="button" className="btn btn-ghost btn-sm ss-remove" aria-label={t('schedules.delete_session')}
              disabled={sessions.length === 1} onClick={() => onChange(sessions.filter((_, j) => j !== i))}>
              <X size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm ss-add"
          onClick={() => onChange([...sessions, { name: `${t('schedules.session_prefix')} ${sessions.length + 1}`, start: '07:00', end: '08:30' }])}>
          <Plus size={14} /> {t('schedules.add_session')}
        </button>
      </div>
    </section>
  )
}

/** Create (no `initial`) or edit a schedule. */
export function ScheduleFormModal({ initial, onSubmit, onClose, submitting }: {
  initial?: ScheduleOut
  onSubmit: (payload: ScheduleCreate) => void
  onClose: () => void
  submitting: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<ScheduleType>(initial?.rules.type === 'session' ? 'session' : 'shift')
  const [dayRows, setDayRows] = useState<DayRow[]>(() => initDayRows(initial?.rules))
  const [sessions, setSessions] = useState<SessionRule[]>(
    initial?.rules.sessions?.length ? initial.rules.sessions : [{ name: `${t('schedules.session_prefix')} 1`, start: '07:30', end: '09:00' }],
  )
  const [grace, setGrace] = useState(initial?.grace_minutes ?? 15)
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false)

  const sessionsValid = sessions.every((s) => s.name.trim() && dayMinutes(s.start, s.end) !== null)
  const valid = name.trim() !== '' && (type === 'shift' ? rowsValid(dayRows) : sessionsValid)
  const clampGrace = (v: number) => Math.min(GRACE_MAX, Math.max(0, Number.isFinite(v) ? Math.round(v) : 0))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const body: ScheduleRules = type === 'shift' ? dayRowsToRules(dayRows) : { type: 'session', sessions }
    // PATCH replaces `rules` whole — carry over configured holidays.
    const holidays = initial?.rules.holidays
    const rules = holidays?.length ? { ...body, holidays } : body
    const payload: ScheduleCreate = { name: name.trim(), rules, grace_minutes: grace }
    // is_default is only ever promoted server-side; sending false is a no-op, so omit it.
    if (isDefault && !initial?.is_default) payload.is_default = true
    onSubmit(payload)
  }

  const graceExample = type === 'shift' ? dayRows.find((r) => r.enabled)?.start : sessions[0]?.start

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card sf-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="sf-title" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="sf-form">
          <header className="sf-header">
            <div>
              <h2 id="sf-title" className="sf-title">{initial ? t('schedules.edit_title') : t('schedules.add_title')}</h2>
              <p className="sf-section-desc">{t('schedules.form_desc')}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm sf-close" aria-label={t('common.close')} onClick={onClose}>
              <X size={18} />
            </button>
          </header>

          <div className="sf-body">
            <div className="sf-grid">
              <label className="sf-field">
                {t('schedules.form_name')}
                <input className="field-input" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t('schedules.form_name_placeholder')} required autoFocus />
              </label>
              <div className="sf-field">
                <span id="sf-type">{t('schedules.type_label')}</span>
                <div className="seg" role="group" aria-labelledby="sf-type">
                  {(['shift', 'session'] as const).map((st) => (
                    <button key={st} type="button" className={`seg-btn${type === st ? ' seg-btn--active' : ''}`}
                      aria-pressed={type === st} onClick={() => setType(st)}>
                      {st === 'shift' ? t('schedules.shift') : t('schedules.session')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {type === 'shift'
              ? <DayHoursEditor rows={dayRows} onChange={setDayRows} />
              : <SessionsEditor sessions={sessions} onChange={setSessions} />}

            <div className="sf-grid">
              <div className="sf-box">
                <label htmlFor="sf-grace" className="sf-box-title">{t('schedules.grace_label')}</label>
                <div className="stepper">
                  <button type="button" className="stepper-btn" aria-label={t('schedules.grace_less')}
                    disabled={grace <= 0} onClick={() => setGrace(clampGrace(grace - GRACE_STEP))}>
                    <Minus size={16} />
                  </button>
                  <input id="sf-grace" className="field-input stepper-input" type="number" min={0} max={GRACE_MAX}
                    value={grace} onChange={(e) => setGrace(clampGrace(Number(e.target.value)))} />
                  <button type="button" className="stepper-btn" aria-label={t('schedules.grace_more')}
                    disabled={grace >= GRACE_MAX} onClick={() => setGrace(clampGrace(grace + GRACE_STEP))}>
                    <Plus size={16} />
                  </button>
                  <span className="sf-unit">{t('schedules.tolerance_unit')}</span>
                </div>
                {graceExample && /^\d{2}:\d{2}$/.test(graceExample) && (
                  <p className="sf-hint">{graceHint(graceExample, grace, t)}</p>
                )}
              </div>
              <div className="sf-box sf-box--row">
                {/* The default can't be un-set here: promote another schedule instead. */}
                <Switch checked={isDefault} onChange={setIsDefault} label={t('schedules.make_default')}
                  disabled={initial?.is_default} />
                <div>
                  <span className="sf-box-title">{t('schedules.make_default')}</span>
                  <p className="sf-hint">{initial?.is_default ? t('schedules.default_locked') : t('schedules.default_desc')}</p>
                </div>
              </div>
            </div>
          </div>

          <footer className="sf-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !valid}>
              {submitting ? t('common.saving') : t('schedules.save_schedule')}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

/** "Masuk 08:14 masih tepat waktu, 08:16 terlambat" for the first start time. */
function graceHint(start: string, grace: number, t: (k: string, v?: Record<string, string | number>) => string): string {
  const [h, m] = start.split(':').map(Number)
  const at = (offset: number) => {
    const total = (h * 60 + m + offset + 1440) % 1440
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
  return t('schedules.grace_example', { ok: at(grace), late: at(grace + 1) })
}
