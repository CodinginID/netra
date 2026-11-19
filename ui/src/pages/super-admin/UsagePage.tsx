import { useMemo, useState } from 'react'
import { Search, TrendingDown, TrendingUp } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { useUsageByTenant } from '@/hooks/useApiQueries'
import { type TenantUsageRow } from '@/api/adminApi'
import { Chip, PageHead, formatNumber } from './saShared'
import { currentMonth } from './billingShared'

/** A snapshot older than this means collection has probably stopped. */
const STALE_AFTER_DAYS = 2

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysSince(iso: string): number {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return 0
  return Math.floor((Date.now() - d) / 86_400_000)
}

/**
 * Trend arrow. A null delta means there is no old enough snapshot to compare
 * against — rendered as a dash, not as "unchanged", because a brand-new tenant
 * has not been measured as flat; it has not been measured at all.
 */
function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="sa-muted">-</span>
  if (value === 0) return <span className="sa-muted">0</span>
  const up = value > 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`bl-delta ${up ? 'sa-tone-g' : 'sa-tone-r'}`}>
      <Icon size={14} />
      {up ? `+${value}` : value}
    </span>
  )
}

/** Active users against the plan tier cap; a plain number when there is no cap. */
function Meter({ row }: { row: TenantUsageRow }) {
  const max = row.tier_max_users
  if (!max) return <span className="bl-meter-text">{formatNumber(row.active_users)}</span>
  const pct = Math.min(100, Math.round((row.active_users / max) * 100))
  return (
    <div className={`bl-meter ${row.over_tier ? 'sa-tone-r' : 'sa-tone-b'}`}>
      <div className="bl-meter-track" aria-hidden="true">
        <div className="bl-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="bl-meter-text">{formatNumber(row.active_users)}/{formatNumber(max)}</span>
    </div>
  )
}

function Flag({ row }: { row: TenantUsageRow }) {
  const { t } = useI18n()
  if (row.over_tier) return <Chip tone="r">{t('billing.usage.over_tier', { max: row.tier_max_users ?? 0 })}</Chip>
  if (!row.plan_name) return <Chip tone="m">{t('billing.usage.no_plan')}</Chip>
  return null
}

/** Billing → Pemakaian (mockup dd07def6). */
export function UsagePage() {
  const { t, locale } = useI18n()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useUsageByTenant()

  // Memoised: `data ?? []` inline would build a new array every render and
  // defeat the useMemo below.
  const rows = useMemo(() => data ?? [], [data])
  const filtered = useMemo(
    () =>
      rows.filter((r: TenantUsageRow) =>
        r.tenant_name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [rows, search],
  )

  // Two empty states that look identical but mean opposite things: nothing has
  // ever been collected, versus collection has stopped. Showing one message for
  // both would let a dead job read as "no activity".
  const newestSnapshot = rows.length
    ? Math.min(...rows.map((r) => daysSince(r.snapshot_date)))
    : null
  const isStale = newestSnapshot !== null && newestSnapshot > STALE_AFTER_DAYS

  const latest = rows.length
    ? rows.reduce((newest, r) => (daysSince(r.snapshot_date) < daysSince(newest.snapshot_date) ? r : newest))
    : null

  const message = (text: string) => <div className="sa-empty">{text}</div>
  const emptyBody = isLoading ? null : !rows.length ? message(t('billing.usage.never_collected'))
    : !filtered.length ? message(t('billing.usage.no_match')) : null

  return (
    <div className="sa-page">
      <PageHead
        title={t('billing.usage.title')}
        sub={latest ? `${currentMonth(locale)} · ${t('usage.snapshot_date')}: ${formatDate(latest.snapshot_date)}` : t('billing.usage.desc')}
        actions={
          <label className="sa-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tenants.search_placeholder')}
              aria-label={t('tenants.search_placeholder')}
            />
          </label>
        }
      />

      {isStale && latest && (
        <div className="sa-card sa-card-pad" role="status">
          <Chip tone="w">{t('billing.usage.stale_badge')}</Chip>
          <span className="sa-muted" style={{ marginLeft: 10, fontSize: 13 }}>
            {t('billing.usage.stale_desc', { days: newestSnapshot as number, date: formatDate(latest.snapshot_date) })}
          </span>
        </div>
      )}

      <div className="sa-card sa-table-card bl-table">
        <table className="sa-table">
          <thead>
            <tr>
              <th>{t('billing.usage.tenant')}</th>
              <th>{t('billing.usage.plan')}</th>
              <th>{t('usage.active_users')}</th>
              <th>{t('billing.usage.trend_7d')}</th>
              <th>{t('usage.devices')}</th>
              <th>{t('usage.punches')}</th>
              <th><span className="sa-sr-only">{t('subscription.status')}</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7}><div className="skeleton skeleton-text sm" /></td></tr>
            )}
            {emptyBody && <tr><td colSpan={7}>{emptyBody}</td></tr>}
            {filtered.map((r) => (
              <tr key={r.tenant_id}>
                <td style={{ fontWeight: 600 }}>{r.tenant_name}</td>
                <td className="sa-muted">{r.plan_name ?? '—'}</td>
                <td><Meter row={r} /></td>
                <td><Delta value={r.active_users_delta_7d} /></td>
                <td className="sa-num">{formatNumber(r.devices)}</td>
                <td className="sa-num">{formatNumber(r.punches)}</td>
                <td className="sa-right"><Flag row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bl-cards">
        {emptyBody && <div className="sa-card">{emptyBody}</div>}
        {filtered.map((r) => (
          <div key={r.tenant_id} className="sa-card bl-card">
            <div className="bl-card-top">
              <span className="sa-who-name">{r.tenant_name}</span>
              <Flag row={r} />
            </div>
            <Meter row={r} />
            <div className="bl-card-meta">
              <span>{r.plan_name ?? t('billing.usage.no_plan')}</span>
              <span>{t('billing.usage.trend_7d')}: <Delta value={r.active_users_delta_7d} /></span>
              <span>{t('usage.devices')}: {formatNumber(r.devices)}</span>
              <span>{t('usage.punches')}: {formatNumber(r.punches)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
