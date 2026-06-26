import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useAttendance, useUsers } from '@/hooks/useApiQueries'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function NotificationBell() {
  const token = useAuthStore((s) => s.accessToken)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const todayDate = today()

  const { data: attendanceData } = useAttendance({ from: todayDate, to: todayDate, limit: 1000 })
  const { data: usersData } = useUsers({ limit: 1000 })

  // Compute late arrivals from query data
  const attendance = attendanceData?.items ?? []
  const users = usersData?.items ?? []
  const late = attendance
    .filter((a) => a.status === 'late' && a.type === 'check_in')
    .map((a) => ({
      id: a.id,
      name: users.find((u) => u.id === a.user_id)?.full_name ?? a.user_id,
      time: new Date(a.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }))

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!token) return null

  return (
    <div className="notif-bell" ref={containerRef}>
      <button
        className="notif-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${late.length} late check-ins today`}
      >
        <Bell size={18} />
        {late.length > 0 && <span className="notif-badge" aria-live="polite">{late.length > 99 ? '99+' : late.length}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">Late today ({late.length})</div>
          {late.length === 0 ? (
            <div className="notif-empty">No late check-ins</div>
          ) : (
            late.map((row) => (
              <div className="notif-item" key={row.id}>
                <span className="notif-item-name">{row.name}</span>
                <span className="notif-item-time">{row.time}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
