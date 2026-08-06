import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * App-wide page-transition wrapper: on every route change it replays a
 * short fade-in on the content (no remount — dashboard layout state and
 * queries survive) and resets the scroll position. Skipped entirely for
 * prefers-reduced-motion users.
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    // Anchor navigations within a page keep their scroll flow.
    if (!hash) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })

    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const el = ref.current
    if (!el) return
    el.classList.remove('route-fade-enter')
    void el.offsetWidth // restart the animation
    el.classList.add('route-fade-enter')
  }, [pathname, hash])

  return <div ref={ref}>{children}</div>
}
