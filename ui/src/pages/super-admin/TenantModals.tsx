import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import type { TenantOut } from '@/api/adminApi'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useCreateTenant } from '@/hooks/useApiMutations'
import { useI18n } from '@/store/i18nStore'
import '@/styles/pages/super-admin.css'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateTenantModal({ onClose, onCreated }: CreateModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminFullName, setAdminFullName] = useState('')
  const [vertical, setVertical] = useState<'company' | 'school' | 'university'>('company')
  const [showAdminPw, setShowAdminPw] = useState(false)
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const createMutation = useCreateTenant(() => {
    onClose()
    onCreated()
  })

  const onNameChange = (value: string) => {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (createMutation.isPending) return
    if (adminPassword.length < 8) {
      show(t('tenant.error_password_min'), 'error')
      return
    }
    createMutation.mutate(
      {
        name: name.trim(),
        slug: slug.trim(),
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword,
        admin_full_name: adminFullName.trim(),
        config: { vertical: { mode: vertical } },
      },
      {
        onError: (err) => {
          show(err instanceof Error ? err.message : t('tenant.error_create_failed'), 'error')
        },
      },
    )
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-card"
        style={{ maxHeight: '90vh', overflowY: 'auto', padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h3 className="modal-title" style={{ marginBottom: 0 }}>{t('tenant.add')}</h3>
          <button
            aria-label={t('common.close')}
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', border: 'none' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="field">
            <label htmlFor="tenant-name">{t('tenant.form_name')}</label>
            <input
              id="tenant-name"
              className="field-input"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('tenant.form_name_placeholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-slug">{t('tenant.form_slug')}</label>
            <input
              id="tenant-slug"
              className="field-input"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
              placeholder={t('tenant.form_slug_placeholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-email">{t('tenant.form_admin_email')}</label>
            <input
              id="tenant-admin-email"
              className="field-input"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder={t('tenant.form_admin_email_placeholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-password">{t('tenant.form_admin_password')}</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="tenant-admin-password"
                className="field-input"
                type={showAdminPw ? 'text' : 'password'}
                style={{ paddingRight: 40 }}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder={t('tenant.form_admin_password_placeholder')}
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowAdminPw((v) => !v)}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                aria-label={showAdminPw ? t('login.hide_password') : t('login.show_password')}
              >
                {showAdminPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-fullname">{t('tenant.form_admin_fullname')}</label>
            <input
              id="tenant-admin-fullname"
              className="field-input"
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              placeholder={t('tenant.form_admin_fullname_placeholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-vertical">{t('tenant.form_vertical')}</label>
            <select
              id="tenant-vertical"
              className="field-input"
              value={vertical}
              onChange={(e) => setVertical(e.target.value as 'company' | 'school' | 'university')}
            >
              <option value="company">{t('tenant.option_company')}</option>
              <option value="school">{t('tenant.option_school')}</option>
              <option value="university">{t('tenant.option_university')}</option>
            </select>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createMutation.isPending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('common.creating') : t('tenant.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ToggleConfirmModal({ tenant, onConfirm, onClose, busy }: {
  tenant: TenantOut
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const isSuspend = tenant.status === 'active'
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{isSuspend ? t('tenant.suspend_title') : t('tenant.activate_title')}</h3>
        <p className="confirm-text">
          {t('tenant.confirm_toggle', {
            action: isSuspend ? t('tenant.suspend') : t('tenant.activate'),
            name: tenant.name,
          })}
          {isSuspend && ' ' + t('tenant.toggle_warning')}
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button
            className={isSuspend ? 'btn btn-warning' : 'btn btn-success'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '...' : isSuspend ? t('tenant.suspend') : t('tenant.activate')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Permanent delete — like reset, it asks for the slug to be typed first. */
export function DeleteConfirmModal({ tenant, onConfirm, onClose, busy }: {
  tenant: TenantOut
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const [confirmSlug, setConfirmSlug] = useState('')
  const canDelete = confirmSlug.trim() === tenant.slug && !busy
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('tenant.delete_title')}</h3>
        <p className="confirm-text">
          {t('tenant.confirm_delete', { name: tenant.name })}{' '}
          <strong>{t('tenant.delete_warning')}</strong>
        </p>
        <label htmlFor="delete-confirm-slug" className="tn-confirm-label">
          {t('tenants.type_slug_before')} <b className="sa-mono">{tenant.slug}</b> {t('tenants.type_slug_after')}
        </label>
        <input
          id="delete-confirm-slug"
          className="field-input tn-confirm-input"
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canDelete) onConfirm() }}
          autoComplete="off"
          spellCheck={false}
          placeholder={tenant.slug}
        />
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={!canDelete}>
            {busy ? '...' : t('tenants.delete_action')}
          </button>
        </div>
      </div>
    </div>
  )
}
