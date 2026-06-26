import { Outlet, Navigate } from 'react-router-dom'
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
  Trash2,
} from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { TenantSwitcher } from '@/components/TenantSwitcher'
import { useTenants, useUsers, useDailyReport } from '@/hooks/useApiQueries'

const NAV_ITEMS = [
  { label: 'Dasbor', to: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Tenant', to: '/admin/tenants', icon: Building2 },
  { label: 'Kelola Tenant', to: '', icon: undefined, divider: true },
  { label: 'Pengguna', to: '/admin/users', icon: Users },
  { label: 'Enrollment', to: '/admin/enrollment', icon: ScanFace },
  { label: 'Perangkat', to: '/admin/devices', icon: Monitor },
  { label: 'Jadwal', to: '/admin/schedules', icon: CalendarDays },
  { label: 'Kehadiran', to: '/admin/attendance', icon: ClipboardList },
  { label: 'Tempat Sampah', to: '/admin/trash', icon: Trash2 },
]

export function SuperAdminDashboard() {
  return (
    <DashboardLayout title="Super Admin" navItems={NAV_ITEMS} headerSlot={<TenantSwitcher />}>
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

export function SuperAdminHomePage() {
  const today = todayString()

  const { data: tenantsData } = useTenants({ limit: 1000 })
  const { data: usersData } = useUsers({ limit: 1000 })
  const { data: reportData } = useDailyReport(today)

  const tenants = tenantsData?.items ?? []
  const activeTenants = tenants.filter((t) => t.status === 'active').length

  const stats: StatCard[] = [
    { label: 'Total Tenant', value: tenantsData?.total ?? 0, Icon: Building2, fg: 'var(--color-brand)', bg: 'rgba(124,58,237,0.08)' },
    { label: 'Tenant Aktif', value: activeTenants, Icon: CheckCircle2, fg: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
    { label: 'Total Pengguna', value: usersData?.total ?? 0, Icon: Users, fg: '#d97706', bg: 'rgba(217,119,6,0.08)' },
    { label: 'Absensi Hari Ini', value: reportData?.check_in ?? 0, Icon: Activity, fg: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  ]

  return (
    <div>
      <div className="page-header">
        <h2>Selamat Datang, Super Admin 👋</h2>
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

      <div className="data-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Aktivitas Terbaru</h3>
        </div>
        <div className="empty-state">Log aktivitas akan ditampilkan di sini</div>
      </div>
    </div>
  )
}
