import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/store/i18nStore'
import { NotificationBell } from '@/components/NotificationBell'
import { ProfileMenu } from '@/components/ProfileMenu'
import { ChangePasswordModal } from '@/components/ChangePasswordModal'
import { MobileBottomNav } from '@/components/MobileBottomNav'
import { SidebarNav } from '@/components/nav/SidebarNav'
import { activeLeaf } from '@/components/nav/navConfig'
import type { NavEntry } from '@/components/nav/navConfig'
import '@/styles/layout.css'

interface DashboardLayoutProps {
  title: string
  /** Sidebar menu: plain pages and parents with a submenu. */
  nav: NavEntry[]
  /** Paths shown as bottom-nav tabs on phones; the rest go to "Lainnya". */
  mobileTabs: string[]
  /** `light` for tenant workspaces, `dark` for the super-admin platform. */
  tone?: 'light' | 'dark'
  children: React.ReactNode
  /** Optional element rendered in the topbar (e.g. tenant switcher for super admins). */
  headerSlot?: React.ReactNode
}

function roleLabel(role?: string | null): string {
  if (!role) return ''
  return role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function initials(name: string): string {
  const parts = name.split(/[\s._@-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function DashboardLayout({
  title,
  nav,
  mobileTabs,
  tone = 'light',
  children,
  headerSlot,
}: DashboardLayoutProps) {
  const { role, username, logout } = useAuthStore()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [showChangePw, setShowChangePw] = useState(false)

  const current = activeLeaf(nav, location.pathname)
  const pageTitle = current ? t(current.labelKey) : title
  const who = username ?? roleLabel(role)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="layout">
      <a href="#main-content" className="skip-link">
        {t('nav.skip_link')}
      </a>

      <aside className={`sidebar sidebar--${tone}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark" aria-hidden />
            <span className="sidebar-brand-name">Netra</span>
            {tone === 'dark' && <span className="sidebar-brand-tag">{t('menu.platform')}</span>}
          </div>
        </div>

        <nav className="sidebar-scroll" aria-label={title}>
          <SidebarNav entries={nav} />
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-avatar" aria-hidden>{initials(who)}</span>
          <div className="sidebar-who">
            <div className="sidebar-who-name" title={who}>{who}</div>
            <div className="sidebar-who-role">{roleLabel(role)}</div>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
            title={t('menu.sign_out')}
            aria-label={t('menu.sign_out')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">{pageTitle}</span>
            {headerSlot}
          </div>
          <div className="topbar-user">
            <NotificationBell />
            {/* Desktop-only account menu — on mobile these live in the bottom-nav "Lainnya" sheet */}
            <div className="topbar-user-desktop">
              <ProfileMenu
                onChangePassword={() => setShowChangePw(true)}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </header>

        <main className="page-content page-enter" id="main-content" tabIndex={-1} key={location.pathname}>{children}</main>
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}

      {/* Mobile bottom navigation — the ONLY nav on mobile (sidebar is hidden). */}
      <MobileBottomNav
        nav={nav}
        tabs={mobileTabs}
        onLogout={handleLogout}
        onChangePassword={() => setShowChangePw(true)}
      />
    </div>
  )
}
