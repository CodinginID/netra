import { useCallback, useEffect, useState } from 'react'
import { Monitor, Wifi, WifiOff, Plus, Copy, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/Toast'
import {
  listDevices,
  registerDevice,
  revokeDevice,
  type DeviceOut,
  type DeviceRegistered,
} from '@/api/adminApi'
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
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Tambah Perangkat</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) onSubmit(name.trim())
          }}
        >
          <div className="field">
            <label>Nama Perangkat</label>
            <input
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

export function DevicesPage() {
  const token = useAuthStore((s) => s.accessToken)
  const { show } = useToast()
  const [devices, setDevices] = useState<DeviceOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newDevice, setNewDevice] = useState<DeviceRegistered | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      setDevices(await listDevices(token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat perangkat')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const handleAdd = async (name: string) => {
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await registerDevice(token, name)
      setNewDevice(created)
      setShowForm(false)
      show('Perangkat berhasil didaftarkan', 'success')
      await load()
    } catch (err) {
      show(err instanceof Error ? err.message : 'Gagal mendaftarkan perangkat', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async (deviceId: string) => {
    if (!token) return
    setRevokingId(deviceId)
    setError(null)
    try {
      await revokeDevice(token, deviceId)
      show('Perangkat berhasil dicabut', 'success')
      await load()
    } catch (err) {
      show(err instanceof Error ? err.message : 'Gagal mencabut perangkat', 'error')
    } finally {
      setRevokingId(null)
    }
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
        <AddDeviceModal onSubmit={handleAdd} onCancel={() => setShowForm(false)} submitting={submitting} />
      )}

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <span className="device-chip">
          <Monitor size={15} /> Total: {devices.length} perangkat
        </span>
        <span className="device-chip">
          <Wifi size={15} color="#16a34a" /> Aktif: {onlineCount}
        </span>
        <span className="device-chip">
          <WifiOff size={15} color="#dc2626" /> Dicabut: {offlineCount}
        </span>
      </div>

      {loading ? (
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
          <div className="empty-state">
            <Monitor size={40} color="var(--color-text-muted)" style={{ marginBottom: 12 }} />
            <p style={{ margin: 0, fontWeight: 500 }}>Belum ada perangkat terdaftar</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
              Klik "Tambah Perangkat" di atas untuk mendaftarkan kiosk pertama.
            </p>
          </div>
        </div>
      ) : (
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
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRevoke(device.id)}
                    disabled={revokingId === device.id}
                  >
                    {revokingId === device.id ? 'Mencabut...' : 'Cabut'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
