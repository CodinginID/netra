import { useRef, useState, type ReactNode } from 'react'

export interface SwipeAction {
  icon: ReactNode
  label: string
  variant: 'danger' | 'primary'
  onAction: () => void
}

/**
 * Touch swipeable card (mobile). Swipe left reveals/triggers `right` action
 * (e.g. delete), swipe right reveals/triggers `left` action (e.g. edit).
 * Pointer/mouse is ignored — this is a touch affordance; desktop keeps its
 * normal buttons. Past ~40% width the action fires; otherwise it snaps back.
 */
export function SwipeCard({
  children,
  left,
  right,
}: {
  children: ReactNode
  left?: SwipeAction
  right?: SwipeAction
}) {
  const [dx, setDx] = useState(0)
  const startX = useRef(0)
  const dragging = useRef(false)
  const widthRef = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)

  function onTouchStart(e: React.TouchEvent) {
    dragging.current = true
    startX.current = e.touches[0].clientX
    widthRef.current = rootRef.current?.offsetWidth ?? 1
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return
    let delta = e.touches[0].clientX - startX.current
    // Clamp to directions that have an action.
    if (delta < 0 && !right) delta = 0
    if (delta > 0 && !left) delta = 0
    setDx(Math.max(-120, Math.min(120, delta)))
  }

  function onTouchEnd() {
    dragging.current = false
    const threshold = widthRef.current * 0.4
    if (dx <= -threshold && right) right.onAction()
    else if (dx >= threshold && left) left.onAction()
    setDx(0)
  }

  return (
    <div className="swipe-card" ref={rootRef}>
      <div className="swipe-card-bg">
        {/* Left action shows when swiping right (content moves right) */}
        {left && dx > 0 && (
          <span className={`swipe-action swipe-action--${left.variant}`} style={{ marginRight: 'auto' }}>
            {left.icon}
          </span>
        )}
        {right && dx < 0 && (
          <span className={`swipe-action swipe-action--${right.variant}`}>{right.icon}</span>
        )}
      </div>
      <div
        className="swipe-card-content"
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? 'none' : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
