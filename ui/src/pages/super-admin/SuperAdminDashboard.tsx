import { Outlet, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  Activity,
  CheckCircle2,
  ScanFace,
  Monitor,
  CalendarDays,
  ClipboardList,
  UserCheck,
  KeyRound,
  Trash2,
  ArrowUpRight,
  Settings,
  AlertCircle,
  XCircle,
} from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { DonutChart } from '@/components/charts/DonutChart'
import { useTenants, useUsers, useDailyReport } from '@/hooks/useApiQueries'
import { useI18n } from '@/store/i18nStore'
import type { TenantOut } from '@/api/adminApi'
import { EmptyState } from '@/components/EmptyState'

// Nav items for global (no-tenant) context
const NAV_ITEMS_GLOBAL = [
  { labelKey: 'nav.dashboard' as const, to: '/admin/dashboard', icon: LayoutDashboard },
  { labelKey: 'nav.tenant' as const, to: '/admin/tenants', icon: Building2 },
  { labelKey: 'nav.trash' as const, to: '/admin/trash', icon: Trash2 },
  { labelKey: 'nav.settings' as const, to: '/admin/settings', icon: Settings },
]

/** Build tenant-scoped nav items for a given tenant ID. */
function buildTenantNavItemsKeys(tenantId: string) {
  const base = `/admin/tenants/${tenantId}`
  return [
    { labelKey: 'nav.dashboard' as const, to: base, icon: LayoutDashboard },
    { labelKey: 'nav.users' as const, to: `${base}/users`, icon: Users },
    { labelKey: 'nav.enrollment' as const, to: `${base}/enrollment`, icon: ScanFace },
    { labelKey: 'nav.devices' as const, to: `${base}/devices`, icon: Monitor },
    { labelKey: 'nav.schedules' as const, to: `${base}/schedules`, icon: CalendarDays },
    { labelKey: 'nav.attendance' as const, to: `${base}/attendance`, icon: ClipboardList },
    { labelKey: 'nav.daily_status' as const, to: `${base}/status`, icon: UserCheck },
    { labelKey: 'nav.integration' as const, to: `${base}/integration`, icon: KeyRound },
    { labelKey: 'nav.trash' as const, to: `${base}/trash`, icon: Trash2 },
    { labelKey: 'nav.settings' as const, to: `${base}/settings`, icon: Settings },
  ]
}

/**
 * Extract tenantId from the current pathname.
 * Returns null if not in a tenant-scoped route.
 */
function extractTenantIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/tenants\/([a-f0-9-]+)(\/.*)?$/)
  return match?.[1] ?? null
}

export function SuperAdminDashboard() {
  const location = useLocation()
  const tenantId = extractTenantIdFromPath(location.pathname)
  const { t } = useI18n()

  // Build nav items based on whether we're in a tenant-scoped route
  const navItemKeys = tenantId
    ? buildTenantNavItemsKeys(tenantId)
    : NAV_ITEMS_GLOBAL

  const navItems = navItemKeys.map((item) => ({
    label: t(item.labelKey),
    to: item.to,
    icon: item.icon,
  }))

  // Derive title from context
  const title = tenantId ? t('title.manage_tenant') : t('title.super_admin')

  return (
    <DashboardLayout title={title} navItems={navItems}>
      <Outlet />
    </DashboardLayout>
  )
}

export function SuperAdminIndex() {
  return <Navigate to="/admin/dashboard" replace />
}


