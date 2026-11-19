import { useState } from 'react'
import { CheckCircle2, MessageCircle, XCircle } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { useDemoRequests } from '@/hooks/useApiQueries'
import { useUpdateDemoRequestStatus } from '@/hooks/useApiMutations'
import { type DemoRequestOut } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { Avatar, Chip, FilterPills, PageHead, formatDate, type Tone } from './saShared'
import '@/styles/pages/sa-billing.css'

type Status = DemoRequestOut['status']

/** Local mobile number → E.164-ish digits wa.me expects (no `+`). */
function toWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits
}

function buildWhatsAppUrl(r: DemoRequestOut, template: string): string {
  const message = template.replace('{name}', r.name).replace('{organization}', r.organization)
  return `https://wa.me/${toWhatsAppDigits(r.phone ?? '')}?text=${encodeURIComponent(message)}`
}

/** "2 jam lalu", "kemarin"… falling back to a date after a week. */
function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '-'
  const mins = Math.round((then - Date.now()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en' : 'id', { numeric: 'auto' })
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute')
  const hours = Math.round(mins / 60)
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 7) return rtf.format(days, 'day')
  return formatDate(iso)
}

const STATUS_TONE: Record<Status, Tone> = { new: 'b', contacted: 'w', closed: 'g' }

/** Count for one filter pill (total only — a 1-row page is enough). */
function useCount(status?: Status): number | undefined {
  return useDemoRequests({ page: 1, limit: 1, status }).data?.total
}

/** Permintaan demo — mockup 0f2c0622: one card per lead, newest first. */
export function DemoRequestsPage() {
  const { t, locale } = useI18n()
  const { show } = useToast()
  const updateStatus = useUpdateDemoRequestStatus()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [statusFilter, setStatusFilter] = useState<Status | ''>('')

  const { data, isLoading, refetch } = useDemoRequests({
    page,
    limit,
    status: statusFilter || undefined,
  })
  const counts = {
    all: useCount(),
    new: useCount('new'),
    contacted: useCount('contacted'),
    closed: useCount('closed'),
  }

  const requests = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  const handleSetStatus = async (demoRequestId: string, status: Status) => {
    try {
      await updateStatus.mutateAsync({ demoRequestId, status })
      refetch()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_save_failed'), 'error')
    }
  }

  const openWhatsApp = (r: DemoRequestOut) =>
    window.open(buildWhatsAppUrl(r, t('demo_requests.wa_message')), '_blank', 'noopener,noreferrer')

  const handleSendWhatsApp = (r: DemoRequestOut) => {
    openWhatsApp(r)
    if (r.status === 'new') handleSetStatus(r.id, 'contacted')
  }

  const busy = updateStatus.isPending

  return (
    <div className="sa-page">
      <PageHead title={t('demo_requests.title')} sub={t('demo_requests.subtitle')} />

      <FilterPills<Status | ''>
        ariaLabel={t('demo_requests.col_status')}
        value={statusFilter}
        onChange={(v) => {
          setStatusFilter(v)
          setPage(1)
        }}
        options={[
          { value: '', label: t('demo_requests.filter_all'), count: counts.all },
          { value: 'new', label: t('demo_requests.status_new'), count: counts.new },
          { value: 'contacted', label: t('demo_requests.status_contacted'), count: counts.contacted },
          { value: 'closed', label: t('demo_requests.status_closed'), count: counts.closed },
        ]}
      />

      <div className="dr-list" aria-busy={isLoading}>
        {isLoading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="sa-card dr-card">
              <div className="skeleton skeleton-text" style={{ width: '60%' }} />
            </div>
          ))}

        {!isLoading && requests.length === 0 && (
          <div className="sa-card"><div className="sa-empty">{t('demo_requests.empty')}</div></div>
        )}

        {!isLoading &&
          requests.map((r) => (
            <article key={r.id} className={`sa-card dr-card${r.status === 'new' ? ' is-new' : ''}`}>
              <Avatar name={r.name} />
              <div className="dr-body">
                <div className="dr-top">
                  <span className="dr-name">{r.name}</span>
                  <time className="dr-time" dateTime={r.created_at} title={formatDate(r.created_at)}>
                    {relativeTime(r.created_at, locale)}
                  </time>
                </div>
                <div className="dr-contact">
                  {r.organization} · <a href={`mailto:${r.email}`}>{r.email}</a>
                  {r.phone && <> · {r.phone}</>}
                </div>
                {r.message && <div className="dr-msg">{r.message}</div>}
                <div className="dr-foot">
                  <Chip tone={STATUS_TONE[r.status] ?? 'm'}>{t(`demo_requests.status_${r.status}`)}</Chip>
                  <div className="dr-actions">
                    {r.status === 'new' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => handleSetStatus(r.id, 'contacted')} disabled={busy}>
                        <CheckCircle2 size={14} />
                        {t('demo_requests.mark_contacted')}
                      </button>
                    )}
                    {r.status === 'new' && r.phone && (
                      <button className="btn btn-sm btn-success" onClick={() => handleSendWhatsApp(r)} disabled={busy}>
                        <MessageCircle size={14} />
                        {t('demo_requests.send_whatsapp')}
                      </button>
                    )}
                    {r.status !== 'new' && r.phone && (
                      <button className="btn btn-sm btn-ghost" onClick={() => openWhatsApp(r)}>
                        <MessageCircle size={14} />
                        {t('demo_requests.chat')}
                      </button>
                    )}
                    {r.status !== 'closed' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => handleSetStatus(r.id, 'closed')} disabled={busy}>
                        <XCircle size={14} />
                        {t('demo_requests.mark_closed')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
      </div>

      {!isLoading && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          pages={pages}
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}
