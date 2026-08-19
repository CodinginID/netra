import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '@/store/i18nStore'

const TABS = [
  { to: '/admin/billing/summary', labelKey: 'nav.billing_summary' as const },
  { to: '/admin/billing/plans', labelKey: 'nav.plans' as const },
  { to: '/admin/billing/subscriptions', labelKey: 'nav.subscriptions' as const },
  { to: '/admin/billing/invoices', labelKey: 'nav.invoices' as const },
  { to: '/admin/billing/usage', labelKey: 'nav.usage' as const },
]

export function BillingTabs() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  // Bare /admin/billing now lands on the summary, so that tab — not Plans —
  // is the one that also owns the index path.
  const isActive = (to: string) =>
    to === '/admin/billing/summary'
      ? pathname === '/admin/billing' || pathname === to
      : pathname === to

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={`btn btn-sm ${isActive(tab.to) ? 'btn-primary' : 'btn-ghost'}`}
        >
          {t(tab.labelKey)}
        </Link>
      ))}
    </div>
  )
}
