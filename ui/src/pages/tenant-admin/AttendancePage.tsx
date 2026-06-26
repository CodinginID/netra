import '@/styles/layout.css'
import { useState } from 'react'
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
import { EmptyState } from '@/components/EmptyState'
import {
  exportAttendanceUrl,
  type AttendanceOut,
} from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { useAttendance, useUsers } from '@/hooks/useApiQueries'

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
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [query, setQuery] = useState('')

  const { data: paginatedAttendance, isLoading, error } = useAttendance({ page, limit, from: fromDate, to: toDate })
  const rows = paginatedAttendance?.items ?? []
  const total = paginatedAttendance?.total ?? 0
  const pages = paginatedAttendance?.pages ?? 0

  // Fetch all users for name lookup (no pagination needed for lookup)
  const { data: usersData } = useUsers({ limit: 1000 })
  const userMap = new Map<string, string>(
    (usersData?.items ?? []).map((u) => [u.id, u.full_name ?? u.username ?? u.id.slice(0, 8)])
  )

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
      // Export error handling kept local since it's not a query
    }
  }

  const onTime = rows.filter((r) => r.status === 'on_time').length
  const late = rows.filter((r) => r.status === 'late').length

  const stats = [
    { label: 'Total Catatan', value: total, icon: ClipboardList, color: 'var(--color-brand)' },
    { label: 'Tepat Waktu', value: onTime, icon: UserCheck, color: '#16a34a' },
    { label: 'Terlambat', value: late, icon: Clock3, color: '#ca8a04' },
  ]

  // Client-side name filter (search input)
  const filteredRows = query
    ? rows.filter((r) => {
        const name = userMap.get(r.user_id) ?? ''
        return name.toLowerCase().includes(query.toLowerCase())
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
            aria-label="Cari nama pengguna"
          />
        </div>
        <span className="filter-label" id="from-date-label">Dari:</span>
        <input
          type="date"
          className="date-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          aria-labelledby="from-date-label"
        />
        <span className="filter-label" id="to-date-label">Sampai:</span>
        <input
          type="date"
          className="date-input"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          aria-labelledby="to-date-label"
        />
        <button className="btn btn-primary" onClick={() => setPage(1)} disabled={isLoading}>
          <Search size={16} /> Cari
        </button>
        <button className="btn btn-ghost" onClick={() => void handleExport()}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

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
            {isLoading ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">Memuat...</div>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon="clipboard"
                    title="Belum ada data kehadiran"
                    description="Data absensi akan muncul setelah kiosk mulai digunakan"
                  />
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
        <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
      </div>
    </div>
  )
}
