import '@/styles/layout.css'
import { useCallback, useEffect, useState } from 'react'
import {
  ClipboardList,
  UserCheck,
  Clock3,
  Download,
  Search,
  CheckCircle2,
  Clock,
  LogIn,
  LogOut,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import {
  listAttendance,
  exportAttendanceUrl,
  listUsers,
  type AttendanceOut,
} from '@/api/adminApi'

type StatusLabel = 'Tepat Waktu' | 'Terlambat' | 'Pulang Awal'

const STATUS_LABELS: Record<AttendanceOut['status'], StatusLabel> = {
  on_time: 'Tepat Waktu',
  late: 'Terlambat',
  early_leave: 'Pulang Awal',
}

const TYPE_LABELS: Record<AttendanceOut['type'], string> = {
  check_in: 'Masuk',
  check_out: 'Keluar',
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function StatusBadge({ status }: { status: AttendanceOut['status'] }) {
  const map = {
    on_time: { cls: 'badge-green', Icon: CheckCircle2 },
    late: { cls: 'badge-orange', Icon: Clock },
    early_leave: { cls: 'badge-red', Icon: Clock },
  } as const
  const { cls, Icon } = map[status]
  return (
    <span className={`badge ${cls}`}>
      <Icon size={13} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function TypeBadge({ type }: { type: AttendanceOut['type'] }) {
  const isIn = type === 'check_in'
  return (
    <span className={`badge ${isIn ? 'badge-green' : 'badge-gray'}`}>
      {isIn ? <LogIn size={13} /> : <LogOut size={13} />}
      {TYPE_LABELS[type]}
    </span>
  )
}

export function AttendancePage() {
  const token = useAuthStore((s) => s.accessToken)

  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(today())
  const [rows, setRows] = useState<AttendanceOut[]>([])
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map())
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const [data, users] = await Promise.all([
        listAttendance(token, { from: fromDate, to: toDate }),
        listUsers(token),
      ])
      setUserMap(new Map(users.map((u) => [u.id, u.full_name ?? u.username ?? u.id.slice(0, 8)])))
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data kehadiran')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [token, fromDate, toDate])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  async function handleExport() {
    if (!token) return
    try {
      const url = exportAttendanceUrl(fromDate, toDate, 'csv')
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`Export gagal (${res.status})`)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `attendance_${fromDate}_${toDate}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor data')
    }
  }

  const total = rows.length
  const onTime = rows.filter((r) => r.status === 'on_time').length
  const late = rows.filter((r) => r.status === 'late').length

  const stats = [
    { label: 'Total Catatan', value: total, icon: ClipboardList, color: 'var(--color-brand)' },
    { label: 'Tepat Waktu', value: onTime, icon: UserCheck, color: '#16a34a' },
    { label: 'Terlambat', value: late, icon: Clock3, color: '#ca8a04' },
  ]

  const filteredRows = query.trim()
    ? rows.filter((r) => {
        const name = userMap.get(r.user_id) ?? r.user_id
        return name.toLowerCase().includes(query.trim().toLowerCase())
      })
    : rows

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">Kehadiran</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Lihat dan ekspor catatan kehadiran
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon" style={{ background: `${color}14` }}>
              <Icon size={20} color={color} />
            </div>
            <div>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="filter-row">
        <div className="search-input-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
          <Search size={16} />
          <input
            className="search-input"
            type="text"
            placeholder="Cari nama pengguna..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="filter-label">Dari:</span>
        <input
          type="date"
          className="date-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <span className="filter-label">Sampai:</span>
        <input
          type="date"
          className="date-input"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => void fetchData()} disabled={loading}>
          <Search size={16} /> Cari
        </button>
        <button className="btn btn-ghost" onClick={() => void handleExport()}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              {['Pengguna', 'Tipe', 'Waktu', 'Status', 'Skor Liveness'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">Memuat...</div>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <ClipboardList size={36} color="var(--color-text-muted)" style={{ marginBottom: 10 }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>Tidak ada catatan kehadiran</p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>Coba ubah filter periode atau nama pengguna.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 500 }}>{userMap.get(row.user_id) ?? row.user_id.slice(0, 8)}</td>
                  <td>
                    <TypeBadge type={row.type} />
                  </td>
                  <td>{formatTime(row.occurred_at)}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>{row.liveness_score != null ? row.liveness_score.toFixed(2) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
