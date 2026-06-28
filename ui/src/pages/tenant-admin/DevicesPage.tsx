import { useState } from 'react'
import { Monitor, Wifi, WifiOff, Plus, Copy, RefreshCw, Trash2, KeyRound } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { useI18n } from '@/store/i18nStore'
import {
  type DeviceOut,
  type DeviceRegistered,
} from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { SwipeCard } from '@/components/SwipeCard'
import { PullToRefresh } from '@/components/PullToRefresh'
import { MobileFab } from '@/components/MobileFab'
import { useDevices } from '@/hooks/useApiQueries'
import { useRegisterDevice, useRevokeDevice, useDeleteDevice, useRestoreDevice, useRegenerateDeviceToken } from '@/hooks/useApiMutations'
import '@/styles/layout.css'

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useI18n()
  return (
    <span className={`badge ${active ? 'badge-green' : 'badge-gray'}`}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
      {active ? t('active') : t('suspended')}
    </span>
  )
}

function formatLastSeen(value: string | null): string {
  const { t } = useI18n()
  if (!value) return t('devices.never_seen')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('devices.never_seen')
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AddDeviceModal({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (name: string) => void
  onCancel: () => void
  submitting: boolean
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose: onCancel })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onCancel}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('devices.add_title')}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) onSubmit(name.trim())
          }}
        >
          <div className="field">
            <label htmlFor="device-name">{t('devices.name_label')}</label>
            <input
              id="device-name"
              className="field-input"
              autoFocus
              type="text"
              placeholder={t('devices.name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {t('devices.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? t('devices.submit_loading') : t('devices.register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NewTokenBanner({ device, regenerated, onDismiss }: { device: DeviceRegistered; regenerated?: boolean; onDismiss: () => void }) {
  const { t } = useI18n()
  return (
    <div className="data-card" style={{ border: '1px solid var(--color-success)', padding: 16, marginBottom: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)', marginBottom: 6 }}>
        {regenerated
          ? t('devices.token_created_new', { name: device.name })
          : t('devices.device_created', { name: device.name })}
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 10 }}>
        {t('devices.token_warning')}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <code style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--color-text)', wordBreak: 'break-all' }}>
          {device.token}
        </code>
        <button
          className="btn btn-ghost btn-sm"
          title={t('devices.copy_token')}
          aria-label={t('devices.copy_token')}
          onClick={() => navigator.clipboard?.writeText(device.token)}
        >
          <Copy size={15} />
        </button>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss} style={{ marginTop: 10 }}>
        {t('devices.token_saved')}
      </button>
    </div>
  )
}

