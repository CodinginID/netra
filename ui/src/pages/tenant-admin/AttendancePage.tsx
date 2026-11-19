import '@/styles/layout.css'
import { useMemo, useState } from 'react'
import { Download, MapPin } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { exportAttendanceUrl, type AttendanceOut, type AttendanceLocation } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { useAttendance, useDevices, useUsers } from '@/hooks/useApiQueries'
import {
  Chip, DateButton, PageHead, Pills, SearchBox, StatCard, StatRow, Who, localeTag, type Tone,
} from './PeopleUi'

type TypeFilter = 'all' | 'check_in' | 'check_out' | 'outside'

const STATUS_META: Record<AttendanceOut['status'], { key: string; tone: Tone }> = {
  on_time: { key: 'attendance.status_on_time', tone: 'g' },
  late: { key: 'attendance.status_late', tone: 'w' },
  early_leave: { key: 'attendance.status_early_leave', tone: 'w' },
}

function today(): string {
  return new Date().toLocaleDateString('en-CA')
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA')
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function isOutside(loc: AttendanceLocation | null): boolean {
  return !!loc?.outside_geofence
}

function MapLink({ location, iconOnly }: { location: AttendanceLocation | null; iconOnly?: boolean }) {
  const { t } = useI18n()
  if (!location || location.lat == null || location.lng == null) return null
  return (
    <a
      className="tp-link"
      href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
      target="_blank"
      rel="noreferrer"
      title={`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}
      aria-label={iconOnly ? t('attendance.location_map') : undefined}
    >
      <MapPin size={13} aria-hidden="true" />
      {!iconOnly && t('attendance.location_map')}
    </a>
  )
}

export function AttendancePage() {
  const { t, locale } = useI18n()
  const tag = localeTag(locale)
  const { show } = useToast()
  const token = useAuthStore((s) => s.accessToken)

  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(today())
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const { data: paginatedAttendance, isLoading, error } = useAttendance({ page, limit, from: fromDate, to: toDate })
  const rows = useMemo(() => paginatedAttendance?.items ?? [], [paginatedAttendance])
  const total = paginatedAttendance?.total ?? 0
  const pages = paginatedAttendance?.pages ?? 0

  const { data: usersData } = useUsers({ limit: 1000 })
  const userMap = useMemo(
    () => new Map<string, string>((usersData?.items ?? []).map((u) => [u.id, u.full_name ?? u.username ?? u.id.slice(0, 8)])),
    [usersData],
  )
  const { data: devicesData } = useDevices({ limit: 1000 })
  const deviceMap = useMemo(
    () => new Map<string, string>((devicesData?.items ?? []).map((d) => [d.id, d.name])),
    [devicesData],
  )
  const nameOf = (r: AttendanceOut) => userMap.get(r.user_id) ?? r.user_id.slice(0, 8)
  const placeOf = (r: AttendanceOut) => (r.device_id ? deviceMap.get(r.device_id) : undefined)

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
      show(err instanceof Error ? err.message : t('attendance.export_error'), 'error')
    }
  }

  function changeFrom(v: string) {
    setFromDate(v)
    if (v > toDate) setToDate(v)
    setPage(1)
  }
  function changeTo(v: string) {
    setToDate(v)
    if (v < fromDate) setFromDate(v)
    setPage(1)
  }

  const onTime = rows.filter((r) => r.status === 'on_time').length
  const lateOrEarly = rows.filter((r) => r.status !== 'on_time').length
  const outside = rows.filter((r) => isOutside(r.location)).length

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (typeFilter === 'outside' && !isOutside(r.location)) return false
      if ((typeFilter === 'check_in' || typeFilter === 'check_out') && r.type !== typeFilter) return false
      return !q || (userMap.get(r.user_id) ?? '').toLowerCase().includes(q)
    })
  }, [rows, typeFilter, query, userMap])

  const groups = useMemo(() => {
    const out: { day: string; items: AttendanceOut[] }[] = []
    filteredRows.forEach((r) => {
      const k = dayKey(r.occurred_at)
      const last = out[out.length - 1]
      if (last && last.day === k) last.items.push(r)
      else out.push({ day: k, items: [r] })
    })
    return out
  }, [filteredRows])

  const shortDate = (ymd: string) =>
    new Date(`${ymd}T00:00:00`).toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' })
  const dayLabel = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00`)
    if (Number.isNaN(d.getTime())) return ymd
    const dm = d.toLocaleDateString(tag, { day: 'numeric', month: 'short' })
    return ymd === today() ? `${t('attendance.today')} · ${dm}` : `${d.toLocaleDateString(tag, { weekday: 'long' })} · ${dm}`
  }
  const dateTime = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return `${d.toLocaleDateString(tag, { day: 'numeric', month: 'short' })}, ${formatTime(iso)}`
  }
  const typeLabel = (r: AttendanceOut) => (r.type === 'check_in' ? t('attendance.type_in') : t('attendance.type_out'))

  const range = (small?: boolean) => (
    <span className="tp-range">
      <DateButton small={small} value={fromDate} max={toDate} onChange={changeFrom} label={t('attendance.from_label')} text={shortDate(fromDate)} />
      –
      <DateButton small={small} value={toDate} min={fromDate} onChange={changeTo} label={t('attendance.to_label')} text={shortDate(toDate)} />
    </span>
  )

  const pills = (
    <Pills
      items={[
        { key: 'all' as TypeFilter, label: t('attendance.filter_all') },
        { key: 'check_in' as TypeFilter, label: t('attendance.type_in') },
        { key: 'check_out' as TypeFilter, label: t('attendance.type_out') },
        { key: 'outside' as TypeFilter, label: t('attendance.location_outside'), count: outside || undefined },
      ]}
      value={typeFilter}
      onChange={setTypeFilter}
      label={t('attendance.filter_label')}
    />
  )

  const empty = <EmptyState icon="clipboard" title={t('attendance.empty')} description={t('attendance.empty_desc')} />

  return (
    <div className="tp-page">
      <PageHead
        title={t('attendance.title')}
        subtitle={<span className="tp-desktop-only">{t('attendance.subtitle')}</span>}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void handleExport()}>
            <Download size={15} />
            <span className="tp-desktop-only">{t('attendance.export_csv')}</span>
            <span className="tp-phone-only">{t('attendance.export_short')}</span>
          </button>
        }
      />

      <div className="tp-toolbar-card">
        <SearchBox value={query} onChange={setQuery} placeholder={t('attendance.search_placeholder')} label={t('attendance.search_label')} />
        {range()}
        {pills}
      </div>

      <div className="tp-desktop-only">
        {isLoading ? (
          <StatRow skeleton={4} />
        ) : (
          <StatRow>
            <StatCard label={t('attendance.stat_total')} value={total.toLocaleString(tag)} tone="m" />
            <StatCard label={t('attendance.stat_on_time')} value={onTime.toLocaleString(tag)} tone="g" />
            <StatCard label={t('attendance.stat_late_early')} value={lateOrEarly.toLocaleString(tag)} tone="w" />
            <StatCard
              label={t('attendance.location_outside')}
              value={outside.toLocaleString(tag)}
              tone="r"
              active={typeFilter === 'outside'}
              onClick={() => setTypeFilter(typeFilter === 'outside' ? 'all' : 'outside')}
            />
          </StatRow>
        )}
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      {/* Desktop table */}
      <div className="tp-card tp-desktop-only">
        <table className="tp-table">
          <thead>
            <tr>
              {[t('attendance.th_user'), t('attendance.th_type'), t('attendance.th_time'), t('attendance.th_status'), t('attendance.th_location'), t('attendance.th_liveness')].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td><div className="skeleton skeleton-text" style={{ width: '60%' }} /></td>
                  <td><div className="skeleton skeleton-badge" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-badge" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                </tr>
              ))
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={6}>{empty}</td></tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td><Who name={nameOf(row)} /></td>
                  <td><Chip tone={row.type === 'check_in' ? 'b' : 'm'}>{typeLabel(row)}</Chip></td>
                  <td className="tp-time">{dateTime(row.occurred_at)}</td>
                  <td><Chip tone={STATUS_META[row.status].tone}>{t(STATUS_META[row.status].key)}</Chip></td>
                  <td>
                    <span className="tp-inline">
                      {isOutside(row.location) ? (
                        <Chip tone="r" title={t('attendance.location_outside_title')}>{t('attendance.location_outside')}</Chip>
                      ) : (
                        placeOf(row) && <span>{placeOf(row)}</span>
                      )}
                      <MapLink location={row.location} />
                      {!isOutside(row.location) && !placeOf(row) && row.location?.lat == null && <span className="tp-muted">—</span>}
                    </span>
                  </td>
                  <td className="tp-num">{row.liveness_score != null ? row.liveness_score.toFixed(2) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phone: grouped per day */}
      <div className="tp-phone-only">
        {isLoading ? (
          <div className="empty-state">{t('attendance.loading')}</div>
        ) : filteredRows.length === 0 ? (
          <div className="tp-card">{empty}</div>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="tp-phone-group">
              <div className="tp-group-label">{dayLabel(g.day)}</div>
              <div className="tp-card tp-list">
                {g.items.map((row) => {
                  const out = isOutside(row.location)
                  const place = placeOf(row)
                  return (
                    <div key={row.id} className="tp-list-row">
                      <Who name={nameOf(row)} sub={`${typeLabel(row)} ${formatTime(row.occurred_at)}${place ? ` · ${place}` : ''}`} />
                      <MapLink location={row.location} iconOnly />
                      {out ? (
                        <Chip tone="r" title={t('attendance.location_outside_title')}>{t('attendance.outside_short')}</Chip>
                      ) : (
                        <Chip tone={STATUS_META[row.status].tone}>{t(STATUS_META[row.status].key)}</Chip>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
    </div>
  )
}
