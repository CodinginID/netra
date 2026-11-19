import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import {
  useBillingSummary,
  useDemoRequests,
  useTenants,
  useUsageByTenant,
  useUsers,
} from '@/hooks/useApiQueries'
import { useI18n } from '@/store/i18nStore'
import type { MoneyBucket } from '@/api/adminApi'
import {
  Chip,
  DayBars,
  PageHead,
  StatTile,
  Who,
  formatCurrency,
  formatNumber,
  lastDays,
  localDay,
  longToday,
  presentCount,
  useDailyReports,
  weekdayShort,
  type Tone,
} from './saShared'

function bucketText(bucket: MoneyBucket): string {
  return bucket.by_currency.map((row) => formatCurrency(row.total, row.currency)).join(' · ')
}

interface Alert {
  key: string
  tone: Tone
  title: string
  sub: string
  to: string
}

/** Things to follow up (overdue invoices, trials, new demo requests) — one tappable card. */
function AttentionCard() {
  const { t } = useI18n()
  const { data: billing } = useBillingSummary()
  const { data: demos } = useDemoRequests({ status: 'new', page: 1, limit: 1 })

  const alerts: Alert[] = []
  if (billing?.overdue.count) {
    alerts.push({
      key: 'overdue',
      tone: 'r',
      title: t('platform_home.alert_overdue', { count: billing.overdue.count }),
      sub: t('platform_home.alert_overdue_sub', { amount: bucketText(billing.overdue) || '-' }),
      to: '/admin/billing/summary',
    })
  }
  if (billing?.past_due_count) {
    alerts.push({
      key: 'past_due',
      tone: 'r',
      title: t('platform_home.alert_past_due', { count: billing.past_due_count }),
      sub: t('platform_home.alert_past_due_sub'),
      to: '/admin/billing/subscriptions',
    })
  }
  if (billing?.trials_ending) {
    alerts.push({
      key: 'trials',
      tone: 'w',
      title: t('platform_home.alert_trials', { count: billing.trials_ending }),
      sub: t('platform_home.alert_trials_sub'),
      to: '/admin/billing/subscriptions',
    })
  }
  if (demos?.total) {
    alerts.push({
      key: 'demo',
      tone: 'b',
      title: t('platform_home.alert_demo', { count: demos.total }),
      sub: t('platform_home.alert_demo_sub'),
      to: '/admin/demo-requests',
    })
  }

  return (
    <div className="sa-card sa-card-list">
      {alerts.length === 0 && <div className="sa-empty">{t('platform_home.all_clear')}</div>}
      {alerts.map((a) => (
        <Link key={a.key} to={a.to} className="sa-row">
          <span className={`sa-alert-bar sa-tone-${a.tone}`} aria-hidden="true" />
          <span className="sa-alert-text">
            <span className="sa-alert-title" style={{ display: 'block' }}>{a.title}</span>
            <span className="sa-alert-sub">{a.sub}</span>
          </span>
          <ChevronRight size={16} className="sa-row-chev" aria-hidden="true" />
        </Link>
      ))}
    </div>
  )
}

/**
 * Platform dashboard for super admins — mockup 84a94cb3.
 * Totals, 7-day attendance across every tenant, items needing attention, and
 * the newest tenants (each opens that tenant's view).
 */
export function SuperAdminHomePage() {
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const today = localDay()

  const { data: tenantsData } = useTenants({ limit: 1000 })
  const { data: usersData } = useUsers({ limit: 1 })
  const { data: usage } = useUsageByTenant()

  const days = useMemo(() => lastDays(7), [today]) // eslint-disable-line react-hooks/exhaustive-deps
  const reports = useDailyReports(days)
  const todayReport = reports[reports.length - 1]?.data

  const tenants = tenantsData?.items ?? []
  const activeTenants = tenants.filter((x) => x.status === 'active').length
  const totalUsers = usersData?.total ?? 0
  const presentToday = presentCount(todayReport)
  const presentPct = totalUsers > 0 ? Math.round((presentToday / totalUsers) * 100) : 0

  const counts = days.map((_, i) => reports[i]?.data?.check_in ?? 0)
  const bars = days.map((day, i) => ({
    key: day,
    label: weekdayShort(day, locale),
    value: counts[i],
    caption: reports[i]?.data ? formatNumber(counts[i]) : '–',
    today: day === today,
  }))

  const usageById = new Map((usage ?? []).map((u) => [u.tenant_id, u]))
  const newest = [...tenants]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return (
    <div className="sa-page">
      <PageHead
        title={t('platform_home.title')}
        sub={longToday(locale)}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate('/admin/tenants?new=1')}>
            <Plus size={16} /> {t('platform_home.new_tenant')}
          </button>
        }
      />

      <div className="sa-stats sa-stats--platform sa-order-2">
        <StatTile tone="b" label={t('stat.total_tenants')} value={formatNumber(tenantsData?.total ?? 0)} onClick={() => navigate('/admin/tenants')} />
        <StatTile tone="g" label={t('stat.active_tenants')} value={formatNumber(activeTenants)} onClick={() => navigate('/admin/tenants?status=active')} />
        <StatTile tone="b" label={t('stat.total_users')} value={formatNumber(totalUsers)} />
        <StatTile
          tone="g"
          label={t('stat.attendance_today')}
          value={formatNumber(presentToday)}
          sub={t('platform_home.pct_of_users', { pct: presentPct })}
        />
      </div>

      <div className="sa-dash-grid sa-order-1">
        <div className="sa-card sa-card-pad sa-only-desktop">
          <h3 className="sa-card-title">{t('platform_home.attendance_7_days')}</h3>
          <div className="sa-card-sub">{t('platform_home.all_tenants')}</div>
          <DayBars bars={bars} max={Math.max(...counts, 1)} ariaLabel={t('platform_home.attendance_7_days')} />
        </div>
        <div className="sa-dash-side">
          <h3 className="sa-card-title">{t('platform_home.needs_attention')}</h3>
          <AttentionCard />
        </div>
      </div>

      <div className="sa-dash-side">
        <div className="sa-card-head" style={{ marginBottom: 0 }}>
          <span className="sa-label">{t('platform_home.newest_tenants')}</span>
          <Link to="/admin/tenants" className="sa-link">{t('btn.manage_all')}</Link>
        </div>
        <div className="sa-card sa-card-list">
          {newest.length === 0 && <div className="sa-empty">{t('tenant.empty')}</div>}
          {newest.map((tn) => {
            const u = usageById.get(tn.id)
            const plan = u?.plan_name
            return (
              <button key={tn.id} type="button" className="sa-row" onClick={() => navigate(`/admin/tenants/${tn.id}`)}>
                <Who
                  name={tn.name}
                  sub={u ? t('platform_home.user_count', { count: formatNumber(u.active_users) }) : tn.slug}
                />
                {tn.status !== 'active' ? (
                  <Chip tone="m">{t('suspended')}</Chip>
                ) : plan ? (
                  <Chip tone="g">{plan}</Chip>
                ) : (
                  <Chip tone="w">{t('billing.usage.no_plan')}</Chip>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
