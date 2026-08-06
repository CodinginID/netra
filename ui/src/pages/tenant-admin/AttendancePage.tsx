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
  MapPin,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { EmptyState } from '@/components/EmptyState'
import { useI18n, t as tGlobal } from '@/store/i18nStore'
import {
  exportAttendanceUrl,
  type AttendanceOut,
  type AttendanceLocation,
} from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { useAttendance, useUsers } from '@/hooks/useApiQueries'

const STATUS_LABELS: Record<AttendanceOut['status'], string> = {
  on_time: 'attendance.status_on_time',
  late: 'attendance.status_late',
  early_leave: 'attendance.status_early_leave',
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
      {tGlobal(STATUS_LABELS[status])}
    </span>
  )
}

function LocationCell({ location }: { location: AttendanceLocation | null }) {
  const { t } = useI18n()
  if (!location || location.lat == null || location.lng == null) {
    return <span style={{ color: 'var(--color-text-muted)' }}>—</span>
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <a
        href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--color-brand)' }}
        title={`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}
      >
        <MapPin size={13} /> {t('attendance.location_map')}
      </a>
      {location.outside_geofence && (
        <span className="badge badge-red" title={t('attendance.location_outside_title')}>{t('attendance.location_outside')}</span>
      )}
    </span>
  )
}

function TypeBadge({ type }: { type: AttendanceOut['type'] }) {
  const { t } = useI18n()
  const isIn = type === 'check_in'
  return (
    <span className={`badge ${isIn ? 'badge-green' : 'badge-gray'}`}>
      {isIn ? <LogIn size={13} /> : <LogOut size={13} />}
      {isIn ? t('attendance.type_in') : t('attendance.type_out')}
    </span>
  )
}

export function AttendancePage() {
  const { t } = useI18n()
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

  const { data: usersData } = useUsers({ limit: 1000 })
  const userMap = new Map<string, string>(
    (usersData?.items ?? []).map((u) => [u.id, u.full_name ?? u.username ?? u.id.slice(0, 8)])
  )

  async function handleExport() {
    if (!token) return
    try {
      const url = exportAttendanceUrl(fromDate, toDate, 'csv')
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `attendance_${fromDate}_${toDate}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      // Export error handling kept local
    }
  }

  const onTime = rows.filter((r) => r.status === 'on_time').length
  const late = rows.filter((r) => r.status === 'late').length

  const stats = [
    { label: t('attendance.stat_total'), value: total, icon: ClipboardList, color: 'var(--color-brand)' },
    { label: t('attendance.stat_on_time'), value: onTime, icon: UserCheck, color: '#16a34a' },
    { label: t('attendance.stat_late'), value: late, icon: Clock3, color: '#ca8a04' },
  ]

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
          <h2 className="page-title">{t('attendance.title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('attendance.subtitle')}
          </p>
        </div>
      </div>

      <div
        className="stat-grid"
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
            placeholder={t('attendance.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('attendance.search_label')}
          />
        </div>
        <span className="filter-label" id="from-date-label">{t('attendance.from_label')}:</span>
        <input
          type="date"
          className="date-input"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          aria-labelledby="from-date-label"
        />
        <span className="filter-label" id="to-date-label">{t('attendance.to_label')}:</span>
        <input
          type="date"
          className="date-input"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          aria-labelledby="to-date-label"
        />
        <button className="btn btn-primary" onClick={() => setPage(1)} disabled={isLoading}>
          <Search size={16} /> {t('attendance.search_btn')}
        </button>
        <button className="btn btn-ghost" onClick={() => void handleExport()}>
          <Download size={16} /> {t('attendance.export_csv')}
        </button>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      <div className="data-card responsive-table">
        <table className="data-table">
          <thead>
            <tr>
              {[t('attendance.th_user'), t('attendance.th_type'), t('attendance.th_time'), t('attendance.th_status'), t('attendance.th_location'), t('attendance.th_liveness')].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">{t('attendance.loading')}</div>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon="clipboard"
                    title={t('attendance.empty')}
                    description={t('attendance.empty_desc')}
                  />
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 500 }}>{userMap.get(row.user_id) ?? row.user_id.slice(0, 8)}</td>
                  <td><TypeBadge type={row.type} /></td>
                  <td>{formatTime(row.occurred_at)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td><LocationCell location={row.location} /></td>
                  <td>{row.liveness_score != null ? row.liveness_score.toFixed(2) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="responsive-cards">
        {isLoading ? (
          <div className="empty-state">{t('attendance.loading')}</div>
        ) : filteredRows.length === 0 ? (
          <div className="data-card">
            <EmptyState
              icon="clipboard"
              title={t('attendance.empty')}
              description={t('attendance.empty_desc')}
            />
          </div>
        ) : (
          filteredRows.map((row) => (
            <div key={row.id} className="record-card">
              <div className="record-card-top">
                <span className="record-card-name">{userMap.get(row.user_id) ?? row.user_id.slice(0, 8)}</span>
                <TypeBadge type={row.type} />
              </div>
              <div className="record-card-row">
                <span className="label">{t('attendance.card_time')}</span>
                <span className="value">{formatTime(row.occurred_at)}</span>
              </div>
              <div className="record-card-row">
                <span className="label">{t('attendance.card_status')}</span>
                <StatusBadge status={row.status} />
              </div>
              <div className="record-card-row">
                <span className="label">{t('attendance.card_location')}</span>
                <LocationCell location={row.location} />
              </div>
              {row.liveness_score != null && (
                <div className="record-card-row">
                  <span className="label">{t('attendance.card_liveness')}</span>
                  <span className="value">{row.liveness_score.toFixed(2)}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
    </div>
  )
}
