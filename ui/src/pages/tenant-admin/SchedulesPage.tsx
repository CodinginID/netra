import { useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import type { ScheduleCreate, ScheduleOut } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { SwipeCard } from '@/components/SwipeCard'
import { PullToRefresh } from '@/components/PullToRefresh'
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack'
import { useSchedules } from '@/hooks/useApiQueries'
import { useCreateSchedule, useUpdateSchedule, useDeleteSchedule, useRestoreSchedule } from '@/hooks/useApiMutations'
import { ScheduleCard } from './ScheduleCard'
import { ScheduleFormModal } from './ScheduleFormModal'
import '@/styles/layout.css'
import '@/styles/pages/ops-common.css'
import '@/styles/schedules.css'

type Filter = 'all' | 'shift' | 'session'

function DeleteScheduleModal({ schedule, onConfirm, onClose, loading }: {
  schedule: ScheduleOut
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('schedules.delete_title')}</h3>
        <p className="confirm-text">
          {t('schedules.confirm_delete', { name: schedule.name })}
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function SchedulesPage() {
  const { t } = useI18n()
  const { show } = useToast()
  useEdgeSwipeBack() // 3.5 — swipe from the left edge to go back (mobile)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [filter, setFilter] = useState<Filter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<ScheduleOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduleOut | null>(null)

  // Filtering and counts are server-side, so they cover every page.
  const { data: paginatedSchedules, isLoading, isFetching, error, refetch } = useSchedules({
    page, limit, type: filter === 'all' ? undefined : filter,
  })
  const schedules = paginatedSchedules?.items ?? []
  const total = paginatedSchedules?.total ?? 0
  const pages = paginatedSchedules?.pages ?? 0
  const counts = paginatedSchedules?.counts ?? { all: total, shift: 0, session: 0 }
  const hasAny = counts.all > 0

  function changeFilter(f: Filter) {
    setFilter(f)
    setPage(1)
  }

  const createMutation = useCreateSchedule(() => {
    setShowCreate(false)
    show(t('schedules.toast_created'), 'success')
  })
  const updateMutation = useUpdateSchedule()
  const deleteMutation = useDeleteSchedule()
  const restoreMutation = useRestoreSchedule()

  function handleCreate(payload: ScheduleCreate) {
    createMutation.mutate(payload, {
      onError: (err) => show(err instanceof Error ? err.message : t('schedules.toast_create_failed'), 'error'),
    })
  }

  function handleUpdate(schedule: ScheduleOut, payload: Partial<ScheduleCreate>, toastKey: string) {
    updateMutation.mutate({ scheduleId: schedule.id, payload }, {
      onSuccess: () => {
        setEditTarget(null)
        show(t(toastKey, { name: schedule.name }), 'success')
      },
      onError: (err) => show(err instanceof Error ? err.message : t('schedules.toast_update_failed'), 'error'),
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const deleted = { ...deleteTarget }
    deleteMutation.mutate(deleted.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        show(t('schedules.toast_deleted', { name: deleted.name }), 'success', {
          label: t('common.undo'),
          onClick: () => {
            restoreMutation.mutate(deleted.id, {
              onError: () => show(t('schedules.toast_restore_failed'), 'error'),
            })
          },
        })
      },
      onError: (err) => show(err instanceof Error ? err.message : t('schedules.toast_delete_failed'), 'error'),
    })
  }

  return (
    <div className="ops-page sp">
      <div className="ops-head">
        <div>
          <h2>{t('schedules.title')}</h2>
          <p>{t('schedules.subtitle')}</p>
        </div>
        <button className="btn btn-primary sp-add" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> <span className="ops-desktop-only">{t('schedules.add')}</span>
          <span className="ops-phone-only">{t('schedules.add_short')}</span>
        </button>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      {!isLoading && hasAny && (
        <div className="ops-pills" role="group" aria-label={t('schedules.filter_label')}>
          {(['all', 'shift', 'session'] as const).map((f) => (
            <button key={f} type="button" className={`ops-pill${filter === f ? ' ops-pill--on' : ''}`}
              aria-pressed={filter === f} onClick={() => changeFilter(f)}>
              {t(`schedules.filter_${f}`)} <span className="ops-pill-count">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="sp-grid">
          {[1, 2].map((i) => (
            <div key={i} className="ops-card sc-card">
              <div className="skeleton skeleton-text" style={{ width: '45%' }} />
              <div className="skeleton" style={{ height: 24, width: '55%', borderRadius: 6 }} />
              <div className="skeleton skeleton-text sm" style={{ width: '65%' }} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !hasAny && (
        <div className="data-card">
          <EmptyState
            icon="calendar"
            title={t('schedules.empty')}
            description={t('schedules.empty_desc')}
            action={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('schedules.add')}</button>}
          />
        </div>
      )}

      {!isLoading && hasAny && (
        <PullToRefresh onRefresh={() => refetch()}>
          {schedules.length === 0 ? (
            <p className="sp-empty-filter">{t('schedules.filter_empty')}</p>
          ) : (
            <div className="sp-grid" aria-busy={isFetching}>
              {schedules.map((s) => (
                <SwipeCard
                  key={s.id}
                  left={{ icon: <Edit2 size={20} />, label: t('common.edit'), variant: 'primary', onAction: () => setEditTarget(s) }}
                  right={{ icon: <Trash2 size={20} />, label: t('common.delete'), variant: 'danger', onAction: () => setDeleteTarget(s) }}
                >
                  <ScheduleCard
                    schedule={s}
                    onEdit={() => setEditTarget(s)}
                    onDelete={() => setDeleteTarget(s)}
                    onMakeDefault={() => handleUpdate(s, { is_default: true }, 'schedules.toast_default')}
                  />
                </SwipeCard>
              ))}
              <button type="button" className="ops-add-tile ops-desktop-only" onClick={() => setShowCreate(true)}>
                <Plus size={16} /> {t('schedules.create_new')}
              </button>
            </div>
          )}
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        </PullToRefresh>
      )}

      {showCreate && (
        <ScheduleFormModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} submitting={createMutation.isPending} />
      )}
      {editTarget && (
        <ScheduleFormModal
          initial={editTarget}
          onSubmit={(payload) => handleUpdate(editTarget, payload, 'schedules.toast_updated')}
          onClose={() => setEditTarget(null)}
          submitting={updateMutation.isPending}
        />
      )}
      {deleteTarget && (
        <DeleteScheduleModal
          schedule={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
