import { useState } from 'react'
import type { TenantOut, TenantResetCategory } from '@/api/adminApi'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useResetTenantData } from '@/hooks/useApiMutations'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'

const CATEGORIES: TenantResetCategory[] = ['attendance', 'faces', 'users', 'devices']

/** Super admin: permanently wipe chosen data of one tenant (tenant + admins stay). */
export function ResetTenantDataModal({ tenant, onClose }: { tenant: TenantOut; onClose: () => void }) {
  const { t } = useI18n()
  const { show } = useToast()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const [selected, setSelected] = useState<Set<TenantResetCategory>>(new Set())
  const [confirmSlug, setConfirmSlug] = useState('')
  const reset = useResetTenantData(() => {
    show(t('tenant.reset_toast_done', { name: tenant.name }), 'success')
    onClose()
  })

  const toggle = (cat: TenantResetCategory) => {
    const next = new Set(selected)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    setSelected(next)
  }

  const canSubmit = selected.size > 0 && confirmSlug.trim() === tenant.slug && !reset.isPending
  const submit = () =>
    reset.mutate(
      { tenantId: tenant.id, categories: [...selected], confirmSlug: confirmSlug.trim() },
      { onError: (err) => show(err instanceof Error ? err.message : t('tenant.reset_error'), 'error') },
    )

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('tenant.reset_title', { name: tenant.name })}</h3>
        <p className="confirm-text">{t('tenant.reset_intro')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
          {CATEGORIES.map((cat) => (
            <label key={cat} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={selected.has(cat)} onChange={() => toggle(cat)} />
              <span>
                <strong>{t(`tenant.reset_cat_${cat}`)}</strong>
                <br />
                <small>{t(`tenant.reset_cat_${cat}_hint`)}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="confirm-text"><strong>{t('tenant.reset_warning')}</strong></p>
        <div className="field">
          <label htmlFor="reset-confirm-slug">{t('tenant.reset_confirm_label', { slug: tenant.slug })}</label>
          <input
            id="reset-confirm-slug"
            className="field-input"
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
            autoComplete="off"
            placeholder={tenant.slug}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={reset.isPending}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={submit} disabled={!canSubmit}>
            {reset.isPending ? '...' : t('tenant.reset')}
          </button>
        </div>
      </div>
    </div>
  )
}
