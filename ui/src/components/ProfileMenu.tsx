import { useEffect, useRef, useState } from 'react'
import { ChevronDown, KeyRound, LogOut, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useI18n } from '@/store/i18nStore'

function initials(src?: string | null): string {
  const s = src ?? '?'
  return s
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

/**
 * Consolidated topbar account menu. Collapses what used to be scattered across
 * the topbar (theme toggle, change-password, avatar, role) into a single
 * avatar-triggered dropdown — clean, profile-style.
 */
export function ProfileMenu({
  onChangePassword,
  onLogout,
}: {
  onChangePassword: () => void
  onLogout: () => void
}) {
  const role = useAuthStore((s) => s.role)
  const username = useAuthStore((s) => s.username)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const isDark = theme === 'dark'
  const { t } = useI18n()

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = roleLabel(role)

  return (
    <div className="profile-menu" ref={ref}>
      <button
        className="profile-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('profile.menu_account')}
      >
        <span className="profile-avatar">{initials(name)}</span>
        <span className="profile-trigger-name">{name}</span>
        <ChevronDown size={15} className={`profile-chevron${open ? ' open' : ''}`} />
      </button>

      {open && (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-header">
            <span className="profile-avatar lg">{initials(name)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="profile-name">{name}</div>
              {username && <div className="profile-sub" title={username}>{username}</div>}
            </div>
          </div>

          <div className="profile-divider" />

          <button className="profile-item" role="menuitem" onClick={() => { toggleTheme() }}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{isDark ? t('theme.light') : t('theme.dark')}</span>
          </button>

          <button
            className="profile-item"
            role="menuitem"
            onClick={() => { setOpen(false); onChangePassword() }}
          >
            <KeyRound size={16} />
            <span>{t('theme.change_password')}</span>
          </button>

          <div className="profile-divider" />

          <button
            className="profile-item danger"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout() }}
          >
            <LogOut size={16} />
            <span>{t('theme.sign_out')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
