import { FileText, Users, Monitor, Calendar, ClipboardList, Inbox } from 'lucide-react'

type EmptyIcon = 'file' | 'users' | 'monitor' | 'calendar' | 'clipboard' | 'inbox'

interface EmptyStateProps {
  icon?: EmptyIcon
  title: string
  description?: string
  action?: React.ReactNode
}

const ICON_MAP: Record<EmptyIcon, typeof FileText> = {
  file: FileText,
  users: Users,
  monitor: Monitor,
  calendar: Calendar,
  clipboard: ClipboardList,
  inbox: Inbox,
}

export function EmptyState({ icon = 'inbox', title, description, action }: EmptyStateProps) {
  const Icon = ICON_MAP[icon]

  return (
    <div className="empty-state">
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'var(--color-brand-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
      }}>
        <Icon size={36} color="var(--color-brand)" />
      </div>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>
        {title}
      </h3>
      {description && (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
