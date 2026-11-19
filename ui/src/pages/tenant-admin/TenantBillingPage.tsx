import { ChevronDown } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { useSubscription, useInvoices, useUsageSnapshots } from '@/hooks/useApiQueries'
import { useUpdateInvoice } from '@/hooks/useApiMutations'
import { type InvoiceOut, type SubscriptionOut, type UsageSnapshotOut } from '@/api/adminApi'
import { monthYear, shortDate } from './tenantOpsFormat'
import '@/styles/layout.css'
import '@/styles/pages/ops-common.css'
import '@/styles/pages/billing.css'

function formatCurrency(amount: number, currency: string = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const INVOICE_TONE: Record<InvoiceOut['status'], string> = { draft: 'm', issued: 'w', paid: 'g', void: 'r' }

function PlanCard({ subscription, loading }: { subscription: SubscriptionOut | null; loading: boolean }) {
  const { t, locale } = useI18n()
  if (loading) return <div className="bill-plan bill-plan--loading" aria-busy="true" />
  if (!subscription) {
    return (
      <div className="bill-plan">
        <span className="bill-plan-label">{t('billing.plan_active_label')}</span>
        <div className="bill-plan-name">{t('billing.no_subscriptions')}</div>
      </div>
    )
  }
  const s = subscription
  const priceLine = [
    s.unit_price_override ? t('billing.price_per_user', { price: formatCurrency(s.unit_price_override) }) : null,
    t(`billing.cycle_${s.billing_cycle}`).toLowerCase(),
    s.discount_pct > 0 ? t('billing.discount_line', { pct: s.discount_pct }) : null,
  ].filter(Boolean).join(' · ')
  const footer = s.status === 'trial' && s.trial_ends_at
    ? t('billing.trial_until', { date: shortDate(s.trial_ends_at, locale) ?? '-' })
    : t('billing.valid_until', { date: shortDate(s.ends_at, locale) ?? '-' })

  return (
    <div className="bill-plan">
      <div className="bill-plan-top">
        <span className="bill-plan-label">{t('billing.plan_active_label')}</span>
        <span className="bill-plan-status">{t(`subscription.status.${s.status}`)}</span>
      </div>
      <div className="bill-plan-name">{t('billing.plan_cycle_title', { cycle: t(`billing.cycle_${s.billing_cycle}`) })}</div>
      <div className="bill-plan-price">{priceLine}</div>
      <div className="bill-plan-foot">
        {footer}
        <span className="bill-plan-since">{t('billing.since', { date: shortDate(s.starts_at, locale) ?? '-' })}</span>
      </div>
    </div>
  )
}

function UsageCard({ usage, isLoading }: { usage: UsageSnapshotOut[]; isLoading: boolean }) {
  const { t, locale } = useI18n()
  // Oldest → newest, so the mini bars read left to right.
  const series = [...usage].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
  const latest = series[series.length - 1]
  const metrics: { key: 'active_users' | 'devices' | 'punches'; label: string }[] = [
    { key: 'active_users', label: t('usage.active_users') },
    { key: 'devices', label: t('usage.devices') },
    { key: 'punches', label: t('usage.punches') },
  ]

  return (
    <section className="ops-card ops-card-pad bill-usage" aria-labelledby="bill-usage-title">
      <div className="bill-usage-head">
        <h3 id="bill-usage-title" className="ops-card-title">{t('billing.usage_title')}</h3>
        {latest && <span className="ops-muted bill-usage-date">{t('billing.usage_as_of', { date: shortDate(latest.snapshot_date, locale) ?? '-' })}</span>}
      </div>
      {isLoading && <p className="ops-muted bill-empty">{t('common.loading')}</p>}
      {!isLoading && !latest && <p className="ops-muted bill-empty">{t('billing.no_usage')}</p>}
      {!isLoading && latest && metrics.map(({ key, label }) => {
        const values = series.map((u) => u[key])
        const max = Math.max(1, ...values)
        return (
          <div key={key} className="bill-meter">
            <div className="bill-meter-row">
              <span className="ops-muted">{label}</span>
              <span className="bill-meter-value">{latest[key].toLocaleString(locale === 'en' ? 'en-US' : 'id-ID')}</span>
            </div>
            <div className="bill-spark" aria-hidden="true" title={t('billing.usage_trend')}>
              {series.map((u) => (
                <span key={u.id} style={{ height: `${Math.max(8, (u[key] / max) * 100)}%` }} />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function period(inv: InvoiceOut, locale: string): string {
  const a = monthYear(inv.period_start, locale)
  const b = monthYear(inv.period_end, locale)
  if (a && a === b) return a
  return `${shortDate(inv.period_start, locale) ?? '-'} – ${shortDate(inv.period_end, locale) ?? '-'}`
}

function Invoices({ invoices, isLoading, onPaid, isPaying }: {
  invoices: InvoiceOut[]
  isLoading: boolean
  onPaid: (id: string) => void
  isPaying: boolean
}) {
  const { t, locale } = useI18n()
  const chip = (inv: InvoiceOut) => (
    <span className={`ops-chip ops-chip--${INVOICE_TONE[inv.status] ?? 'm'}`}>{t(`invoice.status.${inv.status}`)}</span>
  )
  const payBtn = (inv: InvoiceOut) => inv.status === 'issued' && (
    <button type="button" className="btn btn-sm ops-btn-outline" onClick={() => onPaid(inv.id)} disabled={isPaying}>
      {t('invoice.mark_paid')}
    </button>
  )

  if (isLoading) return <div className="ops-card ops-card-pad ops-muted">{t('common.loading')}</div>
  if (invoices.length === 0) return <div className="ops-card ops-card-pad ops-muted">{t('billing.no_invoices')}</div>

  return (
    <>
      <div className="ops-card ops-table bill-table ops-desktop-only" role="table" aria-label={t('billing.invoices_title')}>
        <div className="ops-table-row ops-table-head" role="row">
          <span role="columnheader">{t('invoice.invoice_number')}</span>
          <span role="columnheader">{t('billing.col_period')}</span>
          <span role="columnheader">{t('invoice.billed_users')}</span>
          <span role="columnheader">{t('invoice.total')}</span>
          <span role="columnheader">{t('invoice.status')}</span>
        </div>
        {invoices.map((inv) => (
          <div key={inv.id} className="ops-table-row" role="row">
            <span role="cell" className="ops-strong">{inv.invoice_number}</span>
            <span role="cell">{period(inv, locale)}</span>
            <span role="cell">{inv.billed_users}</span>
            <span role="cell" className="ops-strong">{formatCurrency(inv.total, inv.currency ?? 'IDR')}</span>
            <span role="cell" className="bill-status-cell">
              {chip(inv)}
              {payBtn(inv)}
            </span>
          </div>
        ))}
      </div>

      <div className="ops-card bill-list ops-phone-only">
        {invoices.map((inv) => (
          <details key={inv.id} className="bill-item">
            <summary>
              <span className="bill-item-main">
                <span className="ops-strong">{period(inv, locale)}</span>
                <span className="ops-muted">{formatCurrency(inv.total, inv.currency ?? 'IDR')}</span>
              </span>
              {chip(inv)}
              <ChevronDown size={14} className="bill-item-chevron" aria-hidden="true" />
            </summary>
            <dl className="bill-item-detail">
              <dt>{t('invoice.invoice_number')}</dt><dd>{inv.invoice_number}</dd>
              <dt>{t('invoice.billed_users')}</dt><dd>{inv.billed_users}</dd>
              {inv.issued_at && (<><dt>{t('invoice.issued_at')}</dt><dd>{shortDate(inv.issued_at, locale)}</dd></>)}
              {inv.due_date && (<><dt>{t('invoice.due_date')}</dt><dd>{shortDate(inv.due_date, locale)}</dd></>)}
              {inv.paid_at && (<><dt>{t('invoice.paid_at')}</dt><dd>{shortDate(inv.paid_at, locale)}</dd></>)}
            </dl>
            {payBtn(inv)}
          </details>
        ))}
      </div>
    </>
  )
}

export function TenantBillingPage() {
  const { t } = useI18n()
  const { show } = useToast()

  const { data: subData, isLoading: subLoading } = useSubscription({})
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } = useInvoices({ limit: 20 })
  const { data: usageData, isLoading: usageLoading } = useUsageSnapshots({ limit: 5 })
  const updateInvoice = useUpdateInvoice()

  const subscription = subData?.items?.[0] ?? null
  const invoices = invoicesData?.items ?? []
  const usage = usageData?.items ?? []

  const handlePaid = async (invoiceId: string) => {
    try {
      await updateInvoice.mutateAsync({ invoiceId, payload: { status: 'paid' } })
      show(t('toast_invoice_paid'), 'success')
      refetchInvoices()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_save_failed'), 'error')
    }
  }

  return (
    <div className="ops-page bill-page">
      <div className="ops-head">
        <div>
          <h2>{t('billing.title')}</h2>
          <p>{t('billing.subtitle')}</p>
        </div>
      </div>

      <div className="bill-top">
        <PlanCard subscription={subscription} loading={subLoading} />
        <UsageCard usage={usage} isLoading={usageLoading} />
      </div>

      <h3 className="ops-section-label">{t('billing.invoices_title')}</h3>
      <Invoices
        invoices={invoices}
        isLoading={subLoading || invoicesLoading}
        onPaid={handlePaid}
        isPaying={updateInvoice.isPending}
      />
    </div>
  )
}
