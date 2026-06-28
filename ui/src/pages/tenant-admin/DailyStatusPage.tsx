import { useState } from 'react'
import { CheckCircle2, Clock, LogOut, UserX, Users, Search } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { DonutChart } from '@/components/charts/DonutChart'
import { useI18n } from '@/store/i18nStore'
import { useDailyStatus } from '@/hooks/useApiQueries'
import type { DailyStatusValue } from '@/api/adminApi'
import '@/styles/layout.css'

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const STATUS_META: Record<DailyStatusValue, { labelKey: string; cls: string; Icon: typeof CheckCircle2 }> = {
  present: { labelKey: 'daily_status.status_present', cls: 'badge-green', Icon: CheckCircle2 },
  late: { labelKey: 'daily_status.status_late', cls: 'badge-orange', Icon: Clock },
  checked_out: { labelKey: 'daily_status.status_checked_out', cls: 'badge-gray', Icon: LogOut },
  absent: { labelKey: 'daily_status.status_absent', cls: 'badge-red', Icon: UserX },
}

function StatusBadge({ status }: { status: DailyStatusValue }) {
  const { t } = useI18n()
  const { labelKey, cls, Icon } = STATUS_META[status]
  return (
    <span className={`badge ${cls}`}>
      <Icon size={13} />
      {t(labelKey)}
    </span>
  )
}

export function DailyStatusPage() {
  const { t } = useI18n()
  const [date, setDate] = useState(todayLocal())
  const [query, setQuery] = useState('')
  const { data, isLoading, error } = useDailyStatus(date)
  const rows = data ?? []

  const counts = {
    total: rows.length,
    present: rows.filter((r) => r.status === 'present').length,
    late: rows.filter((r) => r.status === 'late').length,
    checked_out: rows.filter((r) => r.status === 'checked_out').length,
    absent: rows.filter((r) => r.status === 'absent').length,
  }

  const filtered = query
    ? rows.filter(
        (r) =>
          r.full_name.toLowerCase().includes(query.toLowerCase()) ||
          (r.external_id ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : rows

  const stats = [
    { label: t('daily_status.stat_total'), value: counts.total, color: 'var(--color-brand)', icon: Users },
    { label: t('daily_status.stat_present'), value: counts.present, color: '#16a34a', icon: CheckCircle2 },
    { label: t('daily_status.stat_late'), value: counts.late, color: '#ca8a04', icon: Clock },
    { label: t('daily_status.stat_checked_out'), value: counts.checked_out, color: '#64748b', icon: LogOut },
    { label: t('daily_status.stat_absent'), value: counts.absent, color: '#dc2626', icon: UserX },
  ]

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">{t('daily_status.title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('daily_status.subtitle')}
          </p>
        </div>
      </div>

      <div
        className="stat-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {stats.map(({ label, value, color, icon: Icon }) => (
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

      {counts.total > 0 && (
        <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16 }}>
            {t('daily_status.detail_title')}
          </div>
          <DonutChart
            centerLabel={t('daily_status.stat_total')}
            centerValue={counts.total}
            data={[
              { label: t('daily_status.stat_present'), value: counts.present, color: '#16a34a' },
              { label: t('daily_status.stat_late'), value: counts.late, color: '#ca8a04' },
              { label: t('daily_status.stat_checked_out'), value: counts.checked_out, color: '#64748b' },
              { label: t('daily_status.stat_absent'), value: counts.absent, color: '#dc2626' },
            ]}
          />
        </div>
      )}

      <div className="filter-row">
        <div className="search-input-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
          <Search size={16} />
          <input
            className="search-input"
            type="text"
            placeholder={t('daily_status.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('daily_status.search_label')}
          />
        </div>
        <span className="filter-label" id="status-date-label">{t('daily_status.date_label')}:</span>
        <input
          type="date"
          className="date-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-labelledby="status-date-label"
        />
      </div>

      {error && <div className="error-banner">{error instanceof Error ? error.message : t('daily_status.load_error')}</div>}

      <div className="data-card responsive-table">
        <table className="data-table">
          <thead>
            <tr>
              {[t('daily_status.th_name'), t('daily_status.th_id'), t('daily_status.th_status'), t('daily_status.th_check_in'), t('daily_status.th_check_out')].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5}><div className="empty-state">{t('daily_status.loading')}</div></td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon="clipboard"
                    title={t('daily_status.empty')}
                    description={t('daily_status.empty_desc')}
                  />
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.user_id}>
                  <td style={{ fontWeight: 500 }}>{r.full_name}</td>
                  <td>{r.external_id ?? '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{formatTime(r.check_in_at)}</td>
                  <td>{formatTime(r.check_out_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="responsive-cards">
        {isLoading ? (
          <div className="empty-state">{t('daily_status.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="data-card">
            <EmptyState
              icon="clipboard"
              title={t('daily_status.empty')}
              description={t('daily_status.empty_desc')}
            />
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.user_id} className="record-card">
              <div className="record-card-top">
                <span className="record-card-name">{r.full_name}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="record-card-row">
                <span className="label">{t('daily_status.card_id')}</span>
                <span className="value">{r.external_id ?? '—'}</span>
              </div>
              <div className="record-card-row">
                <span className="label">{t('daily_status.card_check_in')}</span>
                <span className="value">{formatTime(r.check_in_at)}</span>
              </div>
              <div className="record-card-row">
                <span className="label">{t('daily_status.card_check_out')}</span>
                <span className="value">{formatTime(r.check_out_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
