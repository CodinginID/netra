import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Download, ListChecks } from 'lucide-react'
import { exportAttendanceUrl, listTenants, type AttendanceOut } from '@/api/adminApi'
import { queryKeys, useAttendance, useDailyStatus, useOnboardingStatus } from '@/hooks/useApiQueries'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/store/i18nStore'
import { useToast } from '@/components/Toast'
import { EmptyState } from '@/components/EmptyState'
import { OnboardingBanner } from '@/components/OnboardingBanner'
import { OnboardingWizard } from '@/components/OnboardingWizard'
import {
  Avatar,
  Chip,
  DayBars,
  StatTile,
  Who,
  lastDays,
  localDay,
  longToday,
  presentCount,
  useDailyReports,
  weekdayShort,
  type Tone,
} from './saShared'

function greetingKey(): string {
  const h = new Date().getHours()
  if (h < 11) return 'tenant_home.greeting_morning'
  if (h < 15) return 'tenant_home.greeting_afternoon'
  if (h < 18) return 'tenant_home.greeting_evening'
  return 'tenant_home.greeting_night'
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0
}

/** Tenant name for the super-admin view. Tenant admins cannot list tenants, so it is never asked. */
function useTenantName(tenantId: string | undefined) {
  const token = useAuthStore((s) => s.accessToken)
  const params = { limit: 1000 }
  const q = useQuery({
    queryKey: queryKeys.tenants(params),
    queryFn: () => listTenants(token!, params),
    enabled: !!token && !!tenantId,
  })
  const tenant = q.data?.items.find((x) => x.id === tenantId)
  return { tenant, notFound: !!tenantId && q.isSuccess && !tenant }
}

/**
 * Tenant home ("Beranda") — mockup fcb75537. Shown to tenant admins at
 * /tenant/dashboard and to super admins at /admin/tenants/:tenantId.
 * Every query here is pinned to the tenant in the URL (or the JWT) via
 * `useTenantScope`, so a super admin always sees the tenant they opened.
 */
