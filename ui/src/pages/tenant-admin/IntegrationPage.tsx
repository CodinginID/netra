import { useState } from 'react'
import { KeyRound, Plus, Copy, Trash2, RefreshCw, Ban, Check, BookOpen } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import { MobileFab } from '@/components/MobileFab'
import type { ApiKeyOut, ApiKeyCreated } from '@/api/adminApi'
import { useApiKeys, useApiKeyScopes } from '@/hooks/useApiQueries'
import {
  useCreateApiKey,
  useRotateApiKey,
  useRevokeApiKey,
  useDeleteApiKey,
} from '@/hooks/useApiMutations'
import '@/styles/layout.css'

const API_BASE_URL = `${window.location.origin}/api/v1`

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn btn-ghost btn-sm"
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? t('integration.copied') : (label ?? t('integration.copy'))}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div style={{ position: 'relative', marginTop: 8 }}>
      <div style={{ position: 'absolute', top: 8, right: 8 }}>
        <CopyButton text={code} />
      </div>
      <pre
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px',
          overflowX: 'auto',
          fontSize: 12.5,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        <code style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{code}</code>
      </pre>
    </div>
  )
}

function ScopeBadges({ scopes }: { scopes: string[] }) {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
      {scopes.map((s) => (
        <span key={s} className="badge badge-gray" style={{ fontFamily: 'monospace', fontSize: 11 }}>
          {s}
        </span>
      ))}
    </span>
  )
}

function NewKeyBanner({ apiKey, rotated, onDismiss }: { apiKey: ApiKeyCreated; rotated?: boolean; onDismiss: () => void }) {
  const { t } = useI18n()
  return (
    <div className="data-card" style={{ border: '1px solid var(--color-success)', padding: 16, marginBottom: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)', marginBottom: 6 }}>
        {rotated
          ? t('integration.new_key_title_rotated', { name: apiKey.name })
          : t('integration.key_created', { name: apiKey.name })}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 10 }}>
        {t('integration.key_warning')}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <code style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--color-text)', wordBreak: 'break-all' }}>
          {apiKey.key}
        </code>
        <CopyButton text={apiKey.key} />
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss} style={{ marginTop: 10 }}>
        {t('integration.key_saved')}
      </button>
    </div>
  )
}

function CreateKeyModal({
  scopes,
  onSubmit,
  onCancel,
  submitting,
}: {
  scopes: Record<string, string>
  onSubmit: (payload: { name: string; scopes: string[]; expires_in_days?: number | null }) => void
  onCancel: () => void
  submitting: boolean
}) {
  const { t } = useI18n()
  const allScopes = Object.keys(scopes)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>(allScopes.length ? [allScopes[0]] : [])
  const [expiry, setExpiry] = useState<string>('')
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

function IntegrationGuide() {
  const { t } = useI18n()
  const curlList = `curl -H "X-API-Key: ntr_live_xxxxx" \\
  "${API_BASE_URL}/integration/attendance?from=2026-06-01&to=2026-06-30&page=1&limit=50"`
  const curlStatus = `curl -H "X-API-Key: ntr_live_xxxxx" \\
  "${API_BASE_URL}/integration/attendance/daily-status?date=2026-06-25"`
  const sampleResponse = `{
  "data": {
    "items": [
      {
        "id": "…",
        "user_id": "…",
        "type": "check_in",
        "status": "on_time",
        "occurred_at": "2026-06-25T08:01:12+07:00",
        "liveness_score": 0.99,
        "device_id": "…",
        "location": { "lat": -6.2, "lng": 106.8, "outside_geofence": false },
        "created_at": "2026-06-25T01:01:12Z"
      }
    ],
    "total": 1, "page": 1, "limit": 50, "pages": 1
  },
  "error": null
}`

  return (
    <div className="data-card" style={{ padding: 20, marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <BookOpen size={18} color="var(--color-brand)" />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          {t('integration.guide_title')}
        </h3>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginBottom: 18, lineHeight: 1.6 }}>
        {t('integration.guide_desc')}
      </p>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>{t('integration.guide_step1_title')}</h4>
      <ul style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.7, paddingLeft: 18, marginBottom: 18 }}>
        <li>{t('integration.guide_step1_li1')}</li>
        <li>{t('integration.guide_step1_li2')}</li>
        <li>{t('integration.guide_step1_li3')}</li>
      </ul>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>{t('integration.guide_step2_title')}</h4>
      <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
        {t('integration.guide_step2_desc')}
      </p>
      <CodeBlock code={API_BASE_URL} />

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '18px 0 4px' }}>
        {t('integration.guide_step3_title')}
      </h4>
      <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', margin: 0 }}>
        {t('integration.guide_step3_desc')}
      </p>
      <CodeBlock code={curlList} />

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '18px 0 4px' }}>
        {t('integration.guide_step4_title')}
      </h4>
      <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', margin: 0 }}>
        {t('integration.guide_step4_desc')}
      </p>
      <CodeBlock code={curlStatus} />

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '18px 0 4px' }}>{t('integration.guide_step5_title')}</h4>
      <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', margin: 0 }}>
        {t('integration.guide_step5_desc')}
      </p>
      <CodeBlock code={sampleResponse} />

      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '18px 0 4px' }}>{t('integration.guide_notes_title')}</h4>
      <ul style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
        <li>{t('integration.guide_notes_li1')}</li>
        <li>{t('integration.guide_notes_li2')}</li>
        <li>{t('integration.guide_notes_li3')}</li>
        <li>{t('integration.guide_notes_li4')}</li>
      </ul>
    </div>
  )
}

