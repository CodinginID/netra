import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { listAttendance, listUsers } from '@/api/adminApi'

interface LateArrival {
  id: string
  name: string
  time: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function NotificationBell() {
  const token = useAuthStore((s) => s.accessToken)
  const [open, setOpen] = useState(false)
  const [late, setLate] = useState<LateArrival[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      try {
        const date = today()
        const [attendance, users] = await Promise.all([
          listAttendance(token!, { from: date, to: date }),
          listUsers(token!),
        ])
        if (cancelled) return
        const names = new Map(users.map((u) => [u.id, u.full_name || u.username || u.id]))
        const rows = attendance
          .filter((a) => a.status === 'late' && a.type === 'check_in')
          .map((a) => ({
            id: a.id,
            name: names.get(a.user_id) ?? a.user_id,
            time: new Date(a.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }))
        setLate(rows)
      } catch {
        /* network/auth errors — keep last known state */
      }
    }

    load()
    const interval = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token])

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
        {late.length > 0 && <span className="notif-badge">{late.length > 99 ? '99+' : late.length}</span>}
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
