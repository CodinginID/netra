import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Eye, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { NotificationBell } from '@/components/NotificationBell'
import { ProfileMenu } from '@/components/ProfileMenu'
import { ChangePasswordModal } from '@/components/ChangePasswordModal'
import { MobileBottomNav } from '@/components/MobileBottomNav'
import '@/styles/layout.css'

interface NavItem {
  label: string
  to: string
  icon?: LucideIcon
  divider?: boolean
}

interface DashboardLayoutProps {
  title: string
  navItems: NavItem[]
  children: React.ReactNode
  /** Optional element rendered in the topbar (e.g. tenant switcher for super admins). */
  headerSlot?: React.ReactNode
}

function roleLabel(role?: string | null): string {
  if (!role) return ''
  return role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function DashboardLayout({ title, navItems, children, headerSlot }: DashboardLayoutProps) {
  const { role, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [showChangePw, setShowChangePw] = useState(false)

  // Derive active page label from current route
  const activeNav = navItems.find(
    (item) => !item.divider && location.pathname === item.to,
  )
  const pageTitle = activeNav?.label ?? title

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="layout">
      <a href="#main-content" className="skip-link">
        Langsung ke konten utama
      </a>

      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <Eye size={20} className="sidebar-brand-icon" />
            <span>netra</span>
          </div>
          <div className="sidebar-role">{roleLabel(role)}</div>
        </div>

        <ul className="sidebar-nav">
          {navItems.map((item) =>
            item.divider ? (
              <li key={item.label} style={{
                padding: '0.5rem 0.875rem 0.25rem',
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(165,180,252,0.4)',
                marginTop: '0.25rem',
              }}>
                {item.label.replace(/─+/g, '').trim()}
              </li>
            ) : (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => `sidebar-nav-link${isActive ? ' active' : ''}`}
                >
                  {item.icon && <item.icon size={16} />}
                  <span>{item.label}</span>
                </NavLink>
              </li>
            )
          )}
        </ul>

        <div className="sidebar-footer">
          <button onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sign Out</span>
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
        items={navItems
          .filter((item) => !item.divider)
          .map((item) => ({ label: item.label, to: item.to, icon: item.icon! }))
        }
        onLogout={handleLogout}
        onChangePassword={() => setShowChangePw(true)}
      />
    </div>
  )
}
