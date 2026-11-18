import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MoreHorizontal, KeyRound, LogOut, ChevronRight } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useI18n } from '@/store/i18nStore'
import { flattenNav, isGroup, leafMatches } from '@/components/nav/navConfig'
import type { NavEntry, NavLeaf } from '@/components/nav/navConfig'
import '@/styles/layout.css'

interface MobileBottomNavProps {
  nav: NavEntry[]
  /** Paths shown as tabs (max 4 incl. "Lainnya"); every other page is in the sheet. */
  tabs: string[]
  onLogout: () => void
  onChangePassword: () => void
}

export function MobileBottomNav({ nav, tabs, onLogout, onChangePassword }: MobileBottomNavProps) {
  const location = useLocation()
  const { t } = useI18n()
  const [moreOpen, setMoreOpen] = useState(false)

  const leaves = flattenNav(nav)
  const primary = tabs
    .map((to) => leaves.find((l) => l.to === to))
    .filter((l): l is NavLeaf => !!l)
  const inTabs = (l: NavLeaf) => primary.includes(l)
  // "Lainnya" keeps the sidebar's grouping; pages already on a tab are left out.
  const sections = nav
    .map((e) =>
      isGroup(e)
        ? { key: e.labelKey, title: t(e.labelKey), items: e.children.filter((c) => !inTabs(c)) }
        : { key: e.to, title: '', items: inTabs(e) ? [] : [e] },
    )
    .filter((s) => s.items.length > 0)
  const overflowActive = sections.some((s) => s.items.some((l) => leafMatches(l, location.pathname)))

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Navigasi utama">
        {primary.map((item) => {
          const isActive = leafMatches(item, location.pathname)
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={`mobile-nav-item${isActive ? ' active' : ''}`}>
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span>{t(item.tabLabelKey ?? item.labelKey)}</span>
            </NavLink>
          )
        })}
        <button
          type="button"
          className={`mobile-nav-item${moreOpen || overflowActive ? ' active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-label={t('mobile.more_menu')}
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={22} />
          <span>{t('mobile.more')}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="mobile-more-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={t('mobile.more_menu')}
          >
            <div className="mobile-more-handle" />

            {sections.map((section) => (
              <div key={section.key} className="mobile-more-section">
                {section.title && <div className="mobile-more-section-title">{section.title}</div>}
                <div className="mobile-more-list">
                  {section.items.map((item) => {
                    const isActive = leafMatches(item, location.pathname)
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setMoreOpen(false)}
                        className={`mobile-more-item${isActive ? ' active' : ''}`}
                      >
                        <item.icon size={18} aria-hidden />
                        <span>{t(item.labelKey)}</span>
                        <ChevronRight size={16} className="mobile-more-chevron" aria-hidden />
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="mobile-more-actions">
              <div className="mobile-more-row">
                <span>{t('mobile.dark_theme')}</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                className="mobile-more-action"
                onClick={() => { setMoreOpen(false); onChangePassword() }}
              >
                <KeyRound size={18} /> {t('theme.change_password')}
              </button>
              <button
                type="button"
                className="mobile-more-action danger"
                onClick={() => { setMoreOpen(false); onLogout() }}
              >
                <LogOut size={18} /> {t('theme.sign_out')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
