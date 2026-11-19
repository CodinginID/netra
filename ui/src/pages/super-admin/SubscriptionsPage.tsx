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
import { FilterPills, PageHead, Who, formatDate } from './saShared'
import { SubscriptionStatusChip, usePlanNames, useTenantNames } from './billingShared'

type SubFilter = 'all' | SubscriptionOut['status']

interface CreateSubscriptionModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateSubscriptionModal({ onClose, onCreated }: CreateSubscriptionModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const createSubscription = useCreateSubscription()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const { tenants } = useTenantNames()
  const { plans } = usePlanNames()

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
            <label htmlFor="sub-tenant-id">{t('billing.usage.tenant')}</label>
            <select
              id="sub-tenant-id"
              className="field-input"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
            >
              <option value="">{t('billing_page.choose_tenant')}</option>
              {tenants.map((tn) => (
                <option key={tn.id} value={tn.id}>{tn.name} ({tn.slug})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sub-plan-id">{t('billing.usage.plan')}</label>
            <select
              id="sub-plan-id"
              className="field-input"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              required
            >
              <option value="">{t('billing_page.choose_plan')}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.is_active}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sub-cycle">{t('subscription.billing_cycle')}</label>
            <select
              id="sub-cycle"
              className="field-input"
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value as 'annual' | 'semiannual' | 'monthly')}
            >
              <option value="annual">{t('billing_page.cycle_annual')}</option>
              <option value="semiannual">{t('billing_page.cycle_semiannual')}</option>
              <option value="monthly">{t('billing_page.cycle_monthly')}</option>
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

/** Billing → Langganan. */
export function SubscriptionsPage() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [filter, setFilter] = useState<SubFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [cancelingSub, setCancelingSub] = useState<SubscriptionOut | null>(null)
  const tenantNames = useTenantNames()
  const planNames = usePlanNames()

  const { data: subsData, isLoading, refetch } = useSubscription({ page, limit })

  // The API has no status filter; the pills narrow the page that is loaded.
  const all = subsData?.items ?? []
  const subs = filter === 'all' ? all : all.filter((s) => s.status === filter)
  const total = subsData?.total ?? 0
  const pages = subsData?.pages ?? 1

  const cancelBtn = (sub: SubscriptionOut) =>
    sub.status === 'active' && (
      <button
        className="btn btn-sm btn-ghost"
        style={{ color: 'var(--color-danger)' }}
        onClick={() => setCancelingSub(sub)}
        title={t('billing.cancel_subscription')}
      >
        <Ban size={14} /> {t('billing_page.cancel_short')}
      </button>
    )

  const empty = <div className="sa-empty">{t('billing.no_subscriptions')}</div>

  return (
    <div className="sa-page">
      <PageHead
        title={t('billing.subscription_management')}
        sub={t('billing.subscription_management_desc')}
        actions={
          <button className="btn btn-primary add-fab-twin" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            {t('billing.create_subscription')}
          </button>
        }
      />

      <FilterPills<SubFilter>
        ariaLabel={t('subscription.status')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('tenants.filter_all') },
          { value: 'active', label: t('subscription.status.active') },
          { value: 'trial', label: t('subscription.status.trial') },
          { value: 'past_due', label: t('subscription.status.past_due') },
          { value: 'canceled', label: t('subscription.status.canceled') },
        ]}
      />

      {showCreate && <CreateSubscriptionModal onClose={() => setShowCreate(false)} onCreated={refetch} />}
      {cancelingSub && (
        <CancelSubscriptionModal
          subscription={cancelingSub}
          onClose={() => setCancelingSub(null)}
          onCanceled={refetch}
        />
      )}

      <div className="sa-card sa-table-card bl-table">
        <table className="sa-table">
          <thead>
            <tr>
              <th>{t('billing.usage.tenant')}</th>
              <th>{t('billing.usage.plan')}</th>
              <th>{t('subscription.billing_cycle')}</th>
              <th>{t('subscription.status')}</th>
              <th>{t('subscription.starts_at')}</th>
              <th>{t('subscription.ends_at')}</th>
              <th className="sa-right"><span className="sa-sr-only">{t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7}><div className="skeleton skeleton-text sm" /></td></tr>
            )}
            {!isLoading && subs.length === 0 && (
              <tr><td colSpan={7}>{empty}</td></tr>
            )}
            {!isLoading &&
              subs.map((sub) => (
                <tr key={sub.id}>
                  <td><Who name={tenantNames.name(sub.tenant_id)} /></td>
                  <td>{planNames.name(sub.plan_id)}</td>
                  <td className="sa-muted">{t(`billing_page.cycle_${sub.billing_cycle}`)}</td>
                  <td><SubscriptionStatusChip status={sub.status} /></td>
                  <td className="sa-muted">{formatDate(sub.starts_at)}</td>
                  <td className="sa-muted">
                    {formatDate(sub.ends_at)}
                    {sub.status === 'trial' && sub.trial_ends_at && (
                      <div className="sa-who-sub">{t('billing_page.trial_ends', { date: formatDate(sub.trial_ends_at) })}</div>
                    )}
                  </td>
                  <td className="sa-right">{cancelBtn(sub)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="bl-cards">
        {!isLoading && subs.length === 0 && <div className="sa-card">{empty}</div>}
        {subs.map((sub) => (
          <div key={sub.id} className="sa-card bl-card">
            <div className="bl-card-top">
              <Who name={tenantNames.name(sub.tenant_id)} sub={planNames.name(sub.plan_id)} />
              <SubscriptionStatusChip status={sub.status} />
            </div>
            <div className="bl-card-meta">
              <span>{t(`billing_page.cycle_${sub.billing_cycle}`)}</span>
              <span>{formatDate(sub.starts_at)} – {formatDate(sub.ends_at)}</span>
            </div>
            {sub.status === 'active' && <div>{cancelBtn(sub)}</div>}
          </div>
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

      <MobileFab onClick={() => setShowCreate(true)} label={t('billing.create_subscription')}>
        <Plus size={24} />
      </MobileFab>
    </div>
  )
}
