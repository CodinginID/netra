import { Outlet, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/DashboardLayout'

const NAV_ITEMS = [
  { label: 'Users', to: '/tenant/users' },
  { label: 'Enrollment', to: '/tenant/enrollment' },
  { label: 'Devices', to: '/tenant/devices' },
  { label: 'Schedules', to: '/tenant/schedules' },
  { label: 'Attendance', to: '/tenant/attendance' },
]

export function TenantAdminDashboard() {
  return (
    <DashboardLayout title="Tenant Admin" navItems={NAV_ITEMS}>
      <Outlet />
    </DashboardLayout>
  )
}

export function TenantAdminIndex() {
  return <Navigate to="/tenant/attendance" replace />
}
