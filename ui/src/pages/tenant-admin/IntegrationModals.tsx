import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { useModalA11y } from '@/hooks/useModalA11y'
import type { ApiKeyOut, ApiKeyCreated } from '@/api/adminApi'
import { CopyButton } from './IntegrationGuide'

export type CreateKeyPayload = { name: string; scopes: string[]; expires_in_days?: number | null; allowed_origins: string[] }

/** Shows a freshly created / rotated key once, with a copy button. */
export function NewKeyDialog({ apiKey, rotated, onClose }: { apiKey: ApiKeyCreated; rotated?: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card int-key-dialog" ref={modalRef} role="dialog" aria-modal="true"
        aria-labelledby="int-key-title" onClick={(e) => e.stopPropagation()}>
        <div className="int-dialog-head">
          <h3 id="int-key-title" className="modal-title">
            {rotated
              ? t('integration.new_key_title_rotated', { name: apiKey.name })
              : t('integration.key_created', { name: apiKey.name })}
          </h3>
          <button type="button" className="btn-icon" aria-label={t('common.close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p className="int-key-warning">{t('integration.key_warning')}</p>
        <div className="int-key-box">
          <code>{apiKey.key}</code>
          <CopyButton text={apiKey.key} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>{t('integration.key_saved')}</button>
        </div>
      </div>
    </div>
  )
}

/** Add one origin to the chosen key (the "+ Tambah origin" button on the origin card). */
export function AddOriginModal({
  keys,
  onSubmit,
  onCancel,
  submitting,
}: {
  keys: ApiKeyOut[]
  onSubmit: (key: ApiKeyOut, origin: string) => void
  onCancel: () => void
  submitting: boolean
}) {
  const { t } = useI18n()
  const [keyId, setKeyId] = useState(keys[0]?.id ?? '')
  const [origin, setOrigin] = useState('')
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose: onCancel })
  const target = keys.find((k) => k.id === keyId)
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onCancel}>
      <div className="modal-card" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="int-origin-title"
        onClick={(e) => e.stopPropagation()}>
        <h3 id="int-origin-title" className="modal-title">{t('integration.add_origin_title')}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (target && origin.trim()) onSubmit(target, origin.trim())
          }}
        >
          {keys.length > 1 && (
            <div className="field">
              <label htmlFor="int-origin-key">{t('integration.origin_key_label')}</label>
              <select id="int-origin-key" className="field-input" value={keyId} onChange={(e) => setKeyId(e.target.value)}>
                {keys.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="int-origin-value">{t('integration.origins_card_label')}</label>
            <input id="int-origin-value" className="field-input" type="text" autoFocus required
              placeholder={t('integration.origins_placeholder')} value={origin} onChange={(e) => setOrigin(e.target.value)} />
            <p className="int-field-hint">{t('integration.origins_hint')}</p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('integration.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !target || !origin.trim()}>
              {submitting ? t('integration.saving') : t('integration.save_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Editable list of origin strings, shared by the create-key form and the
// edit-origins modal. Empty rows are dropped on submit (see callers).
function OriginsField({ origins, onChange }: { origins: string[]; onChange: (next: string[]) => void }) {
  const { t } = useI18n()
  const rows = origins.length ? origins : ['']

  const setAt = (i: number, value: string) => onChange(rows.map((v, idx) => (idx === i ? value : v)))
  const removeAt = (i: number) => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <div className="field">
      <label>{t('integration.origins_label')}</label>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '2px 0 8px' }}>
        {t('integration.origins_hint')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((origin, i) => (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <input
              className="field-input"
              type="text"
              placeholder={t('integration.origins_placeholder')}
              value={origin}
              onChange={(e) => setAt(i, e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn-icon btn-icon-danger"
              aria-label={t('integration.origins_remove')}
              onClick={() => removeAt(i)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 8 }}
        onClick={() => onChange([...rows, ''])}
      >
        {t('integration.origins_add')}
      </button>
    </div>
  )
}

export function CreateKeyModal({
  scopes,
  onSubmit,
  onCancel,
  submitting,
}: {
  scopes: Record<string, string>
  onSubmit: (payload: { name: string; scopes: string[]; expires_in_days?: number | null; allowed_origins: string[] }) => void
  onCancel: () => void
  submitting: boolean
}) {
  const { t } = useI18n()
  const allScopes = Object.keys(scopes)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>(allScopes.length ? [allScopes[0]] : [])
  const [expiry, setExpiry] = useState<string>('')
  const [origins, setOrigins] = useState<string[]>([])
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose: onCancel })

  const toggle = (s: string) =>
    setSelected((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onCancel}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('integration.create_title')}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && selected.length) {
              onSubmit({
                name: name.trim(),
                scopes: selected,
                expires_in_days: expiry ? Number(expiry) : null,
                allowed_origins: origins.map((o) => o.trim()).filter(Boolean),
              })
            }
          }}
        >
          <div className="field">
            <label htmlFor="key-name">{t('integration.key_name_label')}</label>
            <input
              id="key-name"
              className="field-input"
              autoFocus
              type="text"
              placeholder={t('integration.key_name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>{t('integration.scopes_label')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {allScopes.map((s) => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.includes(s)} onChange={() => toggle(s)} />
                  <code style={{ fontFamily: 'monospace' }}>{s}</code>
                  <span style={{ color: 'var(--color-text-muted)' }}>— {scopes[s]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="key-expiry">{t('integration.expiry_label')}</label>
            <select id="key-expiry" className="field-input" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              <option value="">{t('integration.expiry_none')}</option>
              <option value="30">{t('integration.expiry_30')}</option>
              <option value="90">{t('integration.expiry_90')}</option>
              <option value="365">{t('integration.expiry_365')}</option>
            </select>
          </div>

          <OriginsField origins={origins} onChange={setOrigins} />

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {t('integration.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim() || !selected.length}>
              {submitting ? t('integration.creating') : t('integration.create_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function EditOriginsModal({
  apiKey,
  onSubmit,
  onCancel,
  submitting,
}: {
  apiKey: ApiKeyOut
  onSubmit: (allowedOrigins: string[]) => void
  onCancel: () => void
  submitting: boolean
}) {
  const { t } = useI18n()
  const [origins, setOrigins] = useState<string[]>(apiKey.allowed_origins.length ? apiKey.allowed_origins : [])
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose: onCancel })

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onCancel}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('integration.edit_origins_title', { name: apiKey.name })}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(origins.map((o) => o.trim()).filter(Boolean))
          }}
        >
          <OriginsField origins={origins} onChange={setOrigins} />
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {t('integration.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? t('integration.saving') : t('integration.save_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
