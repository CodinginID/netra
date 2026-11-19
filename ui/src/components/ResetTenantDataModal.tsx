import { useState } from 'react'
import type { TenantOut, TenantResetCategory } from '@/api/adminApi'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useResetTenantData } from '@/hooks/useApiMutations'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import '@/styles/pages/super-admin.css'

const CATEGORIES: TenantResetCategory[] = ['attendance', 'faces', 'users', 'devices']

/**
 * Super admin: permanently wipe chosen data of one tenant (tenant + admins stay).
 * Mockup c5a2747e — one checkable card per category, slug typed to confirm.
 */
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
      <div
        ref={modalRef}
        className="modal-card"
        style={{ maxWidth: 440 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-tenant-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="reset-tenant-title" className="modal-title" style={{ marginBottom: 0 }}>
          {t('tenants.reset_dialog_title')}
        </h3>
        <p className="tn-dialog-sub">
          <strong>{tenant.name}</strong> · {t('tenants.reset_dialog_sub')}
        </p>

        <fieldset style={{ border: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="sa-sr-only">{t('tenant.reset_intro')}</legend>
          {CATEGORIES.map((cat) => {
            const on = selected.has(cat)
            return (
              <label key={cat} className={`tn-check${on ? ' is-on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(cat)} />
                <span>
                  <span className="tn-check-title" style={{ display: 'block' }}>{t(`tenant.reset_cat_${cat}`)}</span>
                  <span className="tn-check-hint">{t(`tenant.reset_cat_${cat}_hint`)}</span>
                </span>
              </label>
            )
          })}
        </fieldset>
        <p className="tn-dialog-sub" style={{ marginTop: 10 }}>{t('tenant.reset_intro')}</p>

        <label htmlFor="reset-confirm-slug" className="tn-confirm-label">
          {t('tenants.type_slug_before')} <b className="sa-mono">{tenant.slug}</b> {t('tenants.type_slug_after')}
        </label>
        <input
          id="reset-confirm-slug"
          className="field-input tn-confirm-input"
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit() }}
          autoComplete="off"
          spellCheck={false}
          placeholder={tenant.slug}
        />

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={reset.isPending}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={submit} disabled={!canSubmit}>
            {reset.isPending
              ? '...'
              : selected.size > 0
                ? t('tenants.reset_n_categories', { count: selected.size })
                : t('tenant.reset')}
          </button>
        </div>
      </div>
    </div>
  )
}
