import { useEffect, useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import {
  Users,
  ScanFace,
  Monitor,
  CalendarDays,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  XCircle,
  UserCheck,
} from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { dailyReport, listUsers, listAttendance } from '@/api/adminApi'
import { useAuthStore } from '@/store/authStore'

const NAV_ITEMS = [
  { label: 'Pengguna', to: '/tenant/users', icon: Users },
  { label: 'Enrollment', to: '/tenant/enrollment', icon: ScanFace },
  { label: 'Perangkat', to: '/tenant/devices', icon: Monitor },
  { label: 'Jadwal', to: '/tenant/schedules', icon: CalendarDays },
  { label: 'Kehadiran', to: '/tenant/attendance', icon: ClipboardList },
]

export function TenantAdminDashboard() {
  return (
    <DashboardLayout title="Tenant Admin" navItems={NAV_ITEMS}>
      <Outlet />
    </DashboardLayout>
  )
}

export function TenantAdminIndex() {
  return <Navigate to="/tenant/attendance" replace />
}

interface StatCard {
  label: string
  value: number
  Icon: typeof CheckCircle2
  fg: string
  bg: string
}

interface RecentItem {
  name: string
  action: string
  time: string
  isCheckIn: boolean
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

interface TrendPoint {
  day: string
  check_in: number
  late: number
}

function TrendChart({ data }: { data: TrendPoint[] }) {
  const maxVal = Math.max(...data.map((d) => d.check_in), 1)
  const W = 560
  const H = 120
  const BAR_W = 48
  const GAP = (W - data.length * BAR_W) / (data.length + 1)

  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} style={{ width: '100%', overflow: 'visible' }}>
      {data.map((d, i) => {
        const x = GAP + i * (BAR_W + GAP)
        const barH = Math.round((d.check_in / maxVal) * H)
        const lateH = Math.round((d.late / maxVal) * H)
        const dayLabel = new Date(d.day + 'T12:00').toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
        })
        return (
          <g key={d.day}>
            <rect x={x} y={H - barH} width={BAR_W} height={barH} rx={4} fill="rgba(124,58,237,0.18)" />
            <rect x={x} y={H - lateH} width={BAR_W} height={lateH} rx={4} fill="rgba(217,119,6,0.7)" />
            <text x={x + BAR_W / 2} y={H - barH - 4} textAnchor="middle" fill="var(--color-text)" fontSize={11}>
              {d.check_in}
            </text>
            <text x={x + BAR_W / 2} y={H + 16} textAnchor="middle" fill="var(--color-text-muted)" fontSize={10}>
              {dayLabel}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function TenantAdminHomePage() {
  const token = useAuthStore((s) => s.accessToken)
  const [stats, setStats] = useState<StatCard[] | null>(null)
  const [rate, setRate] = useState(0)
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    const load = async () => {
      try {
        const today = todayString()
        const [recap, users, attendance] = await Promise.all([
          dailyReport(token, today),
          listUsers(token),
          listAttendance(token, { from: today, to: today }),
        ])
        if (!active) return

        const enrolled = users.filter((u) => u.enrolled).length
        const absent = Math.max(enrolled - recap.check_in, 0)
        const attendanceRate = enrolled > 0 ? Math.round((recap.check_in / enrolled) * 100) : 0

        // "Sedang di kantor": latest record per-user is check_in (open check-in, no check-out after)
        const latestByUser = new Map<string, (typeof attendance)[0]>()
        for (const rec of attendance) {
          const prev = latestByUser.get(rec.user_id)
          if (!prev || new Date(rec.occurred_at) > new Date(prev.occurred_at)) {
            latestByUser.set(rec.user_id, rec)
          }
        }
        const inOffice = [...latestByUser.values()].filter((r) => r.type === 'check_in').length

        const userMap = new Map(users.map((u) => [u.id, u.full_name]))
        const sorted = [...attendance].sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        )
        const recentItems: RecentItem[] = sorted.slice(0, 5).map((a) => ({
          name: userMap.get(a.user_id) ?? a.user_id.slice(0, 8),
          action: a.type === 'check_in' ? 'Check In' : 'Check Out',
          time: new Date(a.occurred_at).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          isCheckIn: a.type === 'check_in',
        }))

        setRate(attendanceRate)
        setRecent(recentItems)

        // Fetch last 7 days trend
        const past7 = Array.from({ length: 7 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (6 - i))
          return d.toISOString().slice(0, 10)
        })
        const trendData = await Promise.all(
          past7.map(async (day) => {
            try {
              const r = await dailyReport(token, day)
              return { day, check_in: r.check_in, late: r.late }
            } catch {
              return { day, check_in: 0, late: 0 }
            }
          }),
        )
        if (!active) return
        setTrend(trendData)
        setStats([
          { label: 'Hadir', value: recap.check_in, Icon: CheckCircle2, fg: 'var(--color-brand)', bg: 'rgba(124,58,237,0.08)' },
          { label: 'Di Kantor', value: inOffice, Icon: UserCheck, fg: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
          { label: 'Terlambat', value: recap.late, Icon: AlertCircle, fg: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { label: 'Tidak Hadir', value: absent, Icon: XCircle, fg: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
        ])
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Gagal memuat data')
      }
    }
    void load()
    const interval = setInterval(() => { void load() }, 60_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [token])

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Absensi Hari Ini</h2>
          <p>Rekap kehadiran tenggat hari ini</p>
        </div>
        <span className="live-badge">
          <span className="live-dot" />
          LIVE
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {stats === null
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="stat-card">
                <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton skeleton-text" style={{ width: '40%', marginBottom: 6 }} />
                  <div className="skeleton skeleton-text sm" />
                </div>
              </div>
            ))
          : stats.map(({ label, value, Icon, fg, bg }) => (
              <div key={label} className="stat-card">
                <div className="stat-icon" style={{ background: bg }}>
                  <Icon size={22} color={fg} />
                </div>
                <div>
                  <div className="stat-value">{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
              </div>
            ))}
      </div>

      <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Tingkat Kehadiran</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-brand)' }}>{rate}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: rate + '%' }} />
        </div>
      </div>

      {trend.length > 0 && (
        <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
            Tren 7 Hari Terakhir
          </div>
          <TrendChart data={trend} />
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(124,58,237,0.18)' }} />
              Hadir
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(217,119,6,0.7)' }} />
              Terlambat
            </span>
          </div>
        </div>
      )}

      <div className="data-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
            Aktivitas Terbaru
          </h3>
        </div>

        {stats === null && [0, 1, 2].map((i) => (
          <div key={i} className="activity-row">
            <div className="skeleton skeleton-text" style={{ width: '40%' }} />
            <div className="skeleton skeleton-text" style={{ width: '20%' }} />
          </div>
        ))}

        {stats !== null && recent.length === 0 && (
          <div className="empty-state">Belum ada aktivitas hari ini</div>
        )}

        {recent.map((item, i) => (
          <div key={i} className="activity-row">
            <span className="activity-name">{item.name}</span>
            <div className="activity-meta">
              <span className={item.isCheckIn ? 'badge badge-green' : 'badge badge-gray'}>{item.action}</span>
              <span className="activity-time">{item.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
