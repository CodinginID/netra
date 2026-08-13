import { useState } from 'react'
import { CheckCircle2, XCircle, MessageCircle } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { useDemoRequests } from '@/hooks/useApiQueries'
import { useUpdateDemoRequestStatus } from '@/hooks/useApiMutations'
import { type DemoRequestOut } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import '@/styles/layout.css'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Local mobile number → E.164-ish digits wa.me expects (no `+`). */
function toWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  return digits.startsWith('0') ? `62${digits.slice(1)}` : digits
}

function buildWhatsAppUrl(r: DemoRequestOut, template: string): string {
  const message = template.replace('{name}', r.name).replace('{organization}', r.organization)
  return `https://wa.me/${toWhatsAppDigits(r.phone ?? '')}?text=${encodeURIComponent(message)}`
}

function StatusBadge({ status }: { status: DemoRequestOut['status'] }) {
  const { t } = useI18n()
  const statusClass: Record<DemoRequestOut['status'], string> = {
    new: 'badge-blue',
    contacted: 'badge-gray',
    closed: 'badge-green',
  }

  return (
    <span className={`badge ${statusClass[status] ?? 'badge-gray'}`}>
      {t(`demo_requests.status_${status}`)}
    </span>
  )
}

export function DemoRequestsPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const updateStatus = useUpdateDemoRequestStatus()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [statusFilter, setStatusFilter] = useState<DemoRequestOut['status'] | ''>('')

  const { data, isLoading, refetch } = useDemoRequests({
    page,
    limit,
    status: statusFilter || undefined,
  })

  const requests = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  const handleSetStatus = async (demoRequestId: string, status: DemoRequestOut['status']) => {
    try {
      await updateStatus.mutateAsync({ demoRequestId, status })
      refetch()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_save_failed'), 'error')
    }
  }

  const handleSendWhatsApp = (r: DemoRequestOut) => {
    window.open(buildWhatsAppUrl(r, t('demo_requests.wa_message')), '_blank', 'noopener,noreferrer')
    if (r.status === 'new') handleSetStatus(r.id, 'contacted')
  }

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">{t('demo_requests.title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('demo_requests.subtitle')}
          </p>
        </div>
      </div>

      <div className="filter-row">
        <select
          className="field-input"
          style={{ maxWidth: 200 }}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as DemoRequestOut['status'] | '')
            setPage(1)
          }}
        >
          <option value="">{t('demo_requests.filter_all')}</option>
          <option value="new">{t('demo_requests.status_new')}</option>
          <option value="contacted">{t('demo_requests.status_contacted')}</option>
          <option value="closed">{t('demo_requests.status_closed')}</option>
        </select>
      </div>

      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('demo_requests.col_name')}</th>
              <th>{t('demo_requests.col_org')}</th>
              <th>{t('demo_requests.col_contact')}</th>
              <th>{t('demo_requests.col_message')}</th>
              <th>{t('demo_requests.col_status')}</th>
              <th>{t('demo_requests.col_date')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              [0, 1, 2].map((i) => (
                <tr key={`sk-${i}`}>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-badge" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text" style={{ width: 140, marginLeft: 'auto' }} /></td>
                </tr>
              ))}

            {!isLoading && requests.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('demo_requests.empty')}</div>
                </td>
              </tr>
            )}

            {!isLoading &&
              requests.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.organization}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>
                    <div>{r.email}</div>
                    {r.phone && <div>{r.phone}</div>}
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', maxWidth: 260 }}>{r.message ?? '-'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(r.created_at)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.status === 'new' && r.phone && (
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleSendWhatsApp(r)}
                        disabled={updateStatus.isPending}
                        title={t('demo_requests.send_whatsapp')}
                      >
                        <MessageCircle size={14} />
                        {t('demo_requests.send_whatsapp')}
                      </button>
                    )}
                    {r.status === 'new' && !r.phone && (
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleSetStatus(r.id, 'contacted')}
                        disabled={updateStatus.isPending}
                        title={t('demo_requests.mark_contacted')}
                      >
                        <CheckCircle2 size={14} />
                        {t('demo_requests.mark_contacted')}
                      </button>
                    )}
                    {r.status !== 'new' && r.phone && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => window.open(buildWhatsAppUrl(r, t('demo_requests.wa_message')), '_blank', 'noopener,noreferrer')}
                        title={t('demo_requests.chat')}
                      >
                        <MessageCircle size={14} />
                        {t('demo_requests.chat')}
                      </button>
                    )}
                    {r.status !== 'closed' && (
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleSetStatus(r.id, 'closed')}
                        disabled={updateStatus.isPending}
                        title={t('demo_requests.mark_closed')}
                        style={{ marginLeft: 6 }}
                      >
                        <XCircle size={14} />
                        {t('demo_requests.mark_closed')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
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
    </div>
  )
}
