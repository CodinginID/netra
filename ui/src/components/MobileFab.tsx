import type { ReactNode } from 'react'

/**
 * Floating action button for the primary action of a page (mobile only — hidden
 * on desktop via CSS). Positioned above the bottom nav.
 */
export function MobileFab({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <button type="button" className="mobile-fab" onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  )
}
