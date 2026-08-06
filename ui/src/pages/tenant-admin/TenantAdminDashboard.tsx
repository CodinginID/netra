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
  KeyRound,
  Trash2,
} from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { dailyReport } from '@/api/adminApi'
import { useAttendance, useDailyReport, useUsers, useOnboardingStatus } from '@/hooks/useApiQueries'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/store/i18nStore'
import { OnboardingWizard } from '@/components/OnboardingWizard'
import { OnboardingBanner } from '@/components/OnboardingBanner'
import { Sparkline } from '@/components/charts/Sparkline'
import { AttendanceHeatmap } from '@/components/charts/AttendanceHeatmap'
import { StepProgress } from '@/components/charts/StepProgress'

export function TenantAdminDashboard() {
  const { t } = useI18n()
  const navItems = [
    { label: t('users.title'), to: '/tenant/users', icon: Users },
    { label: t('enrollment.title'), to: '/tenant/enrollment', icon: ScanFace },
    { label: t('devices.title'), to: '/tenant/devices', icon: Monitor },
    { label: t('schedules.title'), to: '/tenant/schedules', icon: CalendarDays },
    { label: t('attendance.title'), to: '/tenant/attendance', icon: ClipboardList },
    { label: t('daily_status.title'), to: '/tenant/status', icon: UserCheck },
    { label: t('integration.title'), to: '/tenant/integration', icon: KeyRound },
    { label: t('trash.title'), to: '/tenant/trash', icon: Trash2 },
  ]
  return (
    <DashboardLayout title={t('tenant_admin.title')} navItems={navItems}>
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
  spark?: number[]
}

const ONBOARDING_STEP_KEYS = ['step_welcome', 'step_schedule', 'step_device', 'step_users', 'step_test'] as const

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
            <rect x={x} y={H - barH} width={BAR_W} height={barH} rx={4} fill="rgba(13,148,136,0.18)" />
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

function TrendBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>—</span>
  }
  const rounded = Math.round(Math.abs(delta))
  if (rounded === 0) {
    return <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>— 0%</span>
  }
  const up = delta > 0
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: up ? '#16a34a' : '#d97706' }}>
      {up ? '↑' : '↓'} {rounded}%
    </span>
  )
}

