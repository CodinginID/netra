import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import type { UserOut, UserCreate, UserUpdate } from '@/api/adminApi'

// ── Create modal ─────────────────────────────────────────────────────────────

const initialForm: UserCreate = {
  full_name: '',
  username: '',
  email: '',
  external_id: '',
  password: '',
  role: 'end_user',
}

export const STAFF_ROLES = ['tenant_admin', 'supervisor']

export function CreateUserModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (payload: UserCreate) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState<UserCreate>(initialForm)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const isStaff = STAFF_ROLES.includes(form.role ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError(t('users.full_name_required')); return }
    if (isStaff) {
      if (!form.email?.trim()) { setError(t('users.email_required')); return }
      if (!form.password || form.password.length < 8) { setError(t('users.password_min')); return }
    } else {
      if (!form.external_id?.trim()) { setError(t('users.unique_id_required')); return }
    }
    setError(null)
    const payload: UserCreate = { full_name: form.full_name.trim(), role: form.role }
    if (form.username?.trim()) payload.username = form.username.trim()
    if (isStaff) {
      payload.email = form.email!.trim().toLowerCase()
      payload.password = form.password
    } else {
      payload.external_id = form.external_id!.trim()
    }
    onSubmit(payload)
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('users.create_title')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="create-full-name">{t('users.full_name_label')}</label>
            <input id="create-full-name" className="field-input" placeholder={t('users.full_name_placeholder')}
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="create-role">{t('users.role_label')}</label>
            <select id="create-role" className="field-input" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="end_user">{t('users.role_employee_student')}</option>
              <option value="supervisor">{t('users.role_supervisor')}</option>
              <option value="tenant_admin">{t('users.role_admin_option')}</option>
            </select>
          </div>

          {!isStaff && (
            <div className="field">
              <label htmlFor="create-external-id">{t('users.unique_id_label')}</label>
              <input id="create-external-id" className="field-input" placeholder={t('users.unique_id_placeholder')}
                value={form.external_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))} required />
            </div>
          )}

          {isStaff && (
            <>
              <div className="field">
                <label htmlFor="create-email">{t('users.email_label')} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('users.email_note')}</span></label>
                <input id="create-email" className="field-input" type="email" placeholder={t('users.email_placeholder')}
                  value={form.email ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="field">
                <label htmlFor="create-password">{t('users.password_label')}</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="create-password"
                    className="field-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder={t('users.password_placeholder')}
                    style={{ paddingRight: 40 }}
                    value={form.password ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    aria-label={showPw ? t('users.hide_password') : t('users.show_password')}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="create-username">{t('users.username_label')} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('users.username_optional')}</span></label>
            <input id="create-username" className="field-input" placeholder={t('users.username_placeholder')}
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('users.cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('users.save')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit modal ───────────────────────────────────────────────────────────────

export function EditUserModal({
  user,
  onSubmit,
  onClose,
}: {
  user: UserOut
  onSubmit: (payload: { userId: string; payload: UserUpdate }) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState<UserUpdate>({
    full_name: user.full_name,
    username: user.username ?? '',
    role: user.role,
  })
  const [error, setError] = useState<string | null>(null)
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name?.trim()) { setError(t('users.full_name_required')); return }
    setError(null)
    onSubmit({
      userId: user.id,
      payload: {
        full_name: form.full_name.trim(),
        role: form.role,
        username: form.username?.trim() || undefined,
      },
    })
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('users.edit_title')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="edit-full-name">{t('users.full_name_label')}</label>
            <input id="edit-full-name" className="field-input" placeholder={t('users.full_name_placeholder')}
              value={form.full_name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="edit-username">{t('users.username_label')}</label>
            <input id="edit-username" className="field-input" placeholder={t('users.username_label')}
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="edit-role">{t('users.role_label')}</label>
            <select id="edit-role" className="field-input" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="end_user">{t('users.role_employee')}</option>
              <option value="supervisor">{t('users.role_supervisor')}</option>
              <option value="tenant_admin">{t('users.role_admin')}</option>
            </select>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('users.cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('users.save_changes')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete confirmation ───────────────────────────────────────────────────────

export function DeleteConfirmModal({
  user,
  onConfirm,
  onClose,
  loading,
}: {
  user: UserOut
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('users.delete_title')}</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          {t('users.delete_confirm', { name: user.full_name })}
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

