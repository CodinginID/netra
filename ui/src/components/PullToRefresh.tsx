import { useRef, useState, type ReactNode } from 'react'

const TRIGGER = 64 // px pull distance to trigger a refresh
const MAX = 90

/**
 * Pull-to-refresh wrapper (mobile/touch). Only engages when the nearest
 * scrollable ancestor is at the top. Calls `onRefresh` (may be async) and shows
 * a spinner until it settles. Desktop is unaffected (no touch events).
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => void | Promise<unknown>
  children: ReactNode
}) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const active = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  function atTop(): boolean {
    let el = rootRef.current?.parentElement
    while (el) {
      const oy = getComputedStyle(el).overflowY
      if (oy === 'auto' || oy === 'scroll') return el.scrollTop <= 0
      el = el.parentElement
    }
    return (window.scrollY || document.documentElement.scrollTop) <= 0
  }

  function onTouchStart(e: React.TouchEvent) {
    if (refreshing || !atTop()) return
    active.current = true
    startY.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!active.current) return
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) { setPull(0); return }
    // Resistance curve so it feels rubbery.
    setPull(Math.min(MAX, delta * 0.5))
  }

  async function onTouchEnd() {
    if (!active.current) return
    active.current = false
    if (pull >= TRIGGER) {
      setRefreshing(true)
      setPull(TRIGGER)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  return (
    <div ref={rootRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="pull-to-refresh"
        style={{ height: pull, opacity: pull > 8 ? 1 : 0, transition: active.current ? 'none' : 'height 0.2s, opacity 0.2s' }}
        aria-hidden={pull === 0}
      >
        {refreshing ? (
          <span className="pull-spinner" />
        ) : (
          <span>{pull >= TRIGGER ? 'Lepaskan untuk memuat ulang' : 'Tarik untuk memuat ulang'}</span>
        )}
      </div>
      {children}
    </div>
  )
}
