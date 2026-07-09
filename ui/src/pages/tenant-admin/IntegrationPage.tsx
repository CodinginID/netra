import { useState } from 'react'
import { KeyRound, Plus, Copy, Trash2, RefreshCw, Ban, Check, BookOpen, ChevronDown } from 'lucide-react'
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
  useUpdateApiKeyOrigins,
} from '@/hooks/useApiMutations'
import '@/styles/layout.css'

// Public API base shown in the developer guide. The client's app integrates
// against production, so prefer the configured prod URL over the dashboard origin.
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'https://api-netra.flowbiz.id/api/v1'
// The embed enrollment page is served by the frontend (this same app origin).
const EMBED_PAGE_BASE = window.location.origin

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

function CreateKeyModal({
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

function EditOriginsModal({
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

const H4: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '18px 0 4px' }
const P: React.CSSProperties = { fontSize: 13.5, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }

const EMBED_MINT_SNIPPET = `# Call this from YOUR backend (keeps the key secret), then pass {url} to the frontend
curl -X POST "${API_BASE_URL}/integration/embed-sessions" \\
  -H "X-API-Key: ntr_live_xxxxx" -H "Content-Type: application/json" \\
  -d '{"external_id":"NIS123","full_name":"Budi","return_origin":"https://app.anda.id","is_minor":false}'
# -> { "data": { "url": "${EMBED_PAGE_BASE}/embed/enroll?token=...", "expires_at": "..." } }`

const EMBED_IFRAME_SNIPPET = `<iframe src="{url-dari-langkah-mint}" allow="camera"
        style="width:100%;height:600px;border:0;border-radius:12px"></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.data?.source !== 'netra') return            // verifikasi pesan dari netra
    if (e.data.type === 'enroll:success') {
      // tutup iframe, segarkan status enrolled user (e.data.user_id)
    } else if (e.data.type === 'enroll:error') {
      alert(e.data.message)
    }
  })
</script>`

function AiPromptTab() {
  const { t } = useI18n()
  // A ready-to-paste prompt the tenant's dev feeds to an AI coding assistant.
  // Tailored to netra's actual endpoints so the AI scaffolds a correct integration.
  const prompt = `You are building a frontend + thin backend that integrates our app with the
Netra attendance API (face-recognition attendance SaaS holding our data).

AUTH & BASE
- Base URL: ${API_BASE_URL}
- Every request sends header:  X-API-Key: <YOUR_NETRA_API_KEY>
- SECURITY: the API key is server-to-server only. Keep it on OUR backend and
  expose thin proxy routes to the frontend. NEVER ship the key to the browser.
- All responses look like: { "data": ..., "error": null }. Lists are paginated:
  { items: [...], total, page, limit, pages }.

ENDPOINTS TO USE
- GET  /integration/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=50
       -> attendance records (type check_in/check_out, status, occurred_at, location)
- GET  /integration/attendance/daily-status?date=YYYY-MM-DD
       -> roster: each user present/late/absent/checked_out today
- GET  /integration/users?page=1&limit=50
       -> end-users with { id, full_name, external_id, enrolled, is_active }
- POST /integration/embed-sessions
       body: { external_id, full_name, return_origin, is_minor }
       -> { url }  (a one-time enrollment page URL; expires ~15 min, single use)

WHAT TO BUILD
1) Attendance dashboard: date-range filter + paginated table of records.
2) Daily status view: today's present/late/absent list.
3) People view: list users + an "Enrolled" badge from /integration/users.
4) "Register face" button per user -> opens Netra's embedded enrollment:
   a. OUR backend calls POST /integration/embed-sessions with that user's
      external_id + full_name + return_origin (our app origin) -> gets { url }.
   b. Frontend shows <iframe src="{url}" allow="camera"> in a modal.
   c. Listen for window 'message'; when event.origin === Netra origin AND
      data.source === 'netra':
        - data.type === 'enroll:success' -> close modal, refresh enrolled status
        - data.type === 'enroll:error'   -> show data.message
5) (Optional) A backend webhook receiver for real-time events
   (attendance.check_in, attendance.check_out, enrollment.completed), HMAC-signed.

REQUIREMENTS
- Backend proxy routes hide the API key; frontend calls only our own backend.
- Handle loading / empty / error states and pagination.
- Match our existing stack and design system.

Generate the backend proxy + the frontend pages.`

  return (
    <>
      <p style={{ ...P, marginBottom: 12 }}>{t('integration.ai_intro')}</p>
      <h4 style={H4}>{t('integration.ai_prompt_label')}</h4>
      <CodeBlock code={prompt} />
      <p style={{ ...P, marginTop: 12, color: 'var(--color-danger)' }}>{t('integration.ai_note')}</p>
    </>
  )
}

function ApiStepsTab() {
  const { t } = useI18n()
  const curlList = `curl -H "X-API-Key: ntr_live_xxxxx" \\
  "${API_BASE_URL}/integration/attendance?from=2026-06-01&to=2026-06-30&page=1&limit=50"`
  const curlStatus = `curl -H "X-API-Key: ntr_live_xxxxx" \\
  "${API_BASE_URL}/integration/attendance/daily-status?date=2026-06-25"`
  const curlUsers = `curl -H "X-API-Key: ntr_live_xxxxx" \\
  "${API_BASE_URL}/integration/users?page=1&limit=50"`
  const sampleResponse = `{
  "data": {
    "items": [
      { "id": "…", "user_id": "…", "type": "check_in", "status": "on_time",
        "occurred_at": "2026-06-25T08:01:12+07:00", "liveness_score": 0.99,
        "location": { "lat": -6.2, "lng": 106.8, "outside_geofence": false } }
    ],
    "total": 1, "page": 1, "limit": 50, "pages": 1
  }, "error": null
}`

  return (
    <>
      <h4 style={{ ...H4, marginTop: 0 }}>{t('integration.guide_step1_title')}</h4>
      <ul style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.7, paddingLeft: 18, marginBottom: 6 }}>
        <li>{t('integration.guide_step1_li1')}</li>
        <li>{t('integration.guide_step1_li2')}</li>
        <li>{t('integration.guide_step1_li3')}</li>
      </ul>

      <h4 style={H4}>{t('integration.guide_step2_title')}</h4>
      <p style={P}>{t('integration.guide_step2_desc')}</p>
      <CodeBlock code={API_BASE_URL} />

      <h4 style={H4}>{t('integration.guide_step3_title')}</h4>
      <p style={P}>{t('integration.guide_step3_desc')}</p>
      <CodeBlock code={curlList} />

      <h4 style={H4}>{t('integration.guide_step4_title')}</h4>
      <p style={P}>{t('integration.guide_step4_desc')}</p>
      <CodeBlock code={curlStatus} />

      <h4 style={H4}>{t('integration.guide_users_title')}</h4>
      <p style={P}>{t('integration.guide_users_desc')}</p>
      <CodeBlock code={curlUsers} />

      <h4 style={H4}>{t('integration.guide_step5_title')}</h4>
      <p style={P}>{t('integration.guide_step5_desc')}</p>
      <CodeBlock code={sampleResponse} />

      <h4 style={H4}>{t('integration.guide_notes_title')}</h4>
      <ul style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
        <li>{t('integration.guide_notes_li1')}</li>
        <li>{t('integration.guide_notes_li2')}</li>
        <li>{t('integration.guide_notes_li3')}</li>
        <li>{t('integration.guide_notes_li4')}</li>
      </ul>
    </>
  )
}

function Step({
  n,
  title,
  children,
  last,
  defaultOpen = false,
}: {
  n: number
  title: string
  children: React.ReactNode
  last?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
      {/* number badge + connector line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: open ? 'var(--color-brand)' : 'var(--color-surface)',
            border: open ? 'none' : '2px solid var(--color-border)',
            color: open ? '#fff' : 'var(--color-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14, transition: 'all 0.2s ease',
          }}
        >
          {n}
        </div>
        {!last && <div style={{ flex: 1, width: 2, background: 'var(--color-border)', marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: last ? 0 : 18, minWidth: 0 }}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            width: '100%', padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text)' }}>{title}</span>
          <ChevronDown
            size={18}
            style={{
              flexShrink: 0, color: 'var(--color-text-muted)',
              transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease',
            }}
          />
        </button>
        {/* smooth collapse via grid 0fr→1fr */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: open ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.26s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div style={{ paddingTop: 6 }}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function IntegrationGuide() {
  const { t } = useI18n()
  const [mode, setMode] = useState<'ai' | 'manual'>('ai')

  const modeBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 13px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-brand)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  })

  return (
    <div className="data-card" style={{ padding: 20, marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <BookOpen size={18} color="var(--color-brand)" />
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          {t('integration.guide_title')}
        </h3>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginBottom: 22, lineHeight: 1.6 }}>
        {t('integration.guide_desc')}
      </p>

      <Step n={1} title={t('integration.step1_title')} defaultOpen>
        <p style={P}>{t('integration.step1_body')}</p>
      </Step>

      <Step n={2} title={t('integration.step2_title')}>
        <p style={{ ...P, marginBottom: 10 }}>{t('integration.step2_choose')}</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button style={modeBtn(mode === 'ai')} onClick={() => setMode('ai')}>{t('integration.mode_ai')}</button>
          <button style={modeBtn(mode === 'manual')} onClick={() => setMode('manual')}>{t('integration.mode_manual')}</button>
        </div>
        {mode === 'ai' ? <AiPromptTab /> : <ApiStepsTab />}
      </Step>

      <Step n={3} title={t('integration.step3_title')}>
        <p style={P}>{t('integration.guide_embed_desc')}</p>
        <CodeBlock code={EMBED_MINT_SNIPPET} />
        <CodeBlock code={EMBED_IFRAME_SNIPPET} />
        <p style={{ ...P, marginTop: 10, color: 'var(--color-text-muted)' }}>{t('integration.step3_note')}</p>
      </Step>

      <Step n={4} title={t('integration.step4_title')} last>
        <p style={P}>{t('integration.step4_body')}</p>
        <p style={{ ...P, marginTop: 6 }}>{t('integration.guide_webhook_desc')}</p>
      </Step>
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
  const [editingOrigins, setEditingOrigins] = useState<ApiKeyOut | null>(null)

  const createMutation = useCreateApiKey(() => {
    setShowForm(false)
    show(t('integration.toast_created'), 'success')
  })
  const rotateMutation = useRotateApiKey()
  const revokeMutation = useRevokeApiKey(() => show(t('integration.toast_revoked'), 'success'))
  const deleteMutation = useDeleteApiKey(() => show(t('integration.toast_deleted'), 'success'))
  const updateOriginsMutation = useUpdateApiKeyOrigins(() => {
    setEditingOrigins(null)
    show(t('integration.toast_origins_updated'), 'success')
  })

  const handleCreate = (payload: { name: string; scopes: string[]; expires_in_days?: number | null; allowed_origins: string[] }) => {
    createMutation.mutate(payload, {
      onSuccess: (k) => { setRotated(false); setNewKey(k) },
      onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_create_failed'), 'error'),
    })
  }
  const handleUpdateOrigins = (allowedOrigins: string[]) => {
    if (!editingOrigins) return
    updateOriginsMutation.mutate(
      { keyId: editingOrigins.id, allowedOrigins },
      { onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_origins_failed'), 'error') },
    )
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

      {editingOrigins && (
        <EditOriginsModal
          apiKey={editingOrigins}
          onSubmit={handleUpdateOrigins}
          onCancel={() => setEditingOrigins(null)}
          submitting={updateOriginsMutation.isPending}
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

              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                <div style={{ marginBottom: 4 }}>{t('integration.origins_card_label')}:</div>
                {k.allowed_origins.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {k.allowed_origins.map((o) => (
                      <span key={o} className="badge badge-gray" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {o}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span>{t('integration.origins_none')}</span>
                )}
              </div>

              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{t('integration.last_used')}: {formatDate(k.last_used_at)}</span>
                <span>{t('integration.expires')}: {k.expires_at ? formatDate(k.expires_at) : t('integration.no_expiry')}</span>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingOrigins(k)}>
                  <KeyRound size={14} /> {t('integration.edit_origins_btn')}
                </button>
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
