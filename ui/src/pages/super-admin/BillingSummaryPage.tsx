import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { useBillingSummary, useInvoices, useSubscription } from '@/hooks/useApiQueries'
import type { InvoiceOut, MoneyBucket, SubscriptionOut } from '@/api/adminApi'
import { PageHead, StatTile, Who, formatCurrency, formatDate } from './saShared'
import { currentMonth, useTenantNames } from './billingShared'

/** One currency per line — the backend never merges totals across currencies. */
function bucketText(bucket: MoneyBucket | undefined): string {
  if (!bucket?.by_currency.length) return formatCurrency(0)
  return bucket.by_currency.map((row) => formatCurrency(row.total, row.currency)).join(' · ')
}

/** Whole days the deadline has already passed; 0 or negative means not late. */
function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0
  const due = new Date(dueDate).getTime()
  if (Number.isNaN(due)) return 0
  return Math.floor((Date.now() - due) / 86_400_000)
}

const WEEK = 7 * 86_400_000

/** "Langganan menunggak" and "Trial habis dalam 7 hari", side by side. */
function SubscriptionLists() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { name } = useTenantNames()
  const { data } = useSubscription({ page: 1, limit: 200 })
  const subs = data?.items ?? []
  const [now] = useState(() => Date.now())
  const pastDue = subs.filter((s) => s.status === 'past_due')
  const trials = subs
    .filter((s) => s.status === 'trial' && s.trial_ends_at)
    .filter((s) => {
      const end = new Date(s.trial_ends_at as string).getTime()
      return end >= now && end - now <= WEEK
    })
    .sort((a, b) => new Date(a.trial_ends_at as string).getTime() - new Date(b.trial_ends_at as string).getTime())

  const list = (rows: SubscriptionOut[], sub: (s: SubscriptionOut) => string, tone: string, btn: string) => (
    <div className="sa-card sa-card-list">
      {rows.length === 0 && <div className="sa-empty">{t('billing.summary.nothing_to_chase')}</div>}
      {rows.map((s) => (
        <div key={s.id} className="sa-row">
          <Who name={name(s.tenant_id)} sub={<span className={tone}>{sub(s)}</span>} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate(`/admin/tenants/${s.tenant_id}/billing`)}>
            {btn}
          </button>
        </div>
      ))}
    </div>
  )

  return (
    <div className="bl-two">
      <div className="sa-dash-side">
        <span className="sa-label">{t('billing.summary.past_due')}</span>
        {list(pastDue, (s) => t('billing_page.ends', { date: formatDate(s.ends_at) }), 'sa-tone-r', t('billing.summary.view'))}
      </div>
      <div className="sa-dash-side">
        <span className="sa-label">{t('billing.summary.trials_ending')}</span>
        {list(trials, (s) => t('billing_page.trial_ends', { date: formatDate(s.trial_ends_at) }), 'sa-tone-w', t('billing.summary.view'))}
      </div>
    </div>
  )
}

/** Other follow-ups the summary endpoint counts (ending subscriptions, tenants without one). */
function OtherAttention() {
  const { t } = useI18n()
  const { data } = useBillingSummary()
  if (!data) return null
  const items = [
    { key: 'subscriptions_ending', count: data.subscriptions_ending, label: t('billing.summary.subscriptions_ending'), to: '/admin/billing/subscriptions' },
    { key: 'no_subscription', count: data.tenants_without_subscription, label: t('billing.summary.tenants_without_subscription'), to: '/admin/billing/usage' },
  ].filter((i) => i.count > 0)
  if (!items.length) return null
  return (
    <div className="sa-card sa-card-list">
      {items.map((i) => (
        <Link key={i.key} to={i.to} className="sa-row">
          <span className="sa-alert-bar sa-tone-w" aria-hidden="true" />
          <span className="sa-alert-text sa-alert-title">{i.label}</span>
          <span className="sa-chip sa-chip--w">{i.count}</span>
          <ChevronRight size={16} className="sa-row-chev" aria-hidden="true" />
        </Link>
      ))}
    </div>
  )
}

/** Issued-but-unpaid invoices, soonest deadline first. */
function ChaseTable() {
  const { t } = useI18n()
  const { name } = useTenantNames()
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
    <div className="sa-dash-side">
      <span className="sa-label">{t('billing.summary.to_chase')}</span>
      <div className="sa-card sa-table-card bl-scroll">
        <table className="sa-table">
          <thead>
            <tr>
              <th>{t('invoice.invoice_number')}</th>
              <th>{t('billing.usage.tenant')}</th>
              <th>{t('invoice.total')}</th>
              <th>{t('invoice.due_date')}</th>
              <th>{t('billing.summary.age')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5}><div className="skeleton skeleton-text sm" /></td></tr>
            )}
            {!isLoading && !rows.length && (
              <tr><td colSpan={5}><div className="sa-empty">{t('billing.summary.nothing_to_chase')}</div></td></tr>
            )}
            {rows.map((inv) => {
              const late = daysOverdue(inv.due_date)
              return (
                <tr key={inv.id}>
                  <td><Link className="sa-mono sa-link" to="/admin/billing/invoices">{inv.invoice_number}</Link></td>
                  <td>{name(inv.tenant_id)}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(inv.total, inv.currency)}</td>
                  <td className="sa-muted">{formatDate(inv.due_date)}</td>
                  <td>
                    {late > 0 ? (
                      <span className="sa-chip sa-chip--r">{t('billing.summary.days_late', { days: late })}</span>
                    ) : (
                      <span className="sa-chip sa-chip--m">{t('billing.summary.on_time')}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Billing → Ringkasan (mockup dd07def6). */
export function BillingSummaryPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { data, isLoading } = useBillingSummary()
  const dash = (v: number | undefined) => (isLoading ? '–' : (v ?? 0))

  return (
    <div className="sa-page">
      <PageHead
        title={t('billing.summary.title')}
        sub={currentMonth(locale)}
        actions={
          data?.draft.count ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/admin/billing/invoices?status=draft')}>
              <FileText size={16} /> {t('billing_page.review_drafts', { count: data.draft.count })}
            </button>
          ) : undefined
        }
      />

      <div className="sa-stats">
        <StatTile tone="b" label={t('billing.summary.draft')} value={dash(data?.draft.count)} sub={bucketText(data?.draft)}
          onClick={() => navigate('/admin/billing/invoices?status=draft')} />
        <StatTile tone="w" label={t('billing.summary.unpaid')} value={dash(data?.unpaid.count)} sub={bucketText(data?.unpaid)}
          onClick={() => navigate('/admin/billing/invoices?status=issued')} />
        <StatTile tone="r" label={t('billing.summary.overdue')} value={dash(data?.overdue.count)} sub={bucketText(data?.overdue)} />
        <StatTile tone="g" label={t('billing.summary.paid_this_month')} value={isLoading ? '–' : bucketText(data?.paid_this_month)}
          sub={data ? t('billing.summary.invoice_count', { count: data.paid_this_month.count }) : undefined} />
      </div>

      <SubscriptionLists />
      <OtherAttention />
      <ChaseTable />
    </div>
  )
}
