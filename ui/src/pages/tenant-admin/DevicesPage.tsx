import { useState } from 'react'
import { WifiOff, Plus, Trash2, Search } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { type DeviceOut, type DeviceRegistered } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { SwipeCard } from '@/components/SwipeCard'
import { PullToRefresh } from '@/components/PullToRefresh'
import { useDevices } from '@/hooks/useApiQueries'
import { useRegisterDevice, useRevokeDevice, useDeleteDevice, useRestoreDevice, useRegenerateDeviceToken, useViewDeviceToken } from '@/hooks/useApiMutations'
import { DevicesCard } from './DevicesCard'
import { AddDeviceModal, DeleteDeviceModal, DeviceTokenDialog, type TokenDialogMode } from './DevicesModals'
import '@/styles/layout.css'
import '@/styles/pages/ops-common.css'
import '@/styles/pages/devices.css'

export function DevicesPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [tokenDevice, setTokenDevice] = useState<DeviceRegistered | null>(null)
  const [tokenMode, setTokenMode] = useState<TokenDialogMode>('created')
  const [deleteTarget, setDeleteTarget] = useState<DeviceOut | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: paginatedDevices, isLoading, error, refetch } = useDevices({ page, limit })
  const devices = paginatedDevices?.items ?? []
  const total = paginatedDevices?.total ?? 0
  const pages = paginatedDevices?.pages ?? 0

  const filteredDevices = searchQuery
    ? devices.filter((d) => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : devices

  const registerMutation = useRegisterDevice(() => {
    setShowForm(false)
    show(t('devices.toast_registered'), 'success')
  })
  const revokeMutation = useRevokeDevice(() => {
    show(t('devices.toast_revoked'), 'success')
  })
  const deleteMutation = useDeleteDevice()
  const restoreMutation = useRestoreDevice()
  const regenerateMutation = useRegenerateDeviceToken()
  const viewTokenMutation = useViewDeviceToken()

  const openToken = (device: DeviceRegistered, mode: TokenDialogMode) => {
    setTokenMode(mode)
    setTokenDevice(device)
  }

  const handleAdd = (name: string) => {
    registerMutation.mutate(name, { onSuccess: (device) => openToken(device, 'created') })
  }

  const handleRegenerate = (deviceId: string) => {
    regenerateMutation.mutate(deviceId, {
      onSuccess: (device) => {
        openToken(device, 'regenerated')
        show(t('devices.toast_token_regenerated'), 'success')
      },
      onError: (err) => show(err instanceof Error ? err.message : t('devices.toast_revoke_failed'), 'error'),
    })
  }

  const handleViewToken = (deviceId: string) => {
    viewTokenMutation.mutate(deviceId, {
      onSuccess: (device) => openToken(device, 'viewed'),
      onError: (err) => show(err instanceof Error ? err.message : t('devices.toast_view_failed'), 'error'),
    })
  }

  const handleRevoke = (deviceId: string) => {
    revokeMutation.mutate(deviceId, {
      onError: (err) => show(err instanceof Error ? err.message : t('devices.toast_revoke_failed'), 'error'),
    })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    const deletedDevice = { ...deleteTarget }
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        show(t('devices.toast_deleted', { name: deletedDevice.name }), 'success', {
          label: t('common.undo'),
          onClick: () => {
            restoreMutation.mutate(deletedDevice.id, {
              onError: () => show(t('devices.toast_restore_failed'), 'error'),
            })
          },
        })
      },
      onError: (err) => show(err instanceof Error ? err.message : t('devices.toast_delete_failed'), 'error'),
    })
  }

  const busyFor = (id: string) =>
    [regenerateMutation, revokeMutation, viewTokenMutation].some((m) => m.isPending && m.variables === id)

  return (
    <div className="ops-page dev-page">
      <div className="ops-head">
        <div>
          <h2>{t('devices.title')}</h2>
          <p>{t('devices.subtitle')}</p>
        </div>
        <div className="ops-head-actions">
          {total > 0 && (
            <label className="dev-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                placeholder={t('devices.search_placeholder')}
                aria-label={t('devices.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          )}
          <button className="btn btn-primary ops-desktop-only" onClick={() => setShowForm(true)}>
            <Plus size={16} /> {t('devices.add')}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      {isLoading ? (
        <div className="dev-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ops-card ops-card-pad dev-skeleton">
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: '55%' }} />
                <div className="skeleton skeleton-text sm" style={{ width: '40%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="data-card">
          <EmptyState
            icon="monitor"
            title={searchQuery ? t('devices.search_empty') : t('devices.empty')}
            description={searchQuery ? t('devices.search_empty_desc') : t('devices.empty_desc')}
            action={
              searchQuery
                ? <button className="btn btn-ghost" onClick={() => setSearchQuery('')}>{t('devices.search_clear')}</button>
                : <button className="btn btn-primary" onClick={() => setShowForm(true)}>{t('devices.add')}</button>
            }
          />
        </div>
      ) : (
        <PullToRefresh onRefresh={() => refetch()}>
          <div className="dev-grid">
            {filteredDevices.map((device) => (
              <SwipeCard
                key={device.id}
                left={
                  device.status === 'active'
                    ? { icon: <WifiOff size={20} />, label: t('devices.swipe_revoke'), variant: 'primary', onAction: () => handleRevoke(device.id) }
                    : undefined
                }
                right={{ icon: <Trash2 size={20} />, label: t('devices.swipe_delete'), variant: 'danger', onAction: () => setDeleteTarget(device) }}
              >
                <DevicesCard
                  device={device}
                  busy={busyFor(device.id)}
                  onViewToken={() => handleViewToken(device.id)}
                  onRegenerate={() => handleRegenerate(device.id)}
                  onRevoke={() => handleRevoke(device.id)}
                  onDelete={() => setDeleteTarget(device)}
                />
              </SwipeCard>
            ))}
            <button type="button" className="ops-add-tile ops-desktop-only" onClick={() => setShowForm(true)}>
              <Plus size={16} /> {t('devices.register_new')}
            </button>
          </div>
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        </PullToRefresh>
      )}

      <button type="button" className="btn btn-primary ops-phone-only dev-phone-add" onClick={() => setShowForm(true)}>
        <Plus size={16} /> {t('devices.add')}
      </button>

      {showForm && (
        <AddDeviceModal onSubmit={handleAdd} onCancel={() => setShowForm(false)} submitting={registerMutation.isPending} />
      )}
      {tokenDevice && (
        <DeviceTokenDialog device={tokenDevice} mode={tokenMode} onClose={() => setTokenDevice(null)} />
      )}
      {deleteTarget && (
        <DeleteDeviceModal
          device={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
