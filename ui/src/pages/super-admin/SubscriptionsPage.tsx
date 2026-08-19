import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Ban } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import { useSubscription } from '@/hooks/useApiQueries'
import { useCreateSubscription, useCancelSubscription } from '@/hooks/useApiMutations'
import { type SubscriptionOut } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { MobileFab } from '@/components/MobileFab'
import { BillingTabs } from './BillingTabs'
import '@/styles/layout.css'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: SubscriptionOut['status'] }) {
  const { t } = useI18n()
  const statusClass: Record<SubscriptionOut['status'], string> = {
    trial: 'badge-orange',
    active: 'badge-green',
    past_due: 'badge-red',
    canceled: 'badge-gray',
  }

  return (
    <span className={`badge ${statusClass[status] ?? 'badge-gray'}`}>
      {t(`subscription.status.${status}`)}
    </span>
  )
}

interface CreateSubscriptionModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateSubscriptionModal({ onClose, onCreated }: CreateSubscriptionModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const createSubscription = useCreateSubscription()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const [tenantId, setTenantId] = useState('')
  const [planId, setPlanId] = useState('')
  const [billingCycle, setBillingCycle] = useState<'annual' | 'semiannual' | 'monthly'>('annual')
  const [discountPct, setDiscountPct] = useState(0)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (createSubscription.isPending) return
    try {
      await createSubscription.mutateAsync({
        tenant_id: tenantId,
        plan_id: planId,
        billing_cycle: billingCycle,
        discount_pct: discountPct,
        starts_at: startsAt,
        ends_at: endsAt,
      })
      show(t('toast_subscription_created'), 'success')
      onCreated()
      onClose()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_save_failed'), 'error')
    }
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('billing.create_subscription')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="sub-tenant-id">{t('subscription.tenant_id')}</label>
            <input
              id="sub-tenant-id"
              className="field-input"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="sub-plan-id">{t('subscription.plan_id')}</label>
            <input
              id="sub-plan-id"
              className="field-input"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="sub-cycle">{t('subscription.billing_cycle')}</label>
            <select
              id="sub-cycle"
              className="field-input"
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value as 'annual' | 'semiannual' | 'monthly')}
            >
              <option value="annual">Annual</option>
              <option value="semiannual">Semiannual</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sub-discount">{t('subscription.discount_pct')}</label>
            <input
              id="sub-discount"
              type="number"
              className="field-input"
              value={discountPct}
              onChange={(e) => setDiscountPct(Number(e.target.value))}
              min={0}
              max={100}
            />
          </div>
          <div className="field">
            <label htmlFor="sub-starts">{t('subscription.starts_at')}</label>
            <input
              id="sub-starts"
              type="datetime-local"
              className="field-input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="sub-ends">{t('subscription.ends_at')}</label>
            <input
              id="sub-ends"
              type="datetime-local"
              className="field-input"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createSubscription.isPending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={createSubscription.isPending}>
              {createSubscription.isPending ? t('common.creating') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface CancelSubscriptionModalProps {
  subscription: SubscriptionOut
  onClose: () => void
  onCanceled: () => void
}

function CancelSubscriptionModal({ subscription, onClose, onCanceled }: CancelSubscriptionModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const cancelSubscription = useCancelSubscription()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const handleCancel = async () => {
    if (cancelSubscription.isPending) return
    try {
      await cancelSubscription.mutateAsync(subscription.id)
      show(t('toast_subscription_cancelled'), 'success')
      onCanceled()
      onClose()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_cancel_failed'), 'error')
    }
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('billing.confirm_cancel_subscription')}</h3>
        <p className="confirm-text">{t('billing.cancel_subscription_confirm')}</p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={cancelSubscription.isPending}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger" onClick={handleCancel} disabled={cancelSubscription.isPending}>
            {cancelSubscription.isPending ? t('common.deleting') : t('billing.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function SubscriptionsPage() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [showCreate, setShowCreate] = useState(false)
  const [cancelingSub, setCancelingSub] = useState<SubscriptionOut | null>(null)

  const { data: subsData, isLoading, refetch } = useSubscription({ page, limit })

  const subs = subsData?.items ?? []
  const total = subsData?.total ?? 0
  const pages = subsData?.pages ?? 1

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">{t('billing.subscription_management')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('billing.subscription_management_desc')}
          </p>
        </div>
        <button className="btn btn-primary add-fab-twin" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          {t('common.create')}
        </button>
      </div>

      <BillingTabs />

      {showCreate && <CreateSubscriptionModal onClose={() => setShowCreate(false)} onCreated={refetch} />}
      {cancelingSub && (
        <CancelSubscriptionModal
          subscription={cancelingSub}
          onClose={() => setCancelingSub(null)}
          onCanceled={refetch}
        />
      )}

      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('subscription.tenant_id')}</th>
              <th>{t('subscription.plan_id')}</th>
              <th>{t('subscription.billing_cycle')}</th>
              <th>{t('subscription.status')}</th>
              <th>{t('subscription.starts_at')}</th>
              <th>{t('subscription.ends_at')}</th>
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
                  <td><div className="skeleton skeleton-badge" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text" style={{ width: 60, marginLeft: 'auto' }} /></td>
                </tr>
              ))}

            {!isLoading && subs.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('billing.no_subscriptions')}</div>
                </td>
              </tr>
            )}

            {!isLoading &&
              subs.map((sub) => (
                <tr key={sub.id}>
                  <td style={{ fontWeight: 600 }}>{sub.tenant_id}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{sub.plan_id}</td>
                  <td style={{ textTransform: 'capitalize' }}>{sub.billing_cycle}</td>
                  <td><StatusBadge status={sub.status} /></td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(sub.starts_at)}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(sub.ends_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {sub.status === 'active' && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setCancelingSub(sub)}
                        title={t('billing.cancel_subscription')}
                      >
                        <Ban size={14} />
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

      <MobileFab onClick={() => setShowCreate(true)} label={t('common.create')}>
        <Plus size={24} />
      </MobileFab>
    </div>
  )
}
