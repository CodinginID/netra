import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useResetUserPassword } from '@/hooks/useApiMutations'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import type { UserOut } from '@/api/adminApi'

interface ResetPasswordModalProps {
  user: UserOut
  onClose: () => void
}

/** Admin sets a new password for a staff account that forgot theirs. */
export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const reset = useResetUserPassword(() => {
    show(t('account.reset_success', { name: user.full_name }), 'success')
    onClose()
  })

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError(t('password.error_min')); return }
    if (password !== confirm) { setError(t('password.error_mismatch')); return }
    setError(null)
    reset.mutate(
      { userId: user.id, newPassword: password },
      { onError: (err) => setError(err instanceof Error ? err.message : t('account.reset_failed')) },
    )
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('account.reset_title')}</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
          {t('account.reset_desc', { name: user.full_name, email: user.email ?? '-' })}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="rp-new">{t('password.new')}</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input id="rp-new" className="field-input" type={showPw ? 'text' : 'password'}
                style={{ paddingRight: 40 }} placeholder={t('password.min_8')}
                value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus
                autoComplete="new-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex' }}
                aria-label={showPw ? t('login.hide_password_aria') : t('login.show_password_aria')}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="rp-confirm">{t('password.confirm')}</label>
            <input id="rp-confirm" className="field-input" type={showPw ? 'text' : 'password'}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              autoComplete="new-password" />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={reset.isPending}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={reset.isPending}>
              {reset.isPending ? t('common.saving') : t('account.reset_button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
