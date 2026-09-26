import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Eye, KeyRound, MoreVertical, Trash2, WifiOff } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { DeviceOut } from '@/api/adminApi'

interface Props {
  device: DeviceOut
  busy: boolean
  onViewToken: () => void
  onRegenerate: () => void
  onRevoke: () => void
  onDelete: () => void
}

// Rough max height of the list, to decide whether it opens upwards.
const MENU_HEIGHT = 220

/** The ⋮ menu on a device card: view / reset token, revoke, delete. */
export function DeviceActionsMenu({ device, busy, onViewToken, onRegenerate, onRevoke, onDelete }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // Portalled + fixed-position so the swipe card's overflow/transform can't clip it.
  const [pos, setPos] = useState<CSSProperties>({})
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const active = device.status === 'active'
  const viewable = active && device.token_available !== false

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!open && r) {
      const right = window.innerWidth - r.right
      const flipUp = r.bottom + MENU_HEIGHT > window.innerHeight
      setPos(flipUp ? { right, bottom: window.innerHeight - r.top + 4 } : { right, top: r.bottom + 4 })
    }
    setOpen((o) => !o)
  }

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-sm action-menu-trigger"
        aria-label={`${t('devices.actions')} ${device.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={toggle}
      >
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <div className="action-menu-list" role="menu" ref={listRef} style={pos}>
          {active && (
            <button type="button" role="menuitem" className="action-menu-item" disabled={!viewable} onClick={run(onViewToken)}>
              <Eye size={15} />
              <span>
                {t('devices.view_token')}
                {!viewable && <small className="action-menu-hint">{t('devices.view_token_legacy')}</small>}
              </span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="action-menu-item"
            title={active ? t('devices.reset_title_active') : t('devices.reset_title_inactive')}
            onClick={run(onRegenerate)}
          >
            <KeyRound size={15} />
            <span>{active ? t('devices.reset_token') : t('devices.restore_token')}</span>
          </button>
          {active && (
            <button type="button" role="menuitem" className="action-menu-item" onClick={run(onRevoke)}>
              <WifiOff size={15} />
              <span>{t('devices.revoke')}</span>
            </button>
          )}
          <div className="action-menu-divider" role="separator" />
          <button type="button" role="menuitem" className="action-menu-item action-menu-item--danger" onClick={run(onDelete)}>
            <Trash2 size={15} />
            <span>{t('devices.delete')}</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
