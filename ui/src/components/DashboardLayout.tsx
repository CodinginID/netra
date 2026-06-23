import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Eye, LogOut, Menu, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { NotificationBell } from '@/components/NotificationBell'
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
}

function initials(name?: string | null, fallback?: string | null): string {
  const src = name ?? fallback ?? '?'
  return src
    .split(/[_\s]/)
    .map((p) => p.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function roleLabel(role?: string | null): string {
  if (!role) return ''
  return role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function DashboardLayout({ title, navItems, children }: DashboardLayoutProps) {
  const { role, username, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Derive active page label from current route
  const activeNav = navItems.find(
    (item) => !item.divider && location.pathname === item.to,
  )
  const pageTitle = activeNav?.label ?? title

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function closeSidebar() {
    setSidebarOpen(false)
  }

  return (
    <div className={`layout${sidebarOpen ? ' sidebar-open' : ''}`}>
      <div className="sidebar-backdrop" onClick={closeSidebar} />

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
                  onClick={closeSidebar}
                  className={({ isActive }) => (isActive ? 'active' : '')}
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
            <button
              className="topbar-menu-btn"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="topbar-title">{pageTitle}</span>
          </div>
          <div className="topbar-user">
            <NotificationBell />
            <div className="topbar-avatar">{initials(username, role)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.2 }}>
                {username ?? roleLabel(role)}
              </span>
              {username && (
                <span className="topbar-role">{roleLabel(role)}</span>
              )}
            </div>
          </div>
        </header>

        <main className="page-content" key={location.pathname}>{children}</main>
      </div>
    </div>
  )
}
