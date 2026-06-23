import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { dailyReport, listTenants, listUsers } from '@/api/adminApi'
import type { TenantOut } from '@/api/adminApi'
import { useAuthStore } from '@/store/authStore'

const NAV_ITEMS = [
  { label: 'Dasbor', to: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Tenant', to: '/admin/tenants', icon: Building2 },
  { label: 'Kelola Tenant', to: '', icon: undefined, divider: true },
  { label: 'Pengguna', to: '/admin/users', icon: Users },
  { label: 'Enrollment', to: '/admin/enrollment', icon: ScanFace },
  { label: 'Perangkat', to: '/admin/devices', icon: Monitor },
  { label: 'Jadwal', to: '/admin/schedules', icon: CalendarDays },
  { label: 'Kehadiran', to: '/admin/attendance', icon: ClipboardList },
]

function TenantSelectorBanner() {
  const role = useAuthStore((s) => s.role)
  const token = useAuthStore((s) => s.accessToken)
  const selectedTenantId = useAuthStore((s) => s.selectedTenantId)
  const setSelectedTenantId = useAuthStore((s) => s.setSelectedTenantId)
  const [tenants, setTenants] = useState<TenantOut[]>([])

  useEffect(() => {
    if (!token || role !== 'super_admin') return
    let active = true
    listTenants(token)
      .then((data) => {
        if (active) setTenants(data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [token, role])

  if (role !== 'super_admin') return null

  const selected = tenants.find((t) => t.id === selectedTenantId)

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value || null
    setSelectedTenantId(id)
  }

  return (
    <div className="tenant-banner">
      <span style={{ fontWeight: 600 }}>Tenant:</span>
      <select value={selectedTenantId ?? ''} onChange={handleChange}>
        <option value="">-- Pilih Tenant --</option>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {selected ? (
        <span className="tenant-banner-badge--selected">Konteks: {selected.name}</span>
      ) : (
        <span className="tenant-banner-badge--empty">Pilih tenant untuk mengelola data</span>
      )}
    </div>
  )
}

export function SuperAdminDashboard() {
  return (
    <DashboardLayout title="Super Admin" navItems={NAV_ITEMS}>
      <TenantSelectorBanner />
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
  const token = useAuthStore((s) => s.accessToken)
  const [stats, setStats] = useState<StatCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let active = true
    const load = async () => {
      try {
        const [tenants, users, recap] = await Promise.all([
          listTenants(token),
          listUsers(token),
          dailyReport(token, todayString()),
        ])
        if (!active) return
        const activeTenants = tenants.filter((t) => t.status === 'active').length
        setStats([
          { label: 'Total Tenant', value: tenants.length, Icon: Building2, fg: 'var(--color-brand)', bg: 'rgba(124,58,237,0.08)' },
          { label: 'Tenant Aktif', value: activeTenants, Icon: CheckCircle2, fg: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
          { label: 'Total Pengguna', value: users.length, Icon: Users, fg: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { label: 'Absensi Hari Ini', value: recap.check_in, Icon: Activity, fg: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
        ])
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Gagal memuat data')
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  return (
    <div>
      <div className="page-header">
        <h2>Selamat Datang, Super Admin 👋</h2>
      </div>

      {error && (
        <div style={{ marginBottom: 16, fontSize: 13, color: '#dc2626' }}>{error}</div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {stats?.map(({ label, value, Icon, fg, bg }) => (
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
