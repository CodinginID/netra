import { useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Expandable mobile card (3.7). Tap the header to expand/collapse a details
 * region with a smooth height + opacity transition. The chevron rotates to
 * indicate state.
 *
 * Mobile-first affordance — on desktop the same markup renders fine, but it is
 * meant for the stacked card layouts that replace tables on small screens.
 */
export function ExpandableCard({
  header,
  children,
  defaultExpanded = false,
}: {
  header: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const bodyRef = useRef<HTMLDivElement>(null)
  const regionId = useId()

  return (
    <div className={`expandable-card${expanded ? ' expandable-card--open' : ''}`}>
      <button
        type="button"
        className="expandable-card-header"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="expandable-card-header-content">{header}</div>
        <ChevronDown size={18} className="expandable-card-chevron" aria-hidden />
      </button>
      <div
        id={regionId}
        className="expandable-card-body"
        role="region"
        aria-hidden={!expanded}
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="expandable-card-body-inner" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  )
}
