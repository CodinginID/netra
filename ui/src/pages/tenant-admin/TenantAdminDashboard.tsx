import { Outlet, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/DashboardLayout'
import { tenantNav, tenantMobileTabs } from '@/components/nav/navConfig'
import { useI18n } from '@/store/i18nStore'

export function TenantAdminDashboard() {
  const { t } = useI18n()
  return (
    <DashboardLayout
      title={t('tenant_admin.title')}
      nav={tenantNav('/tenant')}
      mobileTabs={tenantMobileTabs('/tenant')}
      tone="light"
    >
      <Outlet />
    </DashboardLayout>
  )
}

export function TenantAdminIndex() {
  return <Navigate to="/tenant/dashboard" replace />
}