interface StatCard {
  label: string
  value: number
  Icon: typeof Building2
  fg: string
  bg: string
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function VerticalBadge({ config }: { config: TenantOut['config'] }) {
  const { t } = useI18n()
  const mode = (config?.vertical as { mode?: string } | undefined)?.mode ?? 'company'
  if (mode === 'university') return <span className="badge badge-blue">{t('university')}</span>
  if (mode === 'school') return <span className="badge badge-green">{t('school')}</span>
  return <span className="badge badge-gray">{t('company')}</span>
}

/**
 * Global dashboard — the default landing page for super admins.
 * Shows system-wide stats and a list of all tenants with "Kelola" links.
 */
/**
 * Tenant-scoped home page — shown when a super admin views a specific tenant
 * under /admin/tenants/:tenantId. Shows a summary of this tenant only:
 * user count, attendance today, and a link to the full tenant admin pages.
 */
export function TenantAdminHomePage() {
  const navigate = useNavigate()
  const { tenantId } = useParams<{ tenantId: string }>()
  const { t } = useI18n()
  const today = todayString()

  const { data: tenantsData } = useTenants({ limit: 1000 })
  const { data: usersData } = useUsers({ limit: 1000 })
  const { data: reportData } = useDailyReport(today)

  const tenants = tenantsData?.items ?? []
  const tenant = tenants.find((t$) => t$.id === tenantId)

  const enrolled = usersData?.items?.filter((u) => u.enrolled).length ?? 0
  const totalUsers = usersData?.total ?? 0
  const checkInToday = reportData?.check_in ?? 0
  const lateToday = reportData?.late ?? 0
  const absentCount = Math.max(enrolled - checkInToday, 0)

  // Redirect if tenant not found
  if (tenantId && !tenant) {
    return (
      <div>
        <div className="page-header">
          <h2>{t('global.welcome_title')}</h2>
        </div>
        <div className="data-card">
          <EmptyState
            icon="inbox"
            title={t('tenant.error_not_found') ?? 'Tenant tidak ditemukan'}
            description="ID tenant tidak valid atau sudah dihapus"
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2>{tenant?.name ? `${tenant.name}` : t('global.welcome_title')}</h2>
        <p>{t('global.overview_desc')}</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          { label: t('stat.total_users'), value: totalUsers, Icon: Users, fg: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { label: t('stat.attendance_today'), value: checkInToday, Icon: Activity, fg: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
          { label: 'Terlambat', value: lateToday, Icon: AlertCircle, fg: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { label: 'Absen', value: absentCount, Icon: XCircle, fg: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
        ].map(({ label, value, Icon, fg, bg }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon" style={{ background: bg }}><Icon size={22} color={fg} /></div>
            <div>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {tenant && (
        <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{tenant.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{tenant.slug}</div>
            </div>
            <span className={tenant.status === 'active' ? 'badge badge-green' : 'badge badge-gray'}>
              {tenant.status === 'active' ? t('active') : t('suspended')}
            </span>
          </div>
        </div>
      )}

      <div className="data-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>{t('section.tenant_list')}</h3>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            Lihat daftar tenant lain di halaman Kelola Tenant
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/tenants')}>
            Kelola Semua Tenant <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function SuperAdminHomePage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const today = todayString()

  const { data: tenantsData } = useTenants({ limit: 1000 })
  const { data: usersData } = useUsers({ limit: 1000 })
  const { data: reportData } = useDailyReport(today)

  const tenants = tenantsData?.items ?? []
  const activeTenants = tenants.filter((t) => t.status === 'active').length
  const suspendedTenants = tenants.filter((t) => t.status === 'suspended').length

  const stats: StatCard[] = [
    { label: t('stat.total_tenants'), value: tenantsData?.total ?? 0, Icon: Building2, fg: 'var(--color-brand)', bg: 'rgba(124,58,237,0.08)' },
    { label: t('stat.active_tenants'), value: activeTenants, Icon: CheckCircle2, fg: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
    { label: t('stat.total_users'), value: usersData?.total ?? 0, Icon: Users, fg: '#d97706', bg: 'rgba(217,119,6,0.08)' },
    { label: t('stat.attendance_today'), value: reportData?.check_in ?? 0, Icon: Activity, fg: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  ]

  return (
    <div>
      <div className="page-header">
        <h2>{t('global.welcome_title')}</h2>
        <p>{t('global.overview_desc')}</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {stats.map(({ label, value, Icon, fg, bg }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon" style={{ background: bg }}><Icon size={22} color={fg} /></div>
            <div>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {tenants.length > 0 && (
        <div className="data-card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 16 }}>
            {t('section.tenant_status')}
          </div>
          <DonutChart
            centerLabel={t('nav.tenant')}
            centerValue={tenants.length}
            data={[
              { label: t('active'), value: activeTenants, color: '#16a34a' },
              { label: t('suspended'), value: suspendedTenants, color: '#dc2626' },
            ]}
          />
        </div>
      )}

      {/* Tenant list with "Kelola" links */}
      <div className="data-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>{t('section.tenant_list')}</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/tenants')}>
            {t('btn.manage_all')} <ArrowUpRight size={13} />
          </button>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('tenant.col_name')}</th>
              <th>{t('tenant.col_slug')}</th>
              <th>{t('tenant.col_status')}</th>
              <th>{t('tenant.col_registered')}</th>
              <th style={{ textAlign: 'right' }}>{t('tenant.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {tenants.slice(0, 10).map((t$) => (
              <tr key={t$.id}>
                <td style={{ fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {t$.name}
                    <VerticalBadge config={t$.config} />
                  </span>
                </td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{t$.slug}</td>
                <td>
                  <span className={t$.status === 'active' ? 'badge badge-green' : 'badge badge-gray'}>
                    {t$.status === 'active' ? t('active') : t('suspended')}
                  </span>
                </td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(t$.created_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => navigate(`/admin/tenants/${t$.id}`)}
                  >
                    {t('btn.manage')}
                  </button>
                </td>
              </tr>
            ))}
            {tenants.length > 10 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/tenants')}>
                    {t('btn.view_all_tenants', { count: tenants.length })}
                  </button>
                </td>
              </tr>
            )}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">{t('tenant.empty')}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
