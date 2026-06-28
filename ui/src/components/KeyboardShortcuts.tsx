import { useEffect, useState, useCallback } from 'react'
import { Keyboard, X } from 'lucide-react'
import '@/styles/polish.css'

type Shortcut = { keys: string[]; label: string }
type Group = { label: string; items: Shortcut[] }

/**
 * Global keyboard-shortcuts overlay. Press `?` (Shift+/) anywhere to open,
 * `Esc` to close. Ignores keystrokes while typing in an input/textarea/select
 * or a contentEditable element. Mount once, near the app root.
 */
const GROUPS: Group[] = [
  {
    label: 'Umum',
    items: [
      { keys: ['?'], label: 'Tampilkan pintasan keyboard' },
      { keys: ['Esc'], label: 'Tutup dialog / overlay' },
    ],
  },
  {
    label: 'Navigasi',
    items: [
      { keys: ['g', 'd'], label: 'Ke Dasbor' },
      { keys: ['g', 'u'], label: 'Ke Pengguna' },
      { keys: ['g', 's'], label: 'Ke Jadwal' },
    ],
  },
]

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (open) {
          e.preventDefault()
          setOpen(false)
        }
        return
      }
      // Ignore while typing or with modifier keys (except the Shift needed for `?`).
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '?') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Pintasan keyboard"
      onClick={close}
    >
      <div
        className="modal-card glass-lg ks-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ks-header">
          <h2 className="ks-title">
            <span className="ks-title-icon" aria-hidden="true">
              <Keyboard size={18} strokeWidth={2} />
            </span>
            Pintasan Keyboard
          </h2>
          <button
            type="button"
            className="ks-close"
            onClick={close}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {GROUPS.map((group) => (
          <div className="ks-group" key={group.label}>
            <p className="ks-group-label">{group.label}</p>
            {group.items.map((item) => (
              <div className="ks-row" key={item.label}>
                <span className="ks-label">{item.label}</span>
                <span className="ks-keys">
                  {item.keys.map((k, i) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      {i > 0 && <span className="ks-plus">lalu</span>}
                      <kbd className="ks-key">{k}</kbd>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}

        <p className="ks-hint">
          Tekan <kbd className="ks-key">?</kbd> kapan saja untuk membuka panel ini
        </p>
      </div>
    </div>
  )
}
