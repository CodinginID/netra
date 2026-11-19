import { useState } from 'react'
import { Copy, X } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import type { DeviceOut, DeviceRegistered } from '@/api/adminApi'

export function AddDeviceModal({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (name: string) => void
  onCancel: () => void
  submitting: boolean
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose: onCancel })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onCancel}>
      <div className="modal-card" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="dev-add-title"
        onClick={(e) => e.stopPropagation()}>
        <h3 id="dev-add-title" className="modal-title">{t('devices.add_title')}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) onSubmit(name.trim())
          }}
        >
          <div className="field">
            <label htmlFor="device-name">{t('devices.name_label')}</label>
            <input
              id="device-name"
              className="field-input"
              autoFocus
              type="text"
              placeholder={t('devices.name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {t('devices.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? t('devices.submit_loading') : t('devices.register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export type TokenDialogMode = 'created' | 'regenerated' | 'viewed'

/** Shows a device token once (after create / reset) or on demand, with a copy button. */
export function DeviceTokenDialog({ device, mode, onClose }: { device: DeviceRegistered; mode: TokenDialogMode; onClose: () => void }) {
  const { t } = useI18n()
  const { show } = useToast()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const title = mode === 'viewed'
    ? t('devices.token_viewed', { name: device.name })
    : mode === 'regenerated'
      ? t('devices.token_created_new', { name: device.name })
      : t('devices.device_created', { name: device.name })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card dev-token-dialog" ref={modalRef} role="dialog" aria-modal="true"
        aria-labelledby="dev-token-title" onClick={(e) => e.stopPropagation()}>
        <div className="dev-token-head">
          <h3 id="dev-token-title" className="modal-title">{title}</h3>
          <button type="button" className="btn-icon" aria-label={t('devices.token_close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p className="dev-token-warning">{t('devices.token_warning')}</p>
        <div className="dev-token-box">
          <code>{device.token}</code>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => navigator.clipboard?.writeText(device.token).then(() => show(t('devices.toast_copied'), 'success'))}
          >
            <Copy size={14} /> {t('devices.copy_token')}
          </button>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {mode === 'viewed' ? t('devices.token_close') : t('devices.token_saved')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DeleteDeviceModal({
  device,
  onConfirm,
  onClose,
  loading,
}: {
  device: DeviceOut
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} role="alertdialog" aria-modal="true" aria-labelledby="dev-del-title"
        style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 id="dev-del-title" className="modal-title">{t('devices.delete_title')}</h3>
        <p className="dev-modal-text">{t('devices.delete_confirm', { name: device.name })}</p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>{t('devices.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? t('devices.delete_loading') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
