import { useState } from 'react'
import { RotateCcw, Users, Monitor, CalendarDays, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
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

type Tab = 'users' | 'devices' | 'schedules'

type ConfirmTarget = { id: string; name: string; type: Tab } | null

export function TrashPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const [tab, setTab] = useState<Tab>('users')
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  const { data: deletedUsersData, isLoading: usersLoading } = useDeletedUsers()
  const { data: deletedDevicesData, isLoading: devicesLoading } = useDeletedDevices()
  const { data: deletedSchedulesData, isLoading: schedulesLoading } = useDeletedSchedules()

  const deletedUsers = deletedUsersData?.items ?? []
  const deletedDevices = deletedDevicesData?.items ?? []
  const deletedSchedules = deletedSchedulesData?.items ?? []

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

  const tabs: { key: Tab; label: string; icon: typeof Users; count: number }[] = [
    { key: 'users', label: t('trash.tab_users'), icon: Users, count: deletedUsers.length },
    { key: 'devices', label: t('trash.tab_devices'), icon: Monitor, count: deletedDevices.length },
    { key: 'schedules', label: t('trash.tab_schedules'), icon: CalendarDays, count: deletedSchedules.length },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('trash.title')}</h2>
          <p>{t('trash.subtitle')}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            className={`schedule-type-btn${tab === key ? ' schedule-type-btn--active' : ''}`}
            onClick={() => setTab(key)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon size={16} />
            {label}
            {count > 0 && (
              <span className="badge badge-gray" style={{ marginLeft: 4 }}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="empty-state">{t('trash.loading')}</div>}

      {!loading && (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('trash.th_name')}</th>
                <th>{t('trash.th_deleted_at')}</th>
                <th style={{ width: 120 }}>{t('trash.th_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tab === 'users' && deletedUsers.length === 0 && (
                <tr><td colSpan={3}><EmptyState icon="users" title={t('trash.empty_users')} /></td></tr>
              )}
              {tab === 'devices' && deletedDevices.length === 0 && (
                <tr><td colSpan={3}><EmptyState icon="monitor" title={t('trash.empty_devices')} /></td></tr>
              )}
              {tab === 'schedules' && deletedSchedules.length === 0 && (
                <tr><td colSpan={3}><EmptyState icon="calendar" title={t('trash.empty_schedules')} /></td></tr>
              )}

              {tab === 'users' && deletedUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{u.username ?? '-'}</div>
                  </td>
                  <td>{u.deleted_at ? new Date(u.deleted_at).toLocaleString('id-ID') : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleRestore('users', u.id, u.full_name)}
                        aria-label={`${t('trash.restore')} ${u.full_name}`}
                        title={t('trash.restore')}
                      >
                        <RotateCcw size={14} /> {t('trash.restore')}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        onClick={() => setConfirmTarget({ id: u.id, name: u.full_name, type: 'users' })}
                        aria-label={`${t('trash.hard_delete')} ${u.full_name}`}
                        title={t('trash.hard_delete')}
                      >
                        <Trash2 size={14} /> {t('trash.hard_delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {tab === 'devices' && deletedDevices.map((d) => (
                <tr key={d.id}>
                  <td><div style={{ fontWeight: 600 }}>{d.name}</div></td>
                  <td>{d.deleted_at ? new Date(d.deleted_at).toLocaleString('id-ID') : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleRestore('devices', d.id, d.name)}
                        aria-label={`${t('trash.restore')} ${d.name}`}
                        title={t('trash.restore')}
                      >
                        <RotateCcw size={14} /> {t('trash.restore')}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        onClick={() => setConfirmTarget({ id: d.id, name: d.name, type: 'devices' })}
                        aria-label={`${t('trash.hard_delete')} ${d.name}`}
                        title={t('trash.hard_delete')}
                      >
                        <Trash2 size={14} /> {t('trash.hard_delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {tab === 'schedules' && deletedSchedules.map((s) => (
                <tr key={s.id}>
                  <td><div style={{ fontWeight: 600 }}>{s.name}</div></td>
                  <td>{s.deleted_at ? new Date(s.deleted_at).toLocaleString('id-ID') : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleRestore('schedules', s.id, s.name)}
                        aria-label={`${t('trash.restore')} ${s.name}`}
                        title={t('trash.restore')}
                      >
                        <RotateCcw size={14} /> {t('trash.restore')}
                      </button>
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        onClick={() => setConfirmTarget({ id: s.id, name: s.name, type: 'schedules' })}
                        aria-label={`${t('trash.hard_delete')} ${s.name}`}
                        title={t('trash.hard_delete')}
                      >
                        <Trash2 size={14} /> {t('trash.hard_delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmTarget && (
        <div
          className="modal-backdrop"
          onKeyDown={(e) => e.key === 'Escape' && setConfirmTarget(null)}
          onClick={(e) => e.target === e.currentTarget && setConfirmTarget(null)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">{t('trash.hard_delete_title')}</h3>
            <p
              style={{
                fontSize: 14,
                color: 'var(--color-text-secondary)',
                marginBottom: 8,
              }}
            >
              {t('trash.hard_delete_confirm', { name: confirmTarget.name })}
            </p>
            <div className="modal-footer">
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmTarget(null)}
                disabled={isConfirming}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-danger"
                onClick={handleHardDelete}
                disabled={isConfirming}
              >
                {isConfirming ? t('common.deleting') : t('trash.hard_delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