export function TenantAdminHomePage() {
  const { t } = useI18n()
  const token = useAuthStore((s) => s.accessToken)
  const [showWizard, setShowWizard] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const today = todayString()

  // React Query hooks
  const { data: attendanceData, isLoading: attLoading } = useAttendance({
    page: 1, limit: 100, from: today, to: today,
  })
  const { data: reportData } = useDailyReport(today)
  const { data: usersData } = useUsers({ page: 1, limit: 1000 })
  const { data: onboardingData } = useOnboardingStatus()

  const attendance = attendanceData?.items ?? []
  const report = reportData
  const users = usersData?.items ?? []

  // Onboarding banner
  useEffect(() => {
    if (onboardingData && !onboardingData.completed) {
      setShowBanner(true)
    }
  }, [onboardingData])

  // 7-day trend (kept as useEffect — 7 separate API calls)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [trendDelta, setTrendDelta] = useState<{ hadir: number | null; terlambat: number | null }>({
    hadir: null,
    terlambat: null,
  })

  useEffect(() => {
    if (!token) return
    let active = true
    const past7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return d.toISOString().slice(0, 10)
    })
    Promise.all(
      past7.map(async (day) => {
        try {
          const r = await dailyReport(token, day)
          return { day, check_in: r.check_in, late: r.late }
        } catch {
          return { day, check_in: 0, late: 0 }
        }
      }),
    ).then((data) => {
      if (!active) return
      setTrend(data)
      if (data.length >= 2) {
        const last = data[data.length - 1]
        const prev = data[data.length - 2]
        setTrendDelta({
          hadir: ((last.check_in - prev.check_in) / Math.max(prev.check_in, 1)) * 100,
          terlambat: ((last.late - prev.late) / Math.max(prev.late, 1)) * 100,
        })
      }
    })
    return () => { active = false }
  }, [token])

  // Derived stats from query data
  const enrolled = users.filter((u) => u.enrolled).length
  const absent = Math.max(enrolled - (report?.check_in ?? 0), 0)
  const rate = enrolled > 0 ? Math.round(((report?.check_in ?? 0) / enrolled) * 100) : 0

  const latestByUser = new Map<string, typeof attendance[0]>()
  for (const rec of attendance) {
    const prev = latestByUser.get(rec.user_id)
    if (!prev || new Date(rec.occurred_at) > new Date(prev.occurred_at)) {
      latestByUser.set(rec.user_id, rec)
    }
  }
  const inOfficeCount = [...latestByUser.values()].filter((r) => r.type === 'check_in').length

  const userMap = new Map(users.map((u) => [u.id, u.full_name]))
  const sorted = [...attendance].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  )
  const recent: RecentItem[] = sorted.slice(0, 5).map((a) => ({
    name: userMap.get(a.user_id) ?? a.user_id.slice(0, 8),
    action: a.type === 'check_in' ? t('dashboard.action_check_in') : t('dashboard.action_check_out'),
    time: new Date(a.occurred_at).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    isCheckIn: a.type === 'check_in',
  }))

  // 7-day series for sparklines / heatmap, derived from the trend data.
  const checkInSeries = trend.map((t) => t.check_in)
  const lateSeries = trend.map((t) => t.late)
  const heatmapData = trend.map((t) => ({ date: t.day, count: t.check_in }))

  const onboardingSteps = ONBOARDING_STEP_KEYS.map((key) => {
    const stepKey = key.replace('step_', '') as keyof NonNullable<typeof onboardingData>['steps']
    return {
      label: t(`onboarding.${key}`),
      done: onboardingData?.steps?.[stepKey] ?? false,
    }
  })
  const showOnboardingSteps = !!onboardingData && !onboardingData.completed

  const stats: StatCard[] = [
    { label: t('dashboard.stat_present'), value: report?.check_in ?? 0, Icon: CheckCircle2, fg: 'var(--color-brand)', bg: 'rgba(13,148,136,0.08)', spark: checkInSeries },
    { label: t('dashboard.stat_in_office'), value: inOfficeCount, Icon: UserCheck, fg: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
    { label: t('dashboard.stat_late'), value: report?.late ?? 0, Icon: AlertCircle, fg: '#d97706', bg: 'rgba(217,119,6,0.08)', spark: lateSeries },
    { label: t('dashboard.stat_absent'), value: absent, Icon: XCircle, fg: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  ]

  return (
    <div>
      {showBanner && (
        <OnboardingBanner
          onOpenWizard={() => setShowWizard(true)}
          onDismiss={() => setShowBanner(false)}
        />
      )}
      {showWizard && (
        <OnboardingWizard
          onClose={() => setShowWizard(false)}
          onComplete={() => { setShowWizard(false); setShowBanner(false) }}
        />
      )}

      {showOnboardingSteps && (
        <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 18 }}>
            {t('dashboard.setup_progress')}
          </div>
          <StepProgress steps={onboardingSteps} />
        </div>
      )}

      <div className="page-header">
        <div>
          <h2>{t('dashboard.today_attendance')}</h2>
          <p>{t('dashboard.today_subtitle')}</p>
        </div>
        <span className="live-badge">
          <span className="live-dot" />
          {t('dashboard.live')}
        </span>
      </div>

      <div
        role="region"
        aria-label="Statistik kehadiran hari ini"
        aria-live="polite"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {attLoading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="stat-card">
                <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton skeleton-text" style={{ width: '40%', marginBottom: 6 }} />
                  <div className="skeleton skeleton-text sm" />
                </div>
              </div>
            ))
          : stats.map(({ label, value, Icon, fg, bg, spark }) => (
              <div key={label} className="stat-card">
                <div className="stat-icon" style={{ background: bg }}>
                  <Icon size={22} color={fg} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="stat-value">{value}</div>
                  {label === t('dashboard.stat_present') && (
                    <div style={{ marginTop: 2 }}>
                      <TrendBadge delta={trendDelta.hadir} />
                    </div>
                  )}
                  {label === t('dashboard.stat_late') && (
                    <div style={{ marginTop: 2 }}>
                      <TrendBadge delta={trendDelta.terlambat} />
                    </div>
                  )}
                  <div className="stat-label">{label}</div>
                  {spark && spark.length > 1 && (
                    <div style={{ marginTop: 8 }}>
                      <Sparkline data={spark} color={fg} width={120} height={24} />
                    </div>
                  )}
                </div>
              </div>
            ))}
      </div>

      <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{t('dashboard.attendance_rate')}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-brand)' }}>{rate}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: rate + '%' }} />
        </div>
      </div>

      {trend.length > 0 && (
        <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
            {t('dashboard.trend_7_days')}
          </div>
          <TrendChart data={trend} />
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(13,148,136,0.18)' }} />
              {t('dashboard.trend_present')}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(217,119,6,0.7)' }} />
              {t('dashboard.trend_late')}
            </span>
          </div>
        </div>
      )}

      {heatmapData.length > 0 && (
        <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ marginBottom: 16, fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
            {t('dashboard.pattern_this_month')}
          </div>
          <AttendanceHeatmap data={heatmapData} />
        </div>
      )}

      <div className="data-card" aria-live="polite">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
            {t('dashboard.recent_activity')}
          </h3>
        </div>

        {attLoading && [0, 1, 2].map((i) => (
          <div key={i} className="activity-row">
            <div className="skeleton skeleton-text" style={{ width: '40%' }} />
            <div className="skeleton skeleton-text" style={{ width: '20%' }} />
          </div>
        ))}

        {!attLoading && recent.length === 0 && (
          <div className="empty-state">{t('dashboard.no_activity_today')}</div>
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
