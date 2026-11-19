/** Presentational pieces of the Enrol wajah page (styles: styles/enrollment.css, prefix enrol-). */
import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { UserItem } from '@/api/enrollmentApi'

export type AngleKey = 'front' | 'left' | 'right'
type PickUser = UserItem & { enrolled?: boolean; role?: string }

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] ?? '' : p[0][1] ?? '')).toUpperCase()
}

export function EnrolAvatar({ name }: { name: string }) {
  return <span className="enrol-avatar" aria-hidden="true">{initials(name)}</span>
}

export function FaceIcon({ dir, size = 36 }: { dir: string; size?: number }) {
  const s = size
  if (dir === 'front') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <ellipse cx="20" cy="22" rx="11" ry="14" stroke="currentColor" strokeWidth="1.8"/>
      <circle cx="15.5" cy="20" r="2" fill="currentColor"/>
      <circle cx="24.5" cy="20" r="2" fill="currentColor"/>
      <path d="M16 27 Q20 30 24 27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (dir === 'left') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <ellipse cx="22" cy="22" rx="10" ry="14" stroke="currentColor" strokeWidth="1.8"/>
      <circle cx="18" cy="20" r="2" fill="currentColor"/>
      <circle cx="25" cy="21" r="1.5" fill="currentColor" opacity="0.4"/>
      <path d="M13 22 L9 20 M13 22 L10 25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <ellipse cx="18" cy="22" rx="10" ry="14" stroke="currentColor" strokeWidth="1.8"/>
      <circle cx="22" cy="20" r="2" fill="currentColor"/>
      <circle cx="15" cy="21" r="1.5" fill="currentColor" opacity="0.4"/>
      <path d="M27 22 L31 20 M27 22 L30 25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

/** Desktop: 3 numbered steps joined by lines. */
export function StepBar({ active }: { active: 1 | 2 | 3 }) {
  const { t } = useI18n()
  const steps = [t('enrollment.step1'), t('enrollment.step2'), t('enrollment.step3')]
  return (
    <ol className="enrol-card enrol-steps" aria-label={t('enrollment.steps_label')}>
      {steps.map((label, i) => {
        const idx = i + 1
        const state = active > idx ? 'done' : active === idx ? 'current' : 'todo'
        return (
          <li key={label} className={`enrol-step enrol-step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="enrol-step-node">{state === 'done' ? <Check size={13} strokeWidth={3} /> : idx}</span>
            <span className="enrol-step-label">{label}</span>
            {idx < 3 && <span className="enrol-step-line" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

/** Phone: "✕  Enrol · Name  2/3" + segmented progress. */
export function PhoneBar({ active, name, onClose }: { active: 1 | 2 | 3; name: string; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="enrol-phonebar">
      <div className="enrol-phonebar-row">
        <button type="button" className="enrol-icon-btn" onClick={onClose} aria-label={t('enrollment.change_user')}>
          <X size={20} />
        </button>
        <span className="enrol-phonebar-title">{name ? t('enrollment.phone_title', { name }) : t('enrollment.title')}</span>
        <span className="enrol-phonebar-count">{active}/3</span>
      </div>
      <div className="enrol-progress" aria-hidden="true">
        {[1, 2, 3].map((i) => <span key={i} className={i <= active ? 'is-on' : ''} />)}
      </div>
    </div>
  )
}

/** Three angle tiles: done (green ✓), current (brand ●), pending (○). */
export function AngleTiles({
  labels, doneCount, activeIdx, countdown,
}: {
  labels: Record<AngleKey, string>
  doneCount: number
  activeIdx: number
  countdown: number
}) {
  const keys: AngleKey[] = ['front', 'left', 'right']
  return (
    <div className="enrol-angles">
      {keys.map((k, i) => {
        const state = i < doneCount ? 'done' : i === activeIdx ? 'now' : 'todo'
        return (
          <div key={k} className={`enrol-angle enrol-angle--${state}`}>
            <span className="enrol-angle-mark" aria-hidden="true">
              {state === 'done' ? <Check size={18} strokeWidth={3} /> : state === 'now' ? (countdown > 0 ? countdown : '●') : <FaceIcon dir={k} size={22} />}
            </span>
            <span className="enrol-angle-label">{labels[k]}</span>
          </div>
        )
      })}
    </div>
  )
}

export function VoiceSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useI18n()
  return (
    <label className="enrol-card enrol-switch-row">
      <span>{t('enrollment.voice_guide')}</span>
      <input type="checkbox" role="switch" className="enrol-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/** Searchable list to pick the user to enrol (replaces the long <select>). */
export function UserPicker({ users, value, onPick }: { users: UserItem[]; value: string; onPick: (id: string) => void }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const rows = (users as PickUser[]).filter((u) =>
      !s || [u.full_name, u.username, u.external_id].some((v) => (v ?? '').toLowerCase().includes(s)),
    )
    // Not-yet-enrolled first: that is usually the job at hand.
    return rows.sort((a, b) => Number(!!a.enrolled) - Number(!!b.enrolled))
  }, [users, q])
  return (
    <div className="enrol-picker">
      <label className="enrol-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('enrollment.search_placeholder')} aria-label={t('enrollment.search_placeholder')} />
      </label>
      <div className="enrol-picker-list" role="listbox" aria-label={t('enrollment.user_label')}>
        {list.length === 0 && <div className="enrol-muted enrol-picker-empty">{t('enrollment.no_match')}</div>}
        {list.map((u) => {
          const name = u.full_name || u.username || t('enrollment.no_name')
          const sub = u.external_id || u.username || ''
          return (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={u.id === value}
              className={`enrol-picker-item${u.id === value ? ' is-selected' : ''}`}
              onClick={() => onPick(u.id)}
            >
              <EnrolAvatar name={name} />
              <span className="enrol-who-text">
                <span className="enrol-who-name">{name}</span>
                {sub && <span className="enrol-who-sub">{sub}</span>}
              </span>
              {u.enrolled === true && <span className="enrol-chip enrol-chip--g">{t('users.face_registered')}</span>}
              {u.enrolled === false && <span className="enrol-chip enrol-chip--w">{t('users.face_missing')}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
