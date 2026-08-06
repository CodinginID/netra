type EmptyIcon = 'file' | 'users' | 'monitor' | 'calendar' | 'clipboard' | 'inbox' | 'trash' | 'offline'

interface EmptyStateProps {
  icon?: EmptyIcon
  title: string
  description?: string
  action?: React.ReactNode
}

/**
 * Tasteful inline SVG illustrations, one per empty-state type.
 * On-brand teal gradient, no external assets. Drawn on a 120x120 canvas
 * and rendered inside a soft gradient pedestal.
 */
function Illustration({ type }: { type: EmptyIcon }) {
  const gid = `es-grad-${type}`
  const brand = 'var(--color-brand)'
  const stroke = 'var(--color-brand)'

  const defs = (
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0d9488" />
        <stop offset="100%" stopColor="#006387" />
      </linearGradient>
    </defs>
  )

  // Shared canvas attrs
  const common = {
    width: 120,
    height: 120,
    viewBox: '0 0 120 120',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    role: 'img' as const,
    'aria-hidden': true,
  }

  switch (type) {
    case 'users':
      return (
        <svg {...common}>
          {defs}
          <circle cx="46" cy="48" r="15" fill={`url(#${gid})`} opacity="0.9" />
          <path d="M22 86c0-13 11-22 24-22s24 9 24 22" fill={`url(#${gid})`} opacity="0.9" />
          <circle cx="82" cy="54" r="11" fill={brand} opacity="0.22" />
          <path d="M64 86c0-10 8-17 18-17s18 7 18 17" fill={brand} opacity="0.22" />
        </svg>
      )
    case 'monitor':
      return (
        <svg {...common}>
          {defs}
          <rect x="24" y="30" width="72" height="48" rx="6" fill={`url(#${gid})`} opacity="0.9" />
          <rect x="33" y="39" width="54" height="30" rx="3" fill="#fff" opacity="0.85" />
          <circle cx="60" cy="54" r="8" fill={brand} opacity="0.35" />
          <rect x="48" y="82" width="24" height="6" rx="3" fill={brand} opacity="0.3" />
          <rect x="38" y="90" width="44" height="6" rx="3" fill={brand} opacity="0.18" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common}>
          {defs}
          <rect x="26" y="32" width="68" height="60" rx="8" fill={`url(#${gid})`} opacity="0.9" />
          <rect x="26" y="32" width="68" height="18" rx="8" fill={brand} />
          <rect x="40" y="24" width="6" height="14" rx="3" fill="#fff" opacity="0.85" />
          <rect x="74" y="24" width="6" height="14" rx="3" fill="#fff" opacity="0.85" />
          <rect x="36" y="58" width="12" height="10" rx="2" fill="#fff" opacity="0.85" />
          <rect x="54" y="58" width="12" height="10" rx="2" fill="#fff" opacity="0.55" />
          <rect x="72" y="58" width="12" height="10" rx="2" fill="#fff" opacity="0.85" />
          <rect x="36" y="74" width="12" height="10" rx="2" fill="#fff" opacity="0.55" />
          <rect x="54" y="74" width="12" height="10" rx="2" fill="#fff" opacity="0.85" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg {...common}>
          {defs}
          <rect x="30" y="28" width="60" height="72" rx="8" fill={`url(#${gid})`} opacity="0.9" />
          <rect x="46" y="22" width="28" height="14" rx="5" fill={brand} />
          <rect x="42" y="50" width="36" height="6" rx="3" fill="#fff" opacity="0.85" />
          <rect x="42" y="63" width="28" height="6" rx="3" fill="#fff" opacity="0.6" />
          <rect x="42" y="76" width="32" height="6" rx="3" fill="#fff" opacity="0.6" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          {defs}
          <path d="M36 44h48l-5 50a6 6 0 0 1-6 5H47a6 6 0 0 1-6-5L36 44Z" fill={`url(#${gid})`} opacity="0.9" />
          <rect x="30" y="34" width="60" height="10" rx="5" fill={brand} />
          <rect x="50" y="26" width="20" height="8" rx="4" fill={brand} opacity="0.5" />
          <rect x="50" y="56" width="5" height="32" rx="2.5" fill="#fff" opacity="0.7" />
          <rect x="65" y="56" width="5" height="32" rx="2.5" fill="#fff" opacity="0.7" />
        </svg>
      )
    case 'offline':
      return (
        <svg {...common}>
          {defs}
          <path d="M30 56c16-16 44-16 60 0" stroke={stroke} strokeWidth="7" strokeLinecap="round" opacity="0.25" />
          <path d="M42 68c10-10 26-10 36 0" stroke={stroke} strokeWidth="7" strokeLinecap="round" opacity="0.45" />
          <circle cx="60" cy="82" r="7" fill={`url(#${gid})`} />
          <path d="M40 40 80 84" stroke={brand} strokeWidth="6" strokeLinecap="round" />
        </svg>
      )
    case 'file':
      return (
        <svg {...common}>
          {defs}
          <path d="M36 24h30l18 18v54a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6V30a6 6 0 0 1 6-6Z" fill={`url(#${gid})`} opacity="0.9" />
          <path d="M66 24v18h18" fill={brand} opacity="0.5" />
          <rect x="42" y="58" width="36" height="6" rx="3" fill="#fff" opacity="0.85" />
          <rect x="42" y="71" width="28" height="6" rx="3" fill="#fff" opacity="0.6" />
          <rect x="42" y="84" width="32" height="6" rx="3" fill="#fff" opacity="0.6" />
        </svg>
      )
    case 'inbox':
    default:
      return (
        <svg {...common}>
          {defs}
          <path d="M30 40a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6V40Z" fill={`url(#${gid})`} opacity="0.9" />
          <path d="M30 62h22a8 8 0 0 0 16 0h22v18a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6V62Z" fill={brand} opacity="0.4" />
          <rect x="46" y="46" width="28" height="5" rx="2.5" fill="#fff" opacity="0.75" />
        </svg>
      )
  }
}

export function EmptyState({ icon = 'inbox', title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {/* Illustration on a soft gradient pedestal */}
      <div style={{
        width: 128,
        height: 128,
        borderRadius: '50%',
        background: 'var(--gradient-brand-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        position: 'relative',
        animation: 'pulse 3s ease-in-out infinite',
      }}>
        {/* Outer dashed ring */}
        <div style={{
          position: 'absolute',
          inset: -6,
          borderRadius: '50%',
          border: '2px dashed rgba(13, 148, 136, 0.15)',
        }} />
        <Illustration type={icon} />
      </div>
      <h3 style={{
        margin: '0 0 6px',
        fontSize: 17,
        fontWeight: 700,
        color: 'var(--color-text)',
        letterSpacing: '-0.3px',
      }}>
        {title}
      </h3>
      {description && (
        <p style={{
          margin: '0 0 20px',
          fontSize: 14,
          color: 'var(--color-text-muted)',
          textAlign: 'center',
          maxWidth: 320,
          lineHeight: 1.5,
        }}>
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
