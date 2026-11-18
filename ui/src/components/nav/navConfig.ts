import {
  House,
  LayoutDashboard,
  ClipboardCheck,
  UserCheck,
  ClipboardList,
  Users,
  UserRound,
  ScanFace,
  Briefcase,
  MonitorSmartphone,
  CalendarDays,
  CircleUserRound,
  Plug,
  CreditCard,
  Trash2,
  Settings,
  Building2,
  Wallet,
  ChartPie,
  Repeat,
  Receipt,
  Gauge,
  Package,
  CalendarClock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** A page the sidebar links to. */
export interface NavLeaf {
  /** i18n key of the label. */
  labelKey: string
  to: string
  icon: LucideIcon
  /** Match the path exactly — needed for index routes that prefix every sibling. */
  end?: boolean
  /** Extra paths that also count as this page (e.g. a bare index route). */
  aliases?: string[]
}

/** A parent menu that opens and closes its submenu. */
export interface NavGroup {
  labelKey: string
  icon: LucideIcon
  children: NavLeaf[]
}

export type NavEntry = NavLeaf | NavGroup

export function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

export function leafMatches(leaf: NavLeaf, pathname: string): boolean {
  const paths = [leaf.to, ...(leaf.aliases ?? [])]
  return paths.some((p) =>
    leaf.end ? pathname === p : pathname === p || pathname.startsWith(`${p}/`),
  )
}

export function groupMatches(group: NavGroup, pathname: string): boolean {
  return group.children.some((c) => leafMatches(c, pathname))
}

/** Every page in a menu, groups flattened, in display order. */
export function flattenNav(entries: NavEntry[]): NavLeaf[] {
  return entries.flatMap((e) => (isGroup(e) ? e.children : [e]))
}

/** The page the current path belongs to, if any. */
export function activeLeaf(entries: NavEntry[], pathname: string): NavLeaf | undefined {
  return flattenNav(entries).find((l) => leafMatches(l, pathname))
}

/**
 * Tenant menu. `base` is `/tenant` for a tenant admin, or
 * `/admin/tenants/<id>` when a super admin is working inside a tenant.
 */
export function tenantNav(base: string, homePath = `${base}/dashboard`): NavEntry[] {
  return [
    { labelKey: 'menu.home', to: homePath, icon: House, end: true },
    {
      labelKey: 'menu.group.attendance',
      icon: ClipboardCheck,
      children: [
        { labelKey: 'menu.daily_status', to: `${base}/status`, icon: UserCheck },
        { labelKey: 'menu.attendance', to: `${base}/attendance`, icon: ClipboardList },
      ],
    },
    {
      labelKey: 'menu.group.people',
      icon: Users,
      children: [
        { labelKey: 'menu.users', to: `${base}/users`, icon: UserRound },
        { labelKey: 'menu.enrollment', to: `${base}/enrollment`, icon: ScanFace },
      ],
    },
    {
      labelKey: 'menu.group.operations',
      icon: Briefcase,
      children: [
        { labelKey: 'menu.devices', to: `${base}/devices`, icon: MonitorSmartphone },
        { labelKey: 'menu.schedules', to: `${base}/schedules`, icon: CalendarDays },
      ],
    },
    {
      labelKey: 'menu.group.account',
      icon: CircleUserRound,
      children: [
        { labelKey: 'menu.integration', to: `${base}/integration`, icon: Plug },
        { labelKey: 'menu.billing', to: `${base}/billing`, icon: CreditCard },
        { labelKey: 'menu.trash', to: `${base}/trash`, icon: Trash2 },
        { labelKey: 'menu.settings', to: `${base}/settings`, icon: Settings },
      ],
    },
  ]
}

/** Platform menu for a super admin outside any tenant. */
export function platformNav(): NavEntry[] {
  return [
    { labelKey: 'menu.dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
    { labelKey: 'menu.tenants', to: '/admin/tenants', icon: Building2 },
    {
      labelKey: 'menu.billing',
      icon: Wallet,
      children: [
        {
          labelKey: 'menu.billing_summary',
          to: '/admin/billing/summary',
          icon: ChartPie,
          aliases: ['/admin/billing'],
          end: true,
        },
        { labelKey: 'menu.subscriptions', to: '/admin/billing/subscriptions', icon: Repeat },
        { labelKey: 'menu.invoices', to: '/admin/billing/invoices', icon: Receipt },
        { labelKey: 'menu.usage', to: '/admin/billing/usage', icon: Gauge },
        { labelKey: 'menu.plans', to: '/admin/billing/plans', icon: Package },
      ],
    },
    { labelKey: 'menu.demo_requests', to: '/admin/demo-requests', icon: CalendarClock },
    { labelKey: 'menu.trash', to: '/admin/trash', icon: Trash2 },
    { labelKey: 'menu.settings', to: '/admin/settings', icon: Settings },
  ]
}

/**
 * Bottom-nav tabs on phones (max 4 + "Lainnya"). Paths not listed here
 * live in the "Lainnya" sheet, grouped exactly like the sidebar.
 */
export function tenantMobileTabs(base: string, homePath = `${base}/dashboard`): string[] {
  return [homePath, `${base}/attendance`, `${base}/users`]
}

export function platformMobileTabs(): string[] {
  return ['/admin/dashboard', '/admin/tenants', '/admin/billing/summary']
}
