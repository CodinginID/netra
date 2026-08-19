import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, FileText, Wallet } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { useBillingSummary, useInvoices } from '@/hooks/useApiQueries'
import { type InvoiceOut, type MoneyBucket } from '@/api/adminApi'
import { BillingTabs } from './BillingTabs'
import '@/styles/layout.css'

function formatCurrency(amount: number, currency: string = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Whole days the deadline has already passed; 0 or negative means not late. */
function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0
  const due = new Date(dueDate).getTime()
  if (Number.isNaN(due)) return 0
  return Math.floor((Date.now() - due) / 86_400_000)
}

/**
 * One currency per line. The backend never merges totals across currencies, so
 * neither does the display — a single combined figure would be meaningless.
 */
function BucketAmount({ bucket }: { bucket: MoneyBucket }) {
  const { t } = useI18n()
  if (!bucket.by_currency.length) {
    return <div className="stat-value">{formatCurrency(0)}</div>
  }
  return (
    <div>
      {bucket.by_currency.map((row) => (
        <div key={row.currency} className="stat-value" style={{ lineHeight: 1.3 }}>
          {formatCurrency(row.total, row.currency)}
        </div>
      ))}
      <div className="stat-label">{t('billing.summary.invoice_count', { count: bucket.count })}</div>
    </div>
  )
}

function KpiCard({
  label,
  bucket,
  Icon,
  fg,
  bg,
}: {
  label: string
  bucket: MoneyBucket
  Icon: typeof Wallet
  fg: string
  bg: string
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg }}>
        <Icon size={22} color={fg} />
      </div>
      <div>
        <BucketAmount bucket={bucket} />
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

/** Subscriptions and tenants that need a decision soon. */
function AttentionList() {
  const { t } = useI18n()
  const { data } = useBillingSummary()
  if (!data) return null

  const items = [
    {
      key: 'past_due',
      count: data.past_due_count,
      label: t('billing.summary.past_due'),
      to: '/admin/billing/subscriptions',
    },
    {
      key: 'trials_ending',
      count: data.trials_ending,
      label: t('billing.summary.trials_ending'),
      to: '/admin/billing/subscriptions',
    },
    {
      key: 'subscriptions_ending',
      count: data.subscriptions_ending,
      label: t('billing.summary.subscriptions_ending'),
      to: '/admin/billing/subscriptions',
    },
    {
      key: 'no_subscription',
      count: data.tenants_without_subscription,
      label: t('billing.summary.tenants_without_subscription'),
      to: '/admin/tenants',
    },
  ].filter((item) => item.count > 0)

  if (!items.length) {
    return (
      <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>
          {t('billing.summary.needs_attention')}
        </h3>
        <div className="empty-state">{t('billing.summary.nothing_to_chase')}</div>
      </div>
    )
  }

  return (
    <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>
        {t('billing.summary.needs_attention')}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
          >
            <span className="badge badge-orange">{item.count}</span>
            <span style={{ color: 'var(--color-text-primary)' }}>{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** Issued-but-unpaid invoices, soonest deadline first. */
function ChaseTable() {
  const { t } = useI18n()
  const { data, isLoading } = useInvoices({ status: 'issued', limit: 50 })

  const rows = [...(data?.items ?? [])]
    .filter((inv: InvoiceOut) => !inv.paid_at)
    .sort((a, b) => {
      // Invoices without a deadline sort last: nothing to chase them by yet.
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })

  return (
    <div className="data-card">
      <div style={{ padding: '16px 20px 0' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{t('billing.summary.to_chase')}</h3>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('invoice.invoice_number')}</th>
            <th>{t('subscription.tenant_id')}</th>
            <th>{t('invoice.total')}</th>
            <th>{t('invoice.due_date')}</th>
            <th>{t('billing.summary.age')}</th>
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            [0, 1, 2].map((i) => (
              <tr key={`sk-${i}`}>
                <td colSpan={5}>
                  <div className="skeleton skeleton-text sm" />
                </td>
              </tr>
            ))}
          {!isLoading && !rows.length && (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">{t('billing.summary.nothing_to_chase')}</div>
              </td>
            </tr>
          )}
          {rows.map((inv) => {
            const late = daysOverdue(inv.due_date)
            return (
              <tr key={inv.id}>
                <td>
                  <Link to="/admin/billing/invoices">{inv.invoice_number}</Link>
                </td>
                <td>{inv.tenant_id}</td>
                <td>{formatCurrency(inv.total, inv.currency)}</td>
                <td>{formatDate(inv.due_date)}</td>
                <td>
                  {late > 0 ? (
                    <span className="badge badge-red">
                      {t('billing.summary.days_late', { days: late })}
                    </span>
                  ) : (
                    <span className="badge badge-gray">{t('billing.summary.on_time')}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function BillingSummaryPage() {
  const { t } = useI18n()
  const { data, isLoading } = useBillingSummary()

  const empty: MoneyBucket = { count: 0, by_currency: [] }

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">{t('billing.summary.title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('billing.summary.desc')}
          </p>
        </div>
      </div>

      <BillingTabs />

      <div
        className="stat-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {isLoading
          ? [0, 1, 2, 3].map((i) => (
              <div key={`sk-${i}`} className="stat-card">
                <div className="skeleton skeleton-text sm" />
              </div>
            ))
          : (
            <>
              <KpiCard
                label={t('billing.summary.unpaid')}
                bucket={data?.unpaid ?? empty}
                Icon={Wallet}
                fg="var(--color-brand)"
                bg="rgba(124,58,237,0.08)"
              />
              <KpiCard
                label={t('billing.summary.overdue')}
                bucket={data?.overdue ?? empty}
                Icon={AlertTriangle}
                fg="#dc2626"
                bg="rgba(220,38,38,0.08)"
              />
              <KpiCard
                label={t('billing.summary.draft')}
                bucket={data?.draft ?? empty}
                Icon={FileText}
                fg="#d97706"
                bg="rgba(217,119,6,0.08)"
              />
              <KpiCard
                label={t('billing.summary.paid_this_month')}
                bucket={data?.paid_this_month ?? empty}
                Icon={Clock}
                fg="#16a34a"
                bg="rgba(22,163,74,0.08)"
              />
            </>
          )}
      </div>

      <AttentionList />
      <ChaseTable />
    </div>
  )
}
