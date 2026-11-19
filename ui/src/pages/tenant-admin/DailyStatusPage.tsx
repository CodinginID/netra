import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useI18n } from '@/store/i18nStore'
import { useDailyStatus } from '@/hooks/useApiQueries'
import type { DailyStatus, DailyStatusValue } from '@/api/adminApi'
import {
  Chip, DateButton, PageHead, Pills, SearchBox, StatCard, StatRow, Who,
  downloadCsv, localeTag, type Tone,
} from './PeopleUi'
import '@/styles/layout.css'

type Filter = 'all' | DailyStatusValue

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA')
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDate(ymd: string, tag: string, long: boolean): string {
  const d = new Date(`${ymd}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ymd
  return long
    ? d.toLocaleDateString(tag, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    : d.toLocaleDateString(tag, { day: 'numeric', month: 'short' })
}

const STATUS_META: Record<DailyStatusValue, { labelKey: string; tone: Tone }> = {
  present: { labelKey: 'daily_status.status_present', tone: 'g' },
  late: { labelKey: 'daily_status.status_late', tone: 'w' },
  checked_out: { labelKey: 'daily_status.status_checked_out', tone: 'b' },
  absent: { labelKey: 'daily_status.status_absent', tone: 'r' },
}

const ORDER: DailyStatusValue[] = ['present', 'late', 'checked_out', 'absent']

function StatusChip({ status }: { status: DailyStatusValue }) {
  const { t } = useI18n()
  const { labelKey, tone } = STATUS_META[status]
  return <Chip tone={tone}>{t(labelKey)}</Chip>
}

export function DailyStatusPage() {
  const { t, locale } = useI18n()
  const tag = localeTag(locale)
  const [date, setDate] = useState(todayLocal())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading, error } = useDailyStatus(date)
  const rows = useMemo(() => data ?? [], [data])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, present: 0, late: 0, checked_out: 0, absent: 0 }
    rows.forEach((r) => { c[r.status] += 1 })
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) =>
      (filter === 'all' || r.status === filter) &&
      (!q || r.full_name.toLowerCase().includes(q) || (r.external_id ?? '').toLowerCase().includes(q)),
    )
  }, [rows, filter, query])

  const statLabel = (k: Filter) => (k === 'all' ? t('daily_status.stat_total') : t(`daily_status.stat_${k}`))
  const pillItems = [
    { key: 'all' as Filter, label: t('daily_status.filter_all'), count: counts.all },
    { key: 'absent' as Filter, label: t('daily_status.stat_absent'), count: counts.absent },
    { key: 'late' as Filter, label: t('daily_status.stat_late'), count: counts.late },
    { key: 'present' as Filter, label: t('daily_status.stat_present'), count: counts.present },
    { key: 'checked_out' as Filter, label: t('daily_status.stat_checked_out'), count: counts.checked_out },
  ]

  function handleExport() {
    downloadCsv(
      `daily_status_${date}.csv`,
      [t('daily_status.th_name'), t('daily_status.th_id'), t('daily_status.th_status'), t('daily_status.th_check_in'), t('daily_status.th_check_out')],
      filtered.map((r) => [r.full_name, r.external_id ?? '', t(STATUS_META[r.status].labelKey), formatTime(r.check_in_at), formatTime(r.check_out_at)]),
    )
  }

  const phoneSub = (r: DailyStatus) => {
    const id = r.external_id ?? '—'
    return r.check_in_at
      ? `${id} · ${t('daily_status.sub_in', { time: formatTime(r.check_in_at) })}`
      : `${id} · ${t('daily_status.sub_not_in')}`
  }

  const empty = (
    <EmptyState icon="clipboard" title={t('daily_status.empty')} description={t('daily_status.empty_desc')} />
  )

  return (
    <div className="tp-page">
      <PageHead
        title={t('daily_status.title')}
        subtitle={<span className="tp-desktop-only">{t('daily_status.subtitle')}</span>}
        actions={
          <>
            <span className="tp-desktop-only">
              <DateButton value={date} onChange={setDate} label={t('daily_status.date_label')} text={formatDate(date, tag, true)} />
            </span>
            <span className="tp-phone-only">
              <DateButton small value={date} onChange={setDate} label={t('daily_status.date_label')} text={formatDate(date, tag, false)} />
            </span>
            <button
              type="button"
              className="btn btn-primary tp-desktop-only"
              onClick={handleExport}
              disabled={isLoading || filtered.length === 0}
            >
              <Download size={15} /> {t('daily_status.export')}
            </button>
          </>
        }
      />

      <div className="tp-desktop-only">
        {isLoading ? (
          <StatRow skeleton={5} />
        ) : (
          <StatRow>
            {(['all', ...ORDER] as Filter[]).map((k) => (
              <StatCard
                key={k}
                label={statLabel(k)}
                value={counts[k]}
                tone={k === 'all' ? 'm' : STATUS_META[k].tone}
                active={filter === k}
                onClick={() => setFilter(k)}
              />
            ))}
          </StatRow>
        )}
      </div>

      <div className="tp-toolbar">
        <Pills items={pillItems} value={filter} onChange={setFilter} label={t('daily_status.filter_label')} />
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={t('daily_status.search_placeholder')}
          label={t('daily_status.search_label')}
        />
      </div>

      {error && <div className="error-banner">{error instanceof Error ? error.message : t('daily_status.load_error')}</div>}

      {/* Desktop table */}
      <div className="tp-card tp-desktop-only">
        <table className="tp-table">
          <thead>
            <tr>
              <th style={{ width: '44%' }}>{t('daily_status.th_name')}</th>
              <th>{t('daily_status.th_status')}</th>
              <th>{t('daily_status.th_check_in')}</th>
              <th>{t('daily_status.th_check_out')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td><div className="skeleton skeleton-text" style={{ width: '55%' }} /></td>
                  <td><div className="skeleton skeleton-badge" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4}>{empty}</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.user_id}>
                  <td><Who name={r.full_name} sub={r.external_id ?? undefined} /></td>
                  <td><StatusChip status={r.status} /></td>
                  <td className="tp-time">{formatTime(r.check_in_at)}</td>
                  <td className="tp-time">{formatTime(r.check_out_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phone list */}
      <div className="tp-phone-only">
        {isLoading ? (
          <div className="empty-state">{t('daily_status.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="tp-card">{empty}</div>
        ) : (
          <div className="tp-card tp-list">
            {filtered.map((r) => (
              <div key={r.user_id} className="tp-list-row">
                <Who name={r.full_name} sub={phoneSub(r)} />
                <StatusChip status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {!isLoading && rows.length > 0 && (
        <div className="tp-foot">
          {filter === 'all' && !query
            ? t('daily_status.showing_all', { count: filtered.length })
            : t('daily_status.showing', { count: filtered.length, total: rows.length })}
        </div>
      )}
    </div>
  )
}
