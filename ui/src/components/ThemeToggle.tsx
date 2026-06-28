import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  const isDark = theme === 'dark'

  return (
    <button
      className="btn-icon"
      onClick={toggle}
      title={isDark ? 'Mode terang' : 'Mode gelap'}
      aria-label={isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
      aria-pressed={isDark}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
