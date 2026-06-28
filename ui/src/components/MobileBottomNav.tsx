import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal, KeyRound, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import '@/styles/layout.css'

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

interface MobileBottomNavProps {
  items: NavItem[]
  onLogout: () => void
  onChangePassword: () => void
}

// Native apps keep the tab bar to ~5 targets. The rest live in a "More" sheet.
const MAX_TABS = 4

export function MobileBottomNav({ items, onLogout, onChangePassword }: MobileBottomNavProps) {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const primary = items.slice(0, MAX_TABS)
  const overflow = items.slice(MAX_TABS)
  const overflowActive = overflow.some((i) => i.to === location.pathname)

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Navigasi utama">
        {primary.map((item) => {
          const isActive = location.pathname === item.to
          return (
            <NavLink key={item.to} to={item.to} className={`mobile-nav-item${isActive ? ' active' : ''}`}>
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
        <button
          type="button"
          className={`mobile-nav-item${moreOpen || overflowActive ? ' active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-label="Menu lainnya"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={22} />
          <span>Lainnya</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="mobile-more-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Menu lainnya"
          >
            <div className="mobile-more-handle" />

            {overflow.length > 0 && (
              <div className="mobile-more-grid">
                {overflow.map((item) => {
                  const isActive = location.pathname === item.to
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className={`mobile-more-item${isActive ? ' active' : ''}`}
                    >
                      <item.icon size={22} />
                      <span>{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            )}

            <div className="mobile-more-actions">
              <div className="mobile-more-row">
                <span>Tema gelap</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                className="mobile-more-action"
                onClick={() => { setMoreOpen(false); onChangePassword() }}
              >
                <KeyRound size={18} /> Ubah Password
              </button>
              <button
                type="button"
                className="mobile-more-action danger"
                onClick={() => { setMoreOpen(false); onLogout() }}
              >
                <LogOut size={18} /> Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
