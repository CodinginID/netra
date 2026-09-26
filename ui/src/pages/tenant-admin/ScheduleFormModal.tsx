import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { useModalA11y } from '@/hooks/useModalA11y'
import type { ScheduleCreate, ScheduleOut, ScheduleRules } from '@/api/adminApi'
import { DayHoursEditor, Switch } from './ScheduleDayHours'
import { SessionsEditor } from './ScheduleSessionsEditor'
import {
  dayRowsToRules, initDayRows, initSessionPlan, rowsValid, sessionPlanToRules, sessionPlanValid, sessionsOn,
  type DayRow, type SessionPlan,
} from './scheduleDays'

type ScheduleType = 'shift' | 'session'

const GRACE_MAX = 240
const GRACE_STEP = 5

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
  // Each editor starts from the saved rules only when they are of its type.
  const isSessionRules = initial?.rules.type === 'session'
  const [dayRows, setDayRows] = useState<DayRow[]>(() => initDayRows(isSessionRules ? undefined : initial?.rules))
  const [plan, setPlan] = useState<SessionPlan>(() => initSessionPlan(isSessionRules ? initial?.rules : undefined))
  const [grace, setGrace] = useState(initial?.grace_minutes ?? 15)
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false)

  const valid = name.trim() !== '' && (type === 'shift' ? rowsValid(dayRows) : sessionPlanValid(plan))
  const clampGrace = (v: number) => Math.min(GRACE_MAX, Math.max(0, Number.isFinite(v) ? Math.round(v) : 0))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const body: ScheduleRules = type === 'shift' ? dayRowsToRules(dayRows) : sessionPlanToRules(plan)
    // PATCH replaces `rules` whole — carry over configured holidays.
    const holidays = initial?.rules.holidays
    const rules = holidays?.length ? { ...body, holidays } : body
    const payload: ScheduleCreate = { name: name.trim(), rules, grace_minutes: grace }
    // is_default is only ever promoted server-side; sending false is a no-op, so omit it.
    if (isDefault && !initial?.is_default) payload.is_default = true
    onSubmit(payload)
  }

  const firstSessionDay = plan.days.findIndex(Boolean)
  const graceExample = type === 'shift'
    ? dayRows.find((r) => r.enabled)?.start
    : firstSessionDay >= 0 ? sessionsOn(plan, firstSessionDay)[0]?.start : undefined

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
              : <SessionsEditor plan={plan} onChange={setPlan} />}

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
