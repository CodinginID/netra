import { Outlet, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/DashboardLayout'

const NAV_ITEMS = [
  { label: 'Tenants', to: '/admin/tenants' },
]

export function SuperAdminDashboard() {
  return (
    <DashboardLayout title="Super Admin" navItems={NAV_ITEMS}>
      <Outlet />
    </DashboardLayout>
  )
}

export function SuperAdminIndex() {
  return <Navigate to="/admin/tenants" replace />
}
