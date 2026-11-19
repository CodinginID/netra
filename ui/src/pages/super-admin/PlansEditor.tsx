import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import { usePlans } from '@/hooks/useApiQueries'
import { useCreatePlan, useUpdatePlan, useDeletePlan } from '@/hooks/useApiMutations'
import { type PlanOut } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { MobileFab } from '@/components/MobileFab'
import { Chip, FilterPills, PageHead, formatDate } from './saShared'
import '@/styles/pages/sa-billing.css'

interface CreatePlanModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreatePlanModal({ onClose, onCreated }: CreatePlanModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const createPlan = useCreatePlan()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [defaultBillingCycle, setDefaultBillingCycle] = useState<'annual' | 'semiannual' | 'monthly'>('annual')
  const [currency, setCurrency] = useState('IDR')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (createPlan.isPending) return
    try {
      await createPlan.mutateAsync({
        name,
        code,
        default_billing_cycle: defaultBillingCycle,
        currency,
      })
      show(t('toast_plan_created'), 'success')
      onCreated()
      onClose()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_save_failed'), 'error')
    }
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('billing.create_plan')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="plan-name">{t('plan.name')}</label>
            <input
              id="plan-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="plan-code">{t('plan.code')}</label>
            <input
              id="plan-code"
              className="field-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="plan-cycle">{t('plan.default_billing_cycle')}</label>
            <select
              id="plan-cycle"
              className="field-input"
              value={defaultBillingCycle}
              onChange={(e) => setDefaultBillingCycle(e.target.value as 'annual' | 'semiannual' | 'monthly')}
            >
              <option value="annual">{t('billing_page.cycle_annual')}</option>
              <option value="semiannual">{t('billing_page.cycle_semiannual')}</option>
              <option value="monthly">{t('billing_page.cycle_monthly')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="plan-currency">{t('plan.currency')}</label>
            <input
              id="plan-currency"
              className="field-input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={10}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createPlan.isPending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={createPlan.isPending}>
              {createPlan.isPending ? t('common.creating') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface EditPlanModalProps {
  plan: PlanOut
  onClose: () => void
  onUpdated: () => void
}

function EditPlanModal({ plan, onClose, onUpdated }: EditPlanModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const updatePlan = useUpdatePlan()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const [name, setName] = useState(plan.name)
  const [defaultBillingCycle, setDefaultBillingCycle] = useState(plan.default_billing_cycle)
  const [currency, setCurrency] = useState(plan.currency)
  const [isActive, setIsActive] = useState(plan.is_active)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (updatePlan.isPending) return
    try {
      await updatePlan.mutateAsync({
        planId: plan.id,
        payload: { name, default_billing_cycle: defaultBillingCycle, currency, is_active: isActive },
      })
      show(t('toast_plan_updated'), 'success')
      onUpdated()
      onClose()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_save_failed'), 'error')
    }
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('billing.edit_plan')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="edit-plan-name">{t('plan.name')}</label>
            <input
              id="edit-plan-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="edit-plan-cycle">{t('plan.default_billing_cycle')}</label>
            <select
              id="edit-plan-cycle"
              className="field-input"
              value={defaultBillingCycle}
              onChange={(e) => setDefaultBillingCycle(e.target.value as 'annual' | 'semiannual' | 'monthly')}
            >
              <option value="annual">{t('billing_page.cycle_annual')}</option>
              <option value="semiannual">{t('billing_page.cycle_semiannual')}</option>
              <option value="monthly">{t('billing_page.cycle_monthly')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-plan-currency">{t('plan.currency')}</label>
            <input
              id="edit-plan-currency"
              className="field-input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={10}
            />
          </div>
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="edit-plan-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="edit-plan-active" style={{ marginBottom: 0 }}>{t('plan.is_active')}</label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={updatePlan.isPending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={updatePlan.isPending}>
              {updatePlan.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface DeletePlanModalProps {
  plan: PlanOut
  onClose: () => void
  onDeleted: () => void
}

function DeletePlanModal({ plan, onClose, onDeleted }: DeletePlanModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const deletePlan = useDeletePlan()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const handleDelete = async () => {
    if (deletePlan.isPending) return
    try {
      await deletePlan.mutateAsync(plan.id)
      show(t('toast_plan_deleted'), 'success')
      onDeleted()
      onClose()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_delete_failed'), 'error')
    }
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('billing.confirm_delete_plan')}</h3>
        <p className="confirm-text">{t('billing.delete_plan_confirm', { name: plan.name })}</p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={deletePlan.isPending}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deletePlan.isPending}>
            {deletePlan.isPending ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PlansEditor() {
  const { t } = useI18n()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [activeOnly, setActiveOnly] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PlanOut | null>(null)
  const [deletingPlan, setDeletingPlan] = useState<PlanOut | null>(null)

  const { data: plansData, isLoading, refetch } = usePlans({
    page,
    limit,
    active_only: activeOnly,
  })

  const plans = plansData?.items ?? []
  const total = plansData?.total ?? 0
  const pages = plansData?.pages ?? 1

  return (
    <div className="sa-page">
      <PageHead
        title={t('billing.plan_management')}
        sub={t('billing.plan_management_desc')}
        actions={
          <button className="btn btn-primary add-fab-twin" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            {t('billing.create_plan')}
          </button>
        }
      />

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} onCreated={refetch} />}
      {editingPlan && (
        <EditPlanModal plan={editingPlan} onClose={() => setEditingPlan(null)} onUpdated={refetch} />
      )}
      {deletingPlan && (
        <DeletePlanModal plan={deletingPlan} onClose={() => setDeletingPlan(null)} onDeleted={refetch} />
      )}

      <FilterPills<'all' | 'active'>
        ariaLabel={t('plan.is_active')}
        value={activeOnly ? 'active' : 'all'}
        onChange={(v) => {
          setActiveOnly(v === 'active')
          setPage(1)
        }}
        options={[
          { value: 'all', label: t('tenants.filter_all') },
          { value: 'active', label: t('active') },
        ]}
      />

      {isLoading && (
        <div className="bl-plans">
          {[0, 1].map((i) => (
            <div key={i} className="sa-card bl-plan"><div className="skeleton skeleton-text" /></div>
          ))}
        </div>
      )}

      {!isLoading && plans.length === 0 && (
        <div className="sa-card"><div className="sa-empty">{t('billing.no_plans')}</div></div>
      )}

      {!isLoading && plans.length > 0 && (
        <div className="bl-plans">
          {plans.map((plan) => (
            <div key={plan.id} className={`sa-card bl-plan${plan.is_active ? '' : ' is-off'}`}>
              <div className="bl-plan-top">
                <span className="bl-plan-name">{plan.name}</span>
                <Chip tone={plan.is_active ? 'g' : 'm'}>
                  {plan.is_active ? t('active') : t('billing_page.plan_inactive')}
                </Chip>
              </div>
              <div className="bl-plan-code sa-mono">{plan.code}</div>
              <div className="bl-plan-meta">
                {t(`billing_page.cycle_${plan.default_billing_cycle}`)} · {plan.currency} · {formatDate(plan.created_at)}
              </div>
              <div className="bl-plan-actions">
                <button className="btn btn-sm btn-ghost" onClick={() => setEditingPlan(plan)}>
                  <Pencil size={14} /> {t('common.edit')}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => setDeletingPlan(plan)}
                  aria-label={`${t('common.delete')} ${plan.name}`}
                >
                  <Trash2 size={14} /> {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

      <MobileFab onClick={() => setShowCreate(true)} label={t('billing.create_plan')}>
        <Plus size={24} />
      </MobileFab>
    </div>
  )
}
