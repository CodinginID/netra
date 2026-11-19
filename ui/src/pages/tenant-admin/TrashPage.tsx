import { useState } from 'react'
import { AlertCircle, CalendarDays, Monitor, RotateCcw, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

type EmptyIcon = 'users' | 'monitor' | 'calendar'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import { useDeletedUsers, useDeletedDevices, useDeletedSchedules } from '@/hooks/useApiQueries'
import {
  useRestoreUser,
  useRestoreDevice,
  useRestoreSchedule,
  useHardDeleteTrashUser,
  useHardDeleteTrashDevice,
  useHardDeleteTrashSchedule,
} from '@/hooks/useApiMutations'
import { daysUntil, initialsOf, shortDate } from './tenantOpsFormat'
import '@/styles/pages/ops-common.css'
import '@/styles/pages/trash.css'

type Tab = 'users' | 'devices' | 'schedules'
type Item = { id: string; name: string; sub?: string | null; deletedAt?: string | null }
type ConfirmTarget = { id: string; name: string; type: Tab } | null

/** Matches the backend purge job (hard-deletes soft-deleted rows older than 30 days). */
const RETENTION_DAYS = 30
const WARN_DAYS = 7

function ConfirmHardDelete({ name, busy, onConfirm, onClose }: {
  name: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} role="alertdialog" aria-modal="true" aria-labelledby="trash-confirm-title"
        style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 id="trash-confirm-title" className="modal-title">{t('trash.hard_delete_title')}</h3>
        <p className="trash-confirm-text">{t('trash.hard_delete_confirm', { name })}</p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? t('common.deleting') : t('trash.hard_delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TrashPage() {
  const { t, locale } = useI18n()
  const { show } = useToast()
  const [tab, setTab] = useState<Tab>('users')
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  const { data: deletedUsersData, isLoading: usersLoading } = useDeletedUsers()
  const { data: deletedDevicesData, isLoading: devicesLoading } = useDeletedDevices()
  const { data: deletedSchedulesData, isLoading: schedulesLoading } = useDeletedSchedules()

  const lists: Record<Tab, Item[]> = {
    users: (deletedUsersData?.items ?? []).map((u) => ({ id: u.id, name: u.full_name, sub: u.username, deletedAt: u.deleted_at })),
    devices: (deletedDevicesData?.items ?? []).map((d) => ({ id: d.id, name: d.name, deletedAt: d.deleted_at })),
    schedules: (deletedSchedulesData?.items ?? []).map((s) => ({ id: s.id, name: s.name, deletedAt: s.deleted_at })),
  }

  const restoreUserMutation = useRestoreUser()
  const restoreDeviceMutation = useRestoreDevice()
  const restoreScheduleMutation = useRestoreSchedule()
  const hardDeleteUserMutation = useHardDeleteTrashUser()
  const hardDeleteDeviceMutation = useHardDeleteTrashDevice()
  const hardDeleteScheduleMutation = useHardDeleteTrashSchedule()

  const loading = usersLoading || devicesLoading || schedulesLoading

  const handleRestore = async (type: Tab, id: string, name: string) => {
    try {
      if (type === 'users') await restoreUserMutation.mutateAsync(id)
      else if (type === 'devices') await restoreDeviceMutation.mutateAsync(id)
      else await restoreScheduleMutation.mutateAsync(id)
      show(t('toast_restored', { name }), 'success')
    } catch {
      show(t('toast_restore_failed'), 'error')
    }
  }

  const handleHardDelete = async () => {
    if (!confirmTarget) return
    setIsConfirming(true)
    try {
      if (confirmTarget.type === 'users') await hardDeleteUserMutation.mutateAsync(confirmTarget.id)
      else if (confirmTarget.type === 'devices') await hardDeleteDeviceMutation.mutateAsync(confirmTarget.id)
      else await hardDeleteScheduleMutation.mutateAsync(confirmTarget.id)
      show(t('trash.toast_hard_deleted', { name: confirmTarget.name }), 'success')
    } catch {
      show(t('trash.error_hard_delete'), 'error')
    } finally {
      setConfirmTarget(null)
      setIsConfirming(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'users', label: t('trash.tab_users') },
    { key: 'devices', label: t('trash.tab_devices') },
    { key: 'schedules', label: t('trash.tab_schedules') },
  ]
  const emptyKey: Record<Tab, [EmptyIcon, string]> = {
    users: ['users', 'trash.empty_users'],
    devices: ['monitor', 'trash.empty_devices'],
    schedules: ['calendar', 'trash.empty_schedules'],
  }
  const items = lists[tab]

  const remaining = (deletedAt?: string | null) => {
    if (!deletedAt) return null
    const left = daysUntil(new Date(new Date(deletedAt).getTime() + RETENTION_DAYS * 86_400_000).toISOString())
    if (left === null) return null
    const days = Math.max(0, left)
    return {
      tone: days <= WARN_DAYS ? 'w' : 'g',
      label: days === 0 ? t('trash.left_today') : t('trash.days_left', { count: days }),
    }
  }

  const avatar = (item: Item) => tab === 'users'
    ? <span className="ops-avatar" aria-hidden="true">{initialsOf(item.name)}</span>
    : <span className="ops-avatar" aria-hidden="true">{tab === 'devices' ? <Monitor size={15} /> : <CalendarDays size={15} />}</span>

  const actions = (item: Item) => (
    <div className="trash-actions">
      <button type="button" className="btn btn-sm ops-btn-outline" onClick={() => handleRestore(tab, item.id, item.name)}
        aria-label={`${t('trash.restore')} ${item.name}`}>
        <RotateCcw size={14} /> {t('trash.restore')}
      </button>
      <button type="button" className="btn btn-sm ops-btn-danger"
        onClick={() => setConfirmTarget({ id: item.id, name: item.name, type: tab })}
        aria-label={`${t('trash.hard_delete')} ${item.name}`}>
        <Trash2 size={14} /> {t('trash.hard_delete')}
      </button>
    </div>
  )

  return (
    <div className="ops-page trash-page">
      <div className="ops-head">
        <div>
          <h2>{t('trash.title')}</h2>
          <p>{t('trash.subtitle')}</p>
        </div>
      </div>

      <div className="trash-info" role="note">
        <AlertCircle size={18} aria-hidden="true" />
        {t('trash.retention_note')}
      </div>

      <div className="ops-pills" role="tablist" aria-label={t('trash.title')}>
        {tabs.map(({ key, label }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={`ops-pill${tab === key ? ' ops-pill--on' : ''}`} onClick={() => setTab(key)}>
            {label}
            {lists[key].length > 0 && <span className="ops-pill-count">{lists[key].length}</span>}
          </button>
        ))}
      </div>

      {loading && <div className="ops-card ops-card-pad ops-muted">{t('trash.loading')}</div>}

      {!loading && items.length === 0 && (
        <div className="data-card">
          <EmptyState icon={emptyKey[tab][0]} title={t(emptyKey[tab][1])} />
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="ops-card ops-table trash-table ops-desktop-only" role="table" aria-label={t('trash.title')}>
            <div className="ops-table-row ops-table-head" role="row">
              <span role="columnheader">{t('trash.th_name')}</span>
              <span role="columnheader">{t('trash.th_deleted_at')}</span>
              <span role="columnheader">{t('trash.th_remaining')}</span>
              <span role="columnheader"><span className="ops-sr-only">{t('trash.th_actions')}</span></span>
            </div>
            {items.map((item) => {
              const r = remaining(item.deletedAt)
              return (
                <div key={item.id} className="ops-table-row" role="row">
                  <div role="cell" className="trash-name">
                    {avatar(item)}
                    <span className="trash-name-text">
                      <span className="ops-strong">{item.name}</span>
                      {item.sub && <span className="ops-muted trash-sub">{item.sub}</span>}
                    </span>
                  </div>
                  <span role="cell" className="ops-muted">{shortDate(item.deletedAt, locale) ?? '-'}</span>
                  <span role="cell">{r ? <span className={`ops-chip ops-chip--${r.tone}`}>{r.label}</span> : '-'}</span>
                  <div role="cell">{actions(item)}</div>
                </div>
              )
            })}
          </div>

          <div className="trash-cards ops-phone-only">
            {items.map((item) => {
              const r = remaining(item.deletedAt)
              return (
                <article key={item.id} className="ops-card trash-card" aria-label={item.name}>
                  <div className="trash-name">
                    {avatar(item)}
                    <span className="trash-name-text">
                      <span className="ops-strong">{item.name}</span>
                      <span className="ops-muted trash-sub">
                        {t('trash.deleted_on', { date: shortDate(item.deletedAt, locale) ?? '-' })}
                      </span>
                    </span>
                    {r && <span className={`ops-chip ops-chip--${r.tone}`}>{r.label}</span>}
                  </div>
                  {actions(item)}
                </article>
              )
            })}
          </div>
        </>
      )}

      {confirmTarget && (
        <ConfirmHardDelete
          name={confirmTarget.name}
          busy={isConfirming}
          onConfirm={handleHardDelete}
          onClose={() => setConfirmTarget(null)}
        />
      )}
    </div>
  )
}
