import { useMemo, useState } from 'react'
import { Search, TrendingDown, TrendingUp } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { useUsageByTenant } from '@/hooks/useApiQueries'
import { type TenantUsageRow } from '@/api/adminApi'
import { BillingTabs } from './BillingTabs'
import '@/styles/layout.css'

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
  if (value === null) return <span style={{ color: 'var(--color-text-secondary)' }}>-</span>
  if (value === 0) return <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
  const up = value > 0
  const Icon = up ? TrendingUp : TrendingDown
  const color = up ? '#16a34a' : '#dc2626'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color }}>
      <Icon size={14} />
      {up ? `+${value}` : value}
    </span>
  )
}

export function UsagePage() {
  const { t } = useI18n()
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

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">{t('billing.usage.title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('billing.usage.desc')}
          </p>
        </div>
      </div>

      <BillingTabs />

      {isStale && (
        <div className="data-card" style={{ padding: 16, marginBottom: 16 }}>
          <span className="badge badge-orange">{t('billing.usage.stale_badge')}</span>
          <span style={{ marginLeft: 10, color: 'var(--color-text-secondary)' }}>
            {t('billing.usage.stale_desc', {
              days: newestSnapshot as number,
              date: formatDate(
                rows.reduce((newest, r) =>
                  daysSince(r.snapshot_date) < daysSince(newest.snapshot_date) ? r : newest,
                ).snapshot_date,
              ),
            })}
          </span>
        </div>
      )}

      <div className="filter-row">
        <div className="search-input-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
          <Search size={16} />
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
          />
        </div>
      </div>

      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('billing.usage.tenant')}</th>
              <th>{t('usage.snapshot_date')}</th>
              <th>{t('usage.active_users')}</th>
              <th>{t('billing.usage.trend_7d')}</th>
              <th>{t('usage.devices')}</th>
              <th>{t('usage.punches')}</th>
              <th>{t('billing.usage.plan')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              [0, 1, 2].map((i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={7}>
                    <div className="skeleton skeleton-text sm" />
                  </td>
                </tr>
              ))}

            {!isLoading && !rows.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('billing.usage.never_collected')}</div>
                </td>
              </tr>
            )}

            {!isLoading && rows.length > 0 && !filtered.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('billing.usage.no_match')}</div>
                </td>
              </tr>
            )}

            {filtered.map((r) => (
              <tr key={r.tenant_id}>
                <td>{r.tenant_name}</td>
                <td>{formatDate(r.snapshot_date)}</td>
                <td>
                  {r.active_users}
                  {r.over_tier && (
                    <span className="badge badge-red" style={{ marginLeft: 8 }}>
                      {t('billing.usage.over_tier', { max: r.tier_max_users ?? 0 })}
                    </span>
                  )}
                </td>
                <td>
                  <Delta value={r.active_users_delta_7d} />
                </td>
                <td>{r.devices}</td>
                <td>{r.punches}</td>
                <td>{r.plan_name ?? <span className="badge badge-gray">{t('billing.usage.no_plan')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
