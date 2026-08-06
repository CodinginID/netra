import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { useI18n } from '@/store/i18nStore'

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  const { t } = useI18n()
  const isDark = theme === 'dark'

  return (
    <button
      className="btn-icon"
      onClick={toggle}
      title={isDark ? t('theme.light') : t('theme.dark')}
      aria-label={isDark ? t('theme.light') : t('theme.dark')}
      aria-pressed={isDark}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
