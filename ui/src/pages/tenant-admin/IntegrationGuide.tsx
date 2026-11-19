import { useState } from 'react'
import { BookOpen, Check, ChevronDown, Copy } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'

// Public API base shown in the developer guide. The client's app integrates
// against production, so prefer the configured prod URL over the dashboard origin.
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'https://api-netra.flowbiz.id/api/v1'
// The embed enrollment page is served by the frontend (this same app origin).
const EMBED_PAGE_BASE = window.location.origin

export function CopyButton({ text, label }: { text: string; label?: string }) {
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
    <div className="int-code">
      <div className="int-code-copy">
        <CopyButton text={code} />
      </div>
      <pre><code>{code}</code></pre>
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
- POST /integration/users   (scope users:write; idempotent by external_id, max 500/request)
       body: one object OR an array of { external_id, full_name }
       -> { data: { items: [{ …, created }], summary: { received, created, updated } } }
       Use to push/sync YOUR employee roster INTO Netra so records exist before
       enrollment. Safe to replay the full roster — existing people are updated,
       not duplicated. Synced users then appear in Netra's "Manage Users" menu.
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
  const curlPush = `curl -X POST "${API_BASE_URL}/integration/users" \\
  -H "X-API-Key: ntr_live_xxxxx" -H "Content-Type: application/json" \\
  -d '[{"external_id":"EMP-001","full_name":"Budi Santoso"},
       {"external_id":"EMP-002","full_name":"Siti Aminah"}]'`
  const pushResponse = `{
  "data": {
    "items": [
      { "id": "usr_…", "full_name": "Budi Santoso", "external_id": "EMP-001",
        "enrolled": false, "is_active": true, "created": true }
    ],
    "summary": { "received": 2, "created": 1, "updated": 1 }
  }, "error": null
}`
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

      <h4 style={H4}>{t('integration.guide_push_title')}</h4>
      <p style={P}>{t('integration.guide_push_desc')}</p>
      <CodeBlock code={curlPush} />
      <p style={{ ...P, marginTop: 10 }}>{t('integration.guide_push_resp')}</p>
      <CodeBlock code={pushResponse} />

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
  const bodyId = `int-step-${n}`
  return (
    <div className={`int-step${open ? ' int-step--open' : ''}`}>
      <div className="int-step-rail">
        <span className="int-step-no">{n}</span>
        {!last && <span className="int-step-line" />}
      </div>
      <div className="int-step-main">
        <button type="button" className="int-step-toggle" onClick={() => setOpen((v) => !v)}
          aria-expanded={open} aria-controls={bodyId}>
          <span>{title}</span>
          <ChevronDown size={16} className="int-step-chevron" aria-hidden="true" />
        </button>
        {/* smooth collapse via grid 0fr→1fr */}
        <div className="int-step-collapse" id={bodyId}>
          <div className="int-step-inner">
            <div className="int-step-body">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** "Panduan integrasi" card: AI / manual switch in the header, then the numbered steps. */
export function IntegrationGuide() {
  const { t } = useI18n()
  const [mode, setMode] = useState<'ai' | 'manual'>('ai')

  return (
    <section className="ops-card ops-card-pad int-guide" aria-labelledby="int-guide-title">
      <div className="int-guide-head">
        <h3 id="int-guide-title" className="ops-card-title">
          <BookOpen size={16} aria-hidden="true" /> {t('integration.guide_title')}
        </h3>
        <div className="ops-seg" role="group" aria-label={t('integration.step2_choose')}>
          {(['ai', 'manual'] as const).map((m) => (
            <button key={m} type="button" className={`ops-seg-btn${mode === m ? ' ops-seg-btn--on' : ''}`}
              aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'ai' ? t('integration.mode_ai') : t('integration.mode_manual')}
            </button>
          ))}
        </div>
      </div>
      <p className="int-guide-desc">{t('integration.guide_desc')}</p>

      <Step n={1} title={t('integration.step1_title')} defaultOpen>
        <p style={P}>{t('integration.step1_body')}</p>
      </Step>

      <Step n={2} title={t('integration.step2_title')}>
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
    </section>
  )
}