export function TenantAdminHomePage() {
  const navigate = useNavigate()
  const { tenantId } = useParams<{ tenantId: string }>()
  const { t, locale } = useI18n()
  const { show } = useToast()
  const token = useAuthStore((s) => s.accessToken)
  const username = useAuthStore((s) => s.username)
  const today = localDay()
  const base = tenantId ? `/admin/tenants/${tenantId}` : '/tenant'

  const { tenant, notFound } = useTenantName(tenantId)
  const { data: roster, isLoading: rosterLoading } = useDailyStatus(today)
  const { data: attendanceData, isLoading: attLoading } = useAttendance({ page: 1, limit: 100, from: today, to: today })
  const { data: onboarding } = useOnboardingStatus()

  const days = useMemo(() => lastDays(7), [today]) // eslint-disable-line react-hooks/exhaustive-deps
  const reports = useDailyReports(days)
  const todayReport = reports[reports.length - 1]?.data

  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const showBanner = !!onboarding && !onboarding.completed && !bannerDismissed

  // Today's roster: one row per active person.
  const people = roster ?? []
  const total = people.length
  const absent = people.filter((p) => p.status === 'absent').length
  const present = total - absent
  // `checked_out` hides whether the arrival was late, so lateness comes from the recap.
  const lateIds = new Set((todayReport?.users ?? []).filter((u) => u.late > 0).map((u) => u.user_id))
  const late = people.filter((p) => p.status === 'late' || (p.status === 'checked_out' && lateIds.has(p.user_id))).length
  const onTime = Math.max(present - late, 0)
  const rate = pct(present, total)

  const names = new Map(people.map((p) => [p.user_id, p.full_name]))
  const feed = [...(attendanceData?.items ?? [])]
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 4)

  const bars = days.map((day, i) => {
    const value = pct(presentCount(reports[i]?.data), total)
    return {
      key: day,
      label: weekdayShort(day, locale),
      value,
      caption: reports[i]?.data ? `${value}%` : '–',
      today: day === today,
    }
  })

  const openStatus = (filter?: string) => navigate(`${base}/status${filter ? `?filter=${filter}` : ''}`)

  const handleExport = async () => {
    if (!token) return
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
      if (tenantId) headers['X-Tenant-Id'] = tenantId
      const res = await fetch(exportAttendanceUrl(today, today, 'csv'), { headers })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `attendance_${today}_${today}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      show(err instanceof Error ? err.message : t('tenant_home.export_failed'), 'error')
    }
  }

  if (notFound) {
    return (
      <div className="sa-card">
        <EmptyState icon="inbox" title={t('tenant.error_not_found')} description={t('tenant_home.not_found_desc')} />
      </div>
    )
  }

  const greeting = t(greetingKey(), { name: username ?? '' }).replace(/,\s*$/, '')
  const loading = rosterLoading
  const dash = (n: number) => (loading ? '–' : n)

  const feedRow = (a: AttendanceOut) => {
    const name = names.get(a.user_id) ?? a.user_id.slice(0, 8)
    const time = new Date(a.occurred_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    const action = a.type === 'check_in' ? t('tenant_home.feed_in') : t('tenant_home.feed_out')
    const tone: Tone = a.status === 'on_time' ? 'g' : 'w'
    return (
      <div key={a.id} className="sa-row">
        <Who name={name} sub={`${action} ${time}`} />
        <Chip tone={tone}>
          <span className="th-long">{t(`tenant_home.status_${a.status}`)}</span>
          <span className="th-short">{t(`tenant_home.status_${a.status}_short`)}</span>
        </Chip>
      </div>
    )
  }

  return (
    <div className="sa-page">
      {showBanner && (
        <OnboardingBanner onOpenWizard={() => setShowWizard(true)} onDismiss={() => setBannerDismissed(true)} />
      )}
      {showWizard && (
        <OnboardingWizard
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false)
            setBannerDismissed(true)
          }}
        />
      )}

      {/* Desktop head */}
      <div className="sa-head th-desktop-head">
        <div>
          <h2>{greeting}</h2>
          <div className="sa-head-sub">{tenant ? `${tenant.name} · ` : ''}{longToday(locale)}</div>
        </div>
        <div className="sa-head-actions">
          <button type="button" className="btn btn-ghost" onClick={() => openStatus()}>
            <ListChecks size={16} /> {t('tenant_home.view_daily_status')}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleExport}>
            <Download size={16} /> {t('tenant_home.export_today')}
          </button>
        </div>
      </div>

      {/* Phone head */}
      <div className="th-mhead">
        <div style={{ minWidth: 0 }}>
          <div className="th-mhead-greet">{greeting}</div>
          <div className="th-mhead-title">{tenant?.name ?? longToday(locale)}</div>
        </div>
        <Avatar name={tenant?.name ?? username ?? 'N'} />
      </div>

      <div className="th-top">
        <div className="sa-card th-hero" role="region" aria-label={t('tenant_home.today_attendance')} aria-live="polite">
          <div className="th-hero-top">
            <span>{t('tenant_home.today_attendance')}</span>
            <span className="th-live">{t('dashboard.live')}</span>
          </div>
          <div className="th-hero-value">{loading ? '–' : `${rate}%`}</div>
          <div className="th-hero-sub">{t('tenant_home.present_of_total', { present, total })}</div>
          <div className="th-track" aria-hidden="true">
            <div className="th-fill" style={{ width: `${rate}%` }} />
          </div>
        </div>
        <div className="th-stats">
          <StatTile
            tone="g"
            label={<><span className="th-long">{t('tenant_home.on_time')}</span><span className="th-short">{t('tenant_home.on_time_short')}</span></>}
            value={dash(onTime)}
            sub={<span className="th-long">{t('tenant_home.pct_of_total', { pct: pct(onTime, total) })}</span>}
            onClick={() => openStatus('present')}
          />
          <StatTile
            tone="w"
            label={<><span className="th-long">{t('tenant_home.late')}</span><span className="th-short">{t('tenant_home.late_short')}</span></>}
            value={dash(late)}
            sub={<span className="th-long">{t('tenant_home.pct_of_total', { pct: pct(late, total) })}</span>}
            onClick={() => openStatus('late')}
          />
          <StatTile
            tone="r"
            label={<><span className="th-long">{t('tenant_home.not_present')}</span><span className="th-short">{t('tenant_home.not_present_short')}</span></>}
            value={dash(absent)}
            sub={<span className="th-long">{t('tenant_home.see_who')}</span>}
            onClick={() => openStatus('absent')}
          />
        </div>
      </div>

      <div className="th-main">
        <div className="sa-card sa-card-pad">
          <div className="sa-card-head">
            <h3 className="sa-card-title">{t('tenant_home.trend_7_days')}</h3>
            <span className="sa-card-sub">{t('tenant_home.pct_present')}</span>
          </div>
          <DayBars bars={bars} max={100} ariaLabel={t('tenant_home.trend_7_days')} />
        </div>

        <div className="sa-card sa-card-pad th-feed" aria-live="polite">
          <div className="sa-card-head">
            <h3 className="sa-card-title">{t('tenant_home.recent_checkins')}</h3>
            <button type="button" className="sa-link" onClick={() => navigate(`${base}/attendance`)}>
              {t('tenant_home.see_all')} <ChevronRight size={12} style={{ verticalAlign: 'middle' }} />
            </button>
          </div>
          {attLoading && [0, 1, 2].map((i) => (
            <div key={i} className="sa-row">
              <div className="skeleton skeleton-text" style={{ width: '50%' }} />
            </div>
          ))}
          {!attLoading && feed.length === 0 && (
            <div className="sa-empty" style={{ borderTop: '1px solid var(--color-border)' }}>
              {t('dashboard.no_activity_today')}
            </div>
          )}
          {feed.map(feedRow)}
        </div>
      </div>
    </div>
  )
}
