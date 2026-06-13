import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import '@/styles/layout.css'

interface NavItem {
  label: string
  to: string
}

interface DashboardLayoutProps {
  title: string
  navItems: NavItem[]
  children: React.ReactNode
}

export function DashboardLayout({ title, navItems, children }: DashboardLayoutProps) {
  const { role, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">netra</div>
          <div className="sidebar-role">{role?.replace('_', ' ')}</div>
        </div>

        <ul className="sidebar-nav">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <button onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <span className="topbar-title">{title}</span>
          <span className="topbar-user">{role}</span>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  )
}