function DeleteConfirmModal({
  device,
  onConfirm,
  onClose,
  loading,
}: {
  device: DeviceOut
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('devices.delete_title')}</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          {t('devices.delete_confirm', { name: device.name })}
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>{t('devices.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? t('devices.delete_loading') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DevicesPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [newDevice, setNewDevice] = useState<DeviceRegistered | null>(null)
  const [tokenRegenerated, setTokenRegenerated] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeviceOut | null>(null)

  const { data: paginatedDevices, isLoading, error, refetch } = useDevices({ page, limit })
  const devices = paginatedDevices?.items ?? []
  const total = paginatedDevices?.total ?? 0
  const pages = paginatedDevices?.pages ?? 0

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

  const handleAdd = (name: string) => {
    registerMutation.mutate(name, {
      onSuccess: (device) => {
        setTokenRegenerated(false)
        setNewDevice(device)
      },
    })
  }

  const handleRegenerate = (deviceId: string) => {
    regenerateMutation.mutate(deviceId, {
      onSuccess: (device) => {
        setTokenRegenerated(true)
        setNewDevice(device)
        show(t('devices.toast_token_regenerated'), 'success')
      },
      onError: (err) => {
        show(err instanceof Error ? err.message : t('devices.toast_revoke_failed'), 'error')
      },
    })
  }

  const handleRevoke = (deviceId: string) => {
    revokeMutation.mutate(deviceId, {
      onError: (err) => {
        show(err instanceof Error ? err.message : t('devices.toast_revoke_failed'), 'error')
      },
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
              onError: () => {
                show(t('devices.toast_restore_failed'), 'error')
              },
            })
          },
        })
      },
      onError: (err) => {
        show(err instanceof Error ? err.message : t('devices.toast_delete_failed'), 'error')
      },
    })
  }

  const onlineCount = devices.filter((d) => d.status === 'active').length
  const offlineCount = devices.length - onlineCount

  return (
    <div>
      <div className="page-toolbar" style={{ marginBottom: '1.5rem' }}>
        <h2 className="page-title">{t('devices.title')}</h2>
        <button className="btn btn-primary add-fab-twin" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> {t('devices.add')}
        </button>
      </div>

      {newDevice && (
        <NewTokenBanner device={newDevice} regenerated={tokenRegenerated} onDismiss={() => setNewDevice(null)} />
      )}

      {showForm && (
        <AddDeviceModal onSubmit={handleAdd} onCancel={() => setShowForm(false)} submitting={registerMutation.isPending} />
      )}

      {error && <div className="error-banner">{error.message}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <span className="device-chip">
          <Monitor size={15} /> {t('devices.chip_total', { count: total })}
        </span>
        <span className="device-chip">
          <Wifi size={15} color="#16a34a" /> {t('devices.chip_active', { count: onlineCount })}
        </span>
        <span className="device-chip">
          <WifiOff size={15} color="#dc2626" /> {t('devices.chip_revoked', { count: offlineCount })}
        </span>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div className="skeleton skeleton-text" style={{ width: '55%' }} />
                <div className="skeleton skeleton-badge" />
              </div>
              <div className="skeleton skeleton-text sm" />
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                <div className="skeleton skeleton-text" style={{ width: 70 }} />
              </div>
            </div>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="data-card">
          <EmptyState
            icon="monitor"
            title={t('devices.empty')}
            description={t('devices.empty_desc')}
            action={
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                {t('devices.add')}
              </button>
            }
          />
        </div>
      ) : (
        <PullToRefresh onRefresh={() => refetch()}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {devices.map((device) => (
              <SwipeCard
                key={device.id}
                left={
                  device.status === 'active'
                    ? { icon: <WifiOff size={20} />, label: t('devices.swipe_revoke'), variant: 'primary', onAction: () => handleRevoke(device.id) }
                    : undefined
                }
                right={{ icon: <Trash2 size={20} />, label: t('devices.swipe_delete'), variant: 'danger', onAction: () => setDeleteTarget(device) }}
              >
                <div
                  className="stat-card"
                  style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)' }}>{device.name}</div>
                    <StatusBadge active={device.status === 'active'} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)' }}>
                    <RefreshCw size={13} /> {t('devices.last_active')}: {formatLastSeen(device.last_seen_at)}
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      title={device.status === 'active'
                        ? t('devices.reset_title_active')
                        : t('devices.reset_title_inactive')}
                      onClick={() => handleRegenerate(device.id)}
                      disabled={regenerateMutation.isPending && regenerateMutation.variables === device.id}
                    >
                      <KeyRound size={15} />
                      {regenerateMutation.isPending && regenerateMutation.variables === device.id
                        ? t('devices.creating')
                        : device.status === 'active' ? t('devices.reset_token') : t('devices.restore_token')}
                    </button>
                    {device.status === 'active' && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRevoke(device.id)}
                        disabled={revokeMutation.isPending && revokeMutation.variables === device.id}
                      >
                        {revokeMutation.isPending && revokeMutation.variables === device.id ? t('devices.revoking') : t('devices.revoke')}
                      </button>
                    )}
                    <button
                      className="btn-icon btn-icon-danger"
                      title={t('devices.delete_tooltip')}
                      aria-label={t('devices.delete_aria')}
                      onClick={() => setDeleteTarget(device)}
                      style={{ marginLeft: 'auto' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </SwipeCard>
            ))}
          </div>
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        </PullToRefresh>
      )}

      <MobileFab onClick={() => setShowForm(true)} label={t('devices.add')}>
        <Plus size={24} />
      </MobileFab>

      {deleteTarget && (
        <DeleteConfirmModal
          device={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
