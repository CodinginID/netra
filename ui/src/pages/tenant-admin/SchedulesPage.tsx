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
import { MobileFab } from '@/components/MobileFab'
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack'
import { useSchedules } from '@/hooks/useApiQueries'
import { useCreateSchedule, useUpdateSchedule, useDeleteSchedule, useRestoreSchedule } from '@/hooks/useApiMutations'
import { ScheduleCard } from './ScheduleCard'
import { ScheduleFormModal } from './ScheduleFormModal'
import '@/styles/layout.css'
import '@/styles/schedules.css'

type Filter = 'all' | 'shift' | 'session'

const typeOf = (s: ScheduleOut): Exclude<Filter, 'all'> => (s.rules.type === 'session' ? 'session' : 'shift')

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

  const { data: paginatedSchedules, isLoading, error, refetch } = useSchedules({ page, limit })
  const schedules = paginatedSchedules?.items ?? []
  const total = paginatedSchedules?.total ?? 0
  const pages = paginatedSchedules?.pages ?? 0
  // The filter works on the loaded page; counts are for that page too.
  const counts = {
    all: schedules.length,
    shift: schedules.filter((s) => typeOf(s) === 'shift').length,
    session: schedules.filter((s) => typeOf(s) === 'session').length,
  }
  const visible = filter === 'all' ? schedules : schedules.filter((s) => typeOf(s) === filter)

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
    <div className="sp">
      <div className="sp-header">
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>{t('schedules.title')}</h2>
          <p className="sp-subtitle">{t('schedules.subtitle')}</p>
        </div>
        <button className="btn btn-primary add-fab-twin" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> {t('schedules.add')}
        </button>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      {!isLoading && schedules.length > 0 && (
        <div className="sp-toolbar">
          <div className="seg seg--inline" role="group" aria-label={t('schedules.filter_label')}>
            {(['all', 'shift', 'session'] as const).map((f) => (
              <button key={f} type="button" className={`seg-btn${filter === f ? ' seg-btn--active' : ''}`}
                aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(`schedules.filter_${f}`)} · {counts[f]}
              </button>
            ))}
          </div>
          <div className="sp-legend" aria-hidden="true">
            <span><i className="sp-legend-on" />{t('schedules.legend_workday')}</span>
            <span><i className="sp-legend-off" />{t('schedules.day_off')}</span>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="sp-grid">
          {[1, 2].map((i) => (
            <div key={i} className="sc-card">
              <div className="skeleton skeleton-text" style={{ width: '45%' }} />
              <div className="skeleton skeleton-text sm" style={{ width: '65%' }} />
              <div className="skeleton" style={{ height: 72, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && schedules.length === 0 && (
        <div className="data-card">
          <EmptyState
            icon="calendar"
            title={t('schedules.empty')}
            description={t('schedules.empty_desc')}
            action={<button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('schedules.add')}</button>}
          />
        </div>
      )}

      {!isLoading && schedules.length > 0 && (
        <PullToRefresh onRefresh={() => refetch()}>
          {visible.length === 0 ? (
            <p className="sp-empty-filter">{t('schedules.filter_empty')}</p>
          ) : (
            <div className="sp-grid">
              {visible.map((s) => (
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
            </div>
          )}
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        </PullToRefresh>
      )}

      <MobileFab onClick={() => setShowCreate(true)} label={t('schedules.add')}>
        <Plus size={24} />
      </MobileFab>

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
