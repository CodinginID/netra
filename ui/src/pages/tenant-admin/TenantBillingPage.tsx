import { CreditCard, FileText, Activity } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { useSubscription, useInvoices, useUsageSnapshots } from '@/hooks/useApiQueries'
import { useUpdateInvoice } from '@/hooks/useApiMutations'
import { type InvoiceOut, type SubscriptionOut, type UsageSnapshotOut } from '@/api/adminApi'
import '@/styles/layout.css'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number, currency: string = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    trial: 'badge-orange',
    active: 'badge-green',
    past_due: 'badge-red',
    canceled: 'badge-gray',
    issued: 'badge-blue',
    paid: 'badge-green',
    draft: 'badge-gray',
    void: 'badge-red',
  }
  return <span className={`badge ${colors[status] ?? 'badge-gray'}`}>{status}</span>
}

function PlanCard({ subscription }: { subscription: SubscriptionOut | null }) {
  const { t } = useI18n()
  return (
    <div className="data-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div className="stat-icon" style={{ background: 'var(--color-info-bg)' }}>
          <CreditCard size={20} color="var(--color-info)" />
        </div>
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text)' }}>
            {t('billing.subscription_management')}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            {t('billing.subscription_management_desc')}
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, fontSize: 14 }}>
        <div>
          <span style={{ color: 'var(--color-text-secondary)' }}>{t('subscription.plan_id')}</span>
          <p style={{ fontWeight: 600, marginTop: 2 }}>{subscription?.plan_id ?? '-'}</p>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-secondary)' }}>{t('subscription.status')}</span>
          <p style={{ marginTop: 4 }}>
            <StatusBadge status={subscription?.status ?? 'trial'} />
          </p>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-secondary)' }}>{t('subscription.billing_cycle')}</span>
          <p style={{ fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>
            {subscription?.billing_cycle ?? '-'}
          </p>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-secondary)' }}>{t('subscription.starts_at')}</span>
          <p style={{ fontWeight: 600, marginTop: 2 }}>{formatDate(subscription?.starts_at ?? '')}</p>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-secondary)' }}>{t('subscription.ends_at')}</span>
          <p style={{ fontWeight: 600, marginTop: 2 }}>{formatDate(subscription?.ends_at ?? '')}</p>
        </div>
        {subscription?.trial_ends_at && (
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>{t('subscription.trial_ends_at')}</span>
            <p style={{ fontWeight: 600, marginTop: 2 }}>{formatDate(subscription.trial_ends_at)}</p>
          </div>
        )}
        {!!subscription?.discount_pct && subscription.discount_pct > 0 && (
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>{t('subscription.discount_pct')}</span>
            <p style={{ fontWeight: 600, marginTop: 2 }}>{subscription.discount_pct}%</p>
          </div>
        )}
        {!!subscription?.unit_price_override && (
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>{t('subscription.unit_price_override')}</span>
            <p style={{ fontWeight: 600, marginTop: 2 }}>{formatCurrency(subscription.unit_price_override)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function InvoiceList({
  invoices,
  isLoading,
  onPaid,
  isPaying,
  currency,
}: {
  invoices: InvoiceOut[]
  isLoading: boolean
  onPaid: (id: string) => void
  isPaying: boolean
  currency: string
}) {
  const { t } = useI18n()
  return (
    <div className="data-card">
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={18} color="var(--color-text-secondary)" />
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{t('billing.invoice_management')}</h3>
      </div>

      {isLoading && <div className="empty-state">{t('common.loading')}</div>}

      {!isLoading && invoices.length === 0 && (
        <div className="empty-state">{t('billing.no_invoices')}</div>
      )}

      {!isLoading &&
        invoices.map((inv) => (
          <div
            key={inv.id}
            style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border-subtle)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 600 }}>{inv.invoice_number}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <div style={{ marginTop: 4, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                  {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                  {formatCurrency(inv.total, inv.currency ?? currency)}
                </div>
                <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                  {inv.billed_users} {t('invoice.billed_users').toLowerCase()}
                </div>
              </div>
            </div>
            {inv.status !== 'paid' && inv.status !== 'void' && inv.issued_at && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                <span>{t('invoice.issued_at')}: {formatDate(inv.issued_at)}</span>
                {inv.status === 'issued' && (
                  <button className="btn btn-sm btn-success" onClick={() => onPaid(inv.id)} disabled={isPaying}>
                    {t('invoice.mark_paid')}
                  </button>
                )}
              </div>
            )}
            {inv.issued_at && inv.paid_at && (
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-success)' }}>
                {t('invoice.paid_at')}: {formatDate(inv.paid_at)}
              </div>
            )}
          </div>
        ))}
    </div>
  )
}

function UsageCard({ usage, isLoading }: { usage: UsageSnapshotOut[]; isLoading: boolean }) {
  const { t } = useI18n()
  const recent = (usage ?? []).slice(0, 5)

  return (
    <div className="data-card">
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} color="var(--color-text-secondary)" />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{t('billing.usage_tracking')}</h3>
        </div>
        <p style={{ marginTop: 4, fontSize: 14, color: 'var(--color-text-secondary)' }}>
          {t('billing.usage_tracking_desc')}
        </p>
      </div>

      {isLoading && <div className="empty-state">{t('common.loading')}</div>}

      {!isLoading && recent.length === 0 && (
        <div className="empty-state">{t('billing.no_usage')}</div>
      )}

      {!isLoading && recent.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('usage.snapshot_date')}</th>
              <th>{t('usage.active_users')}</th>
              <th>{t('usage.devices')}</th>
              <th>{t('usage.punches')}</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((u) => (
              <tr key={u.id}>
                <td>{formatDate(u.snapshot_date)}</td>
                <td>{u.active_users}</td>
                <td>{u.devices}</td>
                <td>{u.punches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 className="page-title">{t('billing.title')}</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
          {t('billing.subtitle')}
        </p>
      </div>

      <PlanCard subscription={subscription} />
      <InvoiceList
        invoices={invoices}
        isLoading={subLoading || invoicesLoading}
        onPaid={handlePaid}
        isPaying={updateInvoice.isPending}
        currency="IDR"
      />
      <UsageCard usage={usage} isLoading={usageLoading} />
    </div>
  )
}