export function IntegrationPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const { data: keys, isLoading, error } = useApiKeys()
  const { data: scopes } = useApiKeyScopes()
  const [showForm, setShowForm] = useState(false)
  const [newKey, setNewKey] = useState<ApiKeyCreated | null>(null)
  const [rotated, setRotated] = useState(false)

  const createMutation = useCreateApiKey(() => {
    setShowForm(false)
    show(t('integration.toast_created'), 'success')
  })
  const rotateMutation = useRotateApiKey()
  const revokeMutation = useRevokeApiKey(() => show(t('integration.toast_revoked'), 'success'))
  const deleteMutation = useDeleteApiKey(() => show(t('integration.toast_deleted'), 'success'))

  const handleCreate = (payload: { name: string; scopes: string[]; expires_in_days?: number | null }) => {
    createMutation.mutate(payload, { onSuccess: (k) => { setRotated(false); setNewKey(k) } })
  }
  const handleRotate = (k: ApiKeyOut) => {
    if (!window.confirm(t('integration.reset_confirm', { name: k.name }))) return
    rotateMutation.mutate(k.id, {
      onSuccess: (nk) => { setRotated(true); setNewKey(nk); show(t('integration.toast_key_created'), 'success') },
      onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_reset_failed'), 'error'),
    })
  }
  const handleRevoke = (k: ApiKeyOut) => {
    if (!window.confirm(t('integration.revoke_confirm', { name: k.name }))) return
    revokeMutation.mutate(k.id, { onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_revoke_failed'), 'error') })
  }
  const handleDelete = (k: ApiKeyOut) => {
    if (!window.confirm(t('integration.delete_confirm', { name: k.name }))) return
    deleteMutation.mutate(k.id, { onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_delete_failed'), 'error') })
  }

  const rows = keys ?? []

  return (
    <div>
      <div className="page-toolbar" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 className="page-title">{t('integration.title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('integration.subtitle')}
          </p>
        </div>
        <button className="btn btn-primary add-fab-twin" onClick={() => setShowForm(true)}>
          <Plus size={16} /> {t('integration.add')}
        </button>
      </div>

      {newKey && <NewKeyBanner apiKey={newKey} rotated={rotated} onDismiss={() => setNewKey(null)} />}

      {showForm && (
        <CreateKeyModal
          scopes={scopes ?? { 'attendance:read': 'Baca catatan & laporan kehadiran' }}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          submitting={createMutation.isPending}
        />
      )}

      {error && <div className="error-banner">{error instanceof Error ? error.message : t('integration.load_error')}</div>}

      {isLoading ? (
        <div className="empty-state">{t('integration.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="data-card">
          <EmptyState
            icon="monitor"
            title={t('integration.empty')}
            description={t('integration.empty_desc')}
            action={
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                {t('integration.add')}
              </button>
            }
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {rows.map((k) => (
            <div key={k.id} className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <KeyRound size={16} color="var(--color-brand)" />
                  <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)' }}>{k.name}</span>
                </div>
                <span className={`badge ${k.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                  {k.status === 'active' ? t('integration.status_active') : t('integration.status_revoked')}
                </span>
              </div>

              <code style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text-muted)' }}>
                {k.prefix}…
              </code>
              <ScopeBadges scopes={k.scopes} />

              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{t('integration.last_used')}: {formatDate(k.last_used_at)}</span>
                <span>{t('integration.expires')}: {k.expires_at ? formatDate(k.expires_at) : t('integration.no_expiry')}</span>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => handleRotate(k)} title={t('integration.reset_title')}>
                  <RefreshCw size={14} /> {t('integration.reset_btn')}
                </button>
                {k.status === 'active' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => handleRevoke(k)}>
                    <Ban size={14} /> {t('integration.revoke_btn')}
                  </button>
                )}
                <button
                  className="btn-icon btn-icon-danger"
                  title={t('integration.delete_permanent')}
                  aria-label={t('integration.delete_permanent_aria')}
                  onClick={() => handleDelete(k)}
                  style={{ marginLeft: 'auto' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <IntegrationGuide />

      <MobileFab onClick={() => setShowForm(true)} label={t('integration.add')}>
        <Plus size={24} />
      </MobileFab>
    </div>
  )
}
