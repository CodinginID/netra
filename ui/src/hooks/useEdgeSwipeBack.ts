import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Mobile gesture navigation (3.5): swipe back from the left screen edge.
 *
 * Listens for a touch that *starts* within ~20px of the left edge and is then
 * dragged to the right past a threshold — mirroring the native iOS/Android
 * "back" gesture — and calls `navigate(-1)`.
 *
 * Safe by design:
 *  - ignores touches that don't start at the edge (so normal scrolling/taps and
 *    SwipeCard horizontal swipes inside the page are untouched),
 *  - ignores multi-touch (pinch/zoom),
 *  - ignores mostly-vertical drags,
 *  - only fires once per gesture.
 *
 * Touch-only, so desktop (mouse) is never affected. Reusable on any page —
 * just call `useEdgeSwipeBack()` at the top of the component.
 */
export function useEdgeSwipeBack(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const navigate = useNavigate()

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined' || !('ontouchstart' in window)) return

    const EDGE = 20 // px from the left edge where the gesture may begin
    const DIST = 70 // px of rightward travel required to trigger back
    const SLOP = 40 // max vertical drift before we treat it as a scroll, not a back-swipe

    let startX = 0
    let startY = 0
    let tracking = false
    let fired = false

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        tracking = false
        return
      }
      const t = e.touches[0]
      if (t.clientX <= EDGE) {
        tracking = true
        fired = false
        startX = t.clientX
        startY = t.clientY
      } else {
        tracking = false
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking || fired || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      // Abort if the drag is mostly vertical (user is scrolling).
      if (dy > SLOP && dy > dx) {
        tracking = false
        return
      }
      if (dx >= DIST) {
        fired = true
        tracking = false
        navigate(-1)
      }
    }

    function onTouchEnd() {
      tracking = false
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [enabled, navigate])
}
