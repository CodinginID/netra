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
import { BillingTabs } from './BillingTabs'
import '@/styles/layout.css'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  const { t } = useI18n()
  return (
    <span className={isActive ? 'badge badge-green' : 'badge badge-gray'}>
      {isActive ? t('active') : t('suspended')}
    </span>
  )
}

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
              <option value="annual">Annual</option>
              <option value="semiannual">Semiannual</option>
              <option value="monthly">Monthly</option>
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
              <option value="annual">Annual</option>
              <option value="semiannual">Semiannual</option>
              <option value="monthly">Monthly</option>
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
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">{t('billing.plan_management')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('billing.plan_management_desc')}
          </p>
        </div>
        <button className="btn btn-primary add-fab-twin" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          {t('common.create')}
        </button>
      </div>

      <BillingTabs />

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} onCreated={refetch} />}
      {editingPlan && (
        <EditPlanModal plan={editingPlan} onClose={() => setEditingPlan(null)} onUpdated={refetch} />
      )}
      {deletingPlan && (
        <DeletePlanModal plan={deletingPlan} onClose={() => setDeletingPlan(null)} onDeleted={refetch} />
      )}

      <div className="filter-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => {
              setActiveOnly(e.target.checked)
              setPage(1)
            }}
          />
          <span className="filter-label">{t('billing.show_active_only')}</span>
        </label>
      </div>

      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('plan.code')}</th>
              <th>{t('plan.name')}</th>
              <th>{t('plan.default_billing_cycle')}</th>
              <th>{t('plan.currency')}</th>
              <th>{t('plan.is_active')}</th>
              <th>{t('plan.created_at')}</th>
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
                  <td><div className="skeleton skeleton-text" style={{ width: 60, marginLeft: 'auto' }} /></td>
                </tr>
              ))}

            {!isLoading && plans.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('billing.no_plans')}</div>
                </td>
              </tr>
            )}

            {!isLoading &&
              plans.map((plan) => (
                <tr key={plan.id}>
                  <td style={{ fontWeight: 600 }}>{plan.code}</td>
                  <td>{plan.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{plan.default_billing_cycle}</td>
                  <td>{plan.currency}</td>
                  <td><ActiveBadge isActive={plan.is_active} /></td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(plan.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 8 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setEditingPlan(plan)}
                        title={t('common.edit')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setDeletingPlan(plan)}
                        title={t('common.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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
