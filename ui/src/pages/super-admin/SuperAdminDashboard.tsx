import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { DashboardLayout } from '@/components/DashboardLayout'
import { tenantNav, tenantMobileTabs, platformNav, platformMobileTabs } from '@/components/nav/navConfig'
import { useI18n } from '@/store/i18nStore'

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

  const base = tenantId ? `/admin/tenants/${tenantId}` : null
  const nav = base ? tenantNav(base, base) : platformNav()
  const mobileTabs = base ? tenantMobileTabs(base, base) : platformMobileTabs()

  // Derive title from context
  const title = tenantId ? t('title.manage_tenant') : t('title.super_admin')

  return (
    <DashboardLayout title={title} nav={nav} mobileTabs={mobileTabs} tone="dark">
      <Outlet />
    </DashboardLayout>
  )
}

export function SuperAdminIndex() {
  return <Navigate to="/admin/dashboard" replace />
}

// The two home pages live in their own files; re-exported so App.tsx imports stay put.
export { SuperAdminHomePage } from './PlatformHomePage'
export { TenantAdminHomePage } from './TenantHomePage'
