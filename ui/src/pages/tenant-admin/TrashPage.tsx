import { useState } from 'react'
import { RotateCcw, Users, Monitor, CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { useDeletedUsers, useDeletedDevices, useDeletedSchedules } from '@/hooks/useApiQueries'
import { useRestoreUser, useRestoreDevice, useRestoreSchedule } from '@/hooks/useApiMutations'

type Tab = 'users' | 'devices' | 'schedules'

export function TrashPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const [tab, setTab] = useState<Tab>('users')

  const { data: deletedUsersData, isLoading: usersLoading } = useDeletedUsers()
  const { data: deletedDevicesData, isLoading: devicesLoading } = useDeletedDevices()
  const { data: deletedSchedulesData, isLoading: schedulesLoading } = useDeletedSchedules()

  const deletedUsers = deletedUsersData?.items ?? []
  const deletedDevices = deletedDevicesData?.items ?? []
  const deletedSchedules = deletedSchedulesData?.items ?? []

  const restoreUserMutation = useRestoreUser()
  const restoreDeviceMutation = useRestoreDevice()
  const restoreScheduleMutation = useRestoreSchedule()

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
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleRestore('users', u.id, u.full_name)}
                      aria-label={`${t('trash.restore')} ${u.full_name}`}
                    >
                      <RotateCcw size={14} /> {t('trash.restore')}
                    </button>
                  </td>
                </tr>
              ))}

              {tab === 'devices' && deletedDevices.map((d) => (
                <tr key={d.id}>
                  <td><div style={{ fontWeight: 600 }}>{d.name}</div></td>
                  <td>{d.deleted_at ? new Date(d.deleted_at).toLocaleString('id-ID') : '-'}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleRestore('devices', d.id, d.name)}
                      aria-label={`${t('trash.restore')} ${d.name}`}
                    >
                      <RotateCcw size={14} /> {t('trash.restore')}
                    </button>
                  </td>
                </tr>
              ))}

              {tab === 'schedules' && deletedSchedules.map((s) => (
                <tr key={s.id}>
                  <td><div style={{ fontWeight: 600 }}>{s.name}</div></td>
                  <td>{s.deleted_at ? new Date(s.deleted_at).toLocaleString('id-ID') : '-'}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleRestore('schedules', s.id, s.name)}
                      aria-label={`${t('trash.restore')} ${s.name}`}
                    >
                      <RotateCcw size={14} /> {t('trash.restore')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
