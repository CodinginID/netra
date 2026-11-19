import { type ReactNode } from 'react'
import { KeyRound, Pencil, ScanFace, Trash2, UserCheck, UserX } from 'lucide-react'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import type { ActionMenuItem } from '@/components/ActionMenu'
import type { UserOut } from '@/api/adminApi'
import { Chip, Who } from './PeopleUi'
import { STAFF_ROLES } from './UsersModals'

type T = (key: string, vars?: Record<string, string | number>) => string

export function roleLabel(role: string, t: T): string {
  if (role === 'tenant_admin') return t('users.role_admin')
  if (role === 'supervisor') return t('users.role_supervisor')
  return t('users.role_employee')
}

export function idOrEmail(u: UserOut): string {
  return u.external_id || u.email || u.username || '—'
}

export function FaceChip({ user, short }: { user: UserOut; short?: boolean }) {
  const { t } = useI18n()
  if (!user.is_active) return <Chip tone="m">{t('users.inactive')}</Chip>
  return user.enrolled
    ? <Chip tone="g">{t('users.face_registered')}</Chip>
    : <Chip tone="w">{short ? t('users.face_missing_short') : t('users.face_missing')}</Chip>
}

export interface UserActionHandlers {
  onEnroll: (u: UserOut) => void
  onEdit: (u: UserOut) => void
  onResetPassword: (u: UserOut) => void
  onToggleActive: (u: UserOut) => void
  onDelete: (u: UserOut) => void
}

/** One action list, used by the desktop ⋯ menu and the phone bottom sheet. */
export function buildUserActions(user: UserOut, myId: string | null, h: UserActionHandlers, t: T): ActionMenuItem[] {
  const items: ActionMenuItem[] = [
    {
      key: 'enroll',
      label: user.enrolled ? t('users.enroll_aria_update') : t('users.action_enroll'),
      hint: user.enrolled ? undefined : t('users.action_enroll_hint'),
      icon: <ScanFace size={16} />,
      onSelect: () => h.onEnroll(user),
    },
    { key: 'edit', label: t('users.action_edit'), icon: <Pencil size={16} />, onSelect: () => h.onEdit(user) },
  ]
  if (STAFF_ROLES.includes(user.role) && user.id !== myId) {
    items.push({ key: 'reset', label: t('users.action_reset_password'), icon: <KeyRound size={16} />, onSelect: () => h.onResetPassword(user) })
  }
  if (user.id !== myId) {
    items.push(
      user.is_active
        ? { key: 'deactivate', label: t('users.action_deactivate'), icon: <UserX size={16} />, onSelect: () => h.onToggleActive(user) }
        : { key: 'activate', label: t('users.action_activate'), icon: <UserCheck size={16} />, onSelect: () => h.onToggleActive(user) },
    )
  }
  items.push({
    key: 'delete',
    label: t('users.delete_title'),
    hint: t('users.action_delete_hint'),
    icon: <Trash2 size={16} />,
    danger: true,
    separatorBefore: true,
    onSelect: () => h.onDelete(user),
  })
  return items
}

/** Phone-only bottom sheet listing the actions for one user. */
export function UsersActionSheet({
  user,
  items,
  onClose,
}: {
  user: UserOut
  items: ActionMenuItem[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const row = (it: ActionMenuItem): ReactNode => (
    <button
      key={it.key}
      type="button"
      className={`users-sheet-item${it.danger ? ' is-danger' : ''}${it.key === 'enroll' && !user.enrolled ? ' is-primary' : ''}`}
      disabled={it.disabled}
      onClick={() => { onClose(); it.onSelect() }}
    >
      <span className="users-sheet-icon" aria-hidden="true">{it.icon}</span>
      <span className="users-sheet-text">
        <span className="users-sheet-label">{it.label}</span>
        {it.hint && it.danger && <small>{it.hint}</small>}
      </span>
      {it.hint && !it.danger && <small className="users-sheet-aside">{it.hint}</small>}
    </button>
  )
  return (
    <div className="users-sheet-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div
        className="users-sheet"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('users.actions_for', { name: user.full_name })}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="users-sheet-handle" aria-hidden="true" />
        <div className="users-sheet-head">
          <Who name={user.full_name} sub={`${roleLabel(user.role, t)} · ${idOrEmail(user)}`} />
          <FaceChip user={user} />
        </div>
        <div className="users-sheet-list">
          {items.map((it) => (
            <div key={it.key} style={{ display: 'contents' }}>
              {it.separatorBefore && <div className="users-sheet-divider" role="separator" />}
              {row(it)}
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost users-sheet-cancel" onClick={onClose}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}
