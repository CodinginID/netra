import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import { groupMatches, isGroup, leafMatches } from './navConfig'
import type { NavEntry, NavGroup, NavLeaf } from './navConfig'

interface SidebarNavProps {
  entries: NavEntry[]
}

/**
 * Sidebar menu with collapsible parents. The group holding the current page
 * opens on its own, and only one group is open at a time so the list stays short.
 */
export function SidebarNav({ entries }: SidebarNavProps) {
  const { pathname } = useLocation()
  const activeGroup = entries.find(
    (e): e is NavGroup => isGroup(e) && groupMatches(e, pathname),
  )
  const [openKey, setOpenKey] = useState<string | null>(activeGroup?.labelKey ?? null)

  // Navigating into another group (from a link, the bottom nav or a shortcut)
  // opens that group.
  useEffect(() => {
    if (activeGroup) setOpenKey(activeGroup.labelKey)
  }, [activeGroup?.labelKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ul className="sidebar-nav">
      {entries.map((entry) =>
        isGroup(entry) ? (
          <SidebarGroup
            key={entry.labelKey}
            group={entry}
            open={openKey === entry.labelKey}
            active={groupMatches(entry, pathname)}
            onToggle={() => setOpenKey((k) => (k === entry.labelKey ? null : entry.labelKey))}
          />
        ) : (
          <li key={entry.to}>
            <SidebarLink leaf={entry} active={leafMatches(entry, pathname)} />
          </li>
        ),
      )}
    </ul>
  )
}

function SidebarLink({ leaf, active, sub }: { leaf: NavLeaf; active: boolean; sub?: boolean }) {
  const { t } = useI18n()
  const Icon = leaf.icon
  return (
    <NavLink
      to={leaf.to}
      end={leaf.end}
      className={`sidebar-link${sub ? ' sidebar-link--sub' : ''}${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={sub ? 15 : 17} strokeWidth={active ? 2.25 : 1.85} aria-hidden />
      <span>{t(leaf.labelKey)}</span>
    </NavLink>
  )
}

function SidebarGroup({
  group,
  open,
  active,
  onToggle,
}: {
  group: NavGroup
  open: boolean
  active: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const Icon = group.icon
  const panelId = `sidebar-group-${group.labelKey.replace(/\W+/g, '-')}`
  return (
    <li className={`sidebar-group${open ? ' open' : ''}${active ? ' has-active' : ''}`}>
      <button
        type="button"
        className="sidebar-link sidebar-group-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <Icon size={17} strokeWidth={active ? 2.25 : 1.85} aria-hidden />
        <span>{t(group.labelKey)}</span>
        <ChevronRight size={15} className="sidebar-group-chevron" aria-hidden />
      </button>
      <div className="sidebar-submenu" id={panelId} hidden={!open}>
        <ul>
          {group.children.map((leaf) => (
            <li key={leaf.to}>
              <SidebarLink leaf={leaf} active={leafMatches(leaf, pathname)} sub />
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}
