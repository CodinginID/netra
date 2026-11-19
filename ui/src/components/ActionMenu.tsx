import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, MoreVertical } from 'lucide-react'

export interface ActionMenuItem {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  /** Small explanatory line under the label (e.g. why it is disabled). */
  hint?: string
  title?: string
  /** Draw a divider above this item. */
  separatorBefore?: boolean
}

// Rough max height of the list, to decide whether it opens upwards.
const MENU_HEIGHT = 240

interface ActionMenuProps {
  label: string
  items: ActionMenuItem[]
  disabled?: boolean
  /** Small muted caption at the top of the list (e.g. the row's name). */
  header?: string
  /** ⋮ (default) or ⋯ trigger. */
  variant?: 'vertical' | 'horizontal'
}

/** A ⋮ / ⋯ button that opens a small action list (keyboard + outside-click aware). */
export function ActionMenu({ label, items, disabled, header, variant = 'vertical' }: ActionMenuProps) {
  const TriggerIcon = variant === 'horizontal' ? MoreHorizontal : MoreVertical
  const [open, setOpen] = useState(false)
  // Portalled + fixed-position so a swipe card's overflow/transform can't clip it.
  const [pos, setPos] = useState<CSSProperties>({})
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

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

  return (
    <div className="action-menu">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-sm action-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
      >
        <TriggerIcon size={16} />
      </button>
      {open && createPortal(
        <div className="action-menu-list" role="menu" aria-label={header ?? label} ref={listRef} style={pos}>
          {header && (
            <div
              aria-hidden="true"
              style={{
                padding: '6px 12px 4px',
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--color-text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 240,
              }}
            >
              {header}
            </div>
          )}
          {items.map((item) => (
            <div key={item.key} style={{ display: 'contents' }}>
              {item.separatorBefore && <div className="action-menu-divider" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={`action-menu-item${item.danger ? ' action-menu-item--danger' : ''}`}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.icon}
                <span>
                  {item.label}
                  {item.hint && <small className="action-menu-hint">{item.hint}</small>}
                </span>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
