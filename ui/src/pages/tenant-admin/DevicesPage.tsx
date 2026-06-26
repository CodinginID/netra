import { useState } from 'react'
import { Monitor, Wifi, WifiOff, Plus, Copy, RefreshCw, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import {
  type DeviceOut,
  type DeviceRegistered,
} from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { useDevices } from '@/hooks/useApiQueries'
import { useRegisterDevice, useRevokeDevice, useDeleteDevice, useRestoreDevice } from '@/hooks/useApiMutations'
import '@/styles/layout.css'

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`badge ${active ? 'badge-green' : 'badge-gray'}`}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
      {active ? 'Aktif' : 'Dicabut'}
    </span>
  )
}

function formatLastSeen(value: string | null): string {
  if (!value) return 'Belum pernah'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Belum pernah'
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
  const [name, setName] = useState('')
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose: onCancel })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onCancel}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Tambah Perangkat</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) onSubmit(name.trim())
          }}
        >
          <div className="field">
            <label htmlFor="device-name">Nama Perangkat</label>
            <input
              id="device-name"
              className="field-input"
              autoFocus
              type="text"
              placeholder="Kiosk Lobby Utama"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Menyimpan...' : 'Daftarkan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NewTokenBanner({ device, onDismiss }: { device: DeviceRegistered; onDismiss: () => void }) {
  return (
    <div className="data-card" style={{ border: '1px solid var(--color-success)', padding: 16, marginBottom: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)', marginBottom: 6 }}>
        Perangkat "{device.name}" berhasil dibuat
      </div>
      <div style={{ fontSize: 13, color: 'var(--color-danger)', marginBottom: 10 }}>
        Salin token ini sekarang — token tidak dapat ditampilkan lagi setelah ditutup.
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
          title="Salin token"
          aria-label="Salin token"
          onClick={() => navigator.clipboard?.writeText(device.token)}
        >
          <Copy size={15} />
        </button>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss} style={{ marginTop: 10 }}>
        Saya sudah menyimpannya
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
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Hapus Perangkat</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          Yakin hapus perangkat <strong style={{ color: 'var(--color-text)' }}>{device.name}</strong>? Data dapat dipulihkan dari Tempat Sampah dalam 30 hari.
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Batal</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DevicesPage() {
  const { show } = useToast()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [newDevice, setNewDevice] = useState<DeviceRegistered | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeviceOut | null>(null)

  const { data: paginatedDevices, isLoading, error } = useDevices({ page, limit })
  const devices = paginatedDevices?.items ?? []
  const total = paginatedDevices?.total ?? 0
  const pages = paginatedDevices?.pages ?? 0

  const registerMutation = useRegisterDevice(() => {
    setShowForm(false)
    show('Perangkat berhasil didaftarkan', 'success')
  })

  const revokeMutation = useRevokeDevice(() => {
    show('Perangkat berhasil dicabut', 'success')
  })

  const deleteMutation = useDeleteDevice()
  const restoreMutation = useRestoreDevice()

  const handleAdd = (name: string) => {
    // Per-call onSuccess receives the created device (incl. the one-time token)
    // so we can surface it in the banner — the hook-level onSuccess only handles
    // toast/cache invalidation and gets no data.
    registerMutation.mutate(name, {
      onSuccess: (device) => setNewDevice(device),
    })
  }

  const handleRevoke = (deviceId: string) => {
    revokeMutation.mutate(deviceId, {
      onError: (err) => {
        show(err instanceof Error ? err.message : 'Gagal mencabut perangkat', 'error')
      },
    })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    const deletedDevice = { ...deleteTarget }
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        show(`${deletedDevice.name} berhasil dihapus`, 'success', {
          label: 'Undo',
          onClick: () => {
            restoreMutation.mutate(deletedDevice.id, {
              onError: () => {
                show('Gagal membatalkan penghapusan', 'error')
              },
            })
          },
        })
      },
      onError: (err) => {
        show(err instanceof Error ? err.message : 'Gagal menghapus perangkat', 'error')
      },
    })
  }

  const onlineCount = devices.filter((d) => d.status === 'active').length
  const offlineCount = devices.length - onlineCount

  return (
    <div>
      <div className="page-toolbar" style={{ marginBottom: '1.5rem' }}>
        <h2 className="page-title">Perangkat Kiosk</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> Tambah Perangkat
        </button>
      </div>

      {newDevice && <NewTokenBanner device={newDevice} onDismiss={() => setNewDevice(null)} />}

      {showForm && (
        <AddDeviceModal onSubmit={handleAdd} onCancel={() => setShowForm(false)} submitting={registerMutation.isPending} />
      )}

      {error && <div className="error-banner">{error.message}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <span className="device-chip">
          <Monitor size={15} /> Total: {total} perangkat
        </span>
        <span className="device-chip">
          <Wifi size={15} color="#16a34a" /> Aktif: {onlineCount}
        </span>
        <span className="device-chip">
          <WifiOff size={15} color="#dc2626" /> Dicabut: {offlineCount}
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
            title="Belum ada perangkat"
            description="Daftarkan perangkat kiosk pertama Anda untuk mulai absensi"
            action={
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                Tambah Perangkat
              </button>
            }
          />
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {devices.map((device) => (
              <div
                key={device.id}
                className="stat-card"
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)' }}>{device.name}</div>
                  <StatusBadge active={device.status === 'active'} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)' }}>
                  <RefreshCw size={13} /> Terakhir aktif: {formatLastSeen(device.last_seen_at)}
                </div>

                {device.status === 'active' && (
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRevoke(device.id)}
                      disabled={revokeMutation.isPending && revokeMutation.variables === device.id}
                    >
                      {revokeMutation.isPending && revokeMutation.variables === device.id ? 'Mencabut...' : 'Cabut'}
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      title="Hapus perangkat"
                      aria-label="Hapus perangkat"
                      onClick={() => setDeleteTarget(device)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        </div>
      )}

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
