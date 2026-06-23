import { useEffect, useState } from 'react'
import { CalendarDays, Plus, Clock, Edit2, Trash2, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/Toast'
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  type ScheduleOut,
  type ScheduleCreate,
  type SessionRule,
  type ScheduleRules,
} from '@/api/adminApi'
import '@/styles/layout.css'

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`badge ${active ? 'badge-blue' : 'badge-gray'}`}>
      {active ? 'Default' : 'Normal'}
    </span>
  )
}

interface ScheduleFormProps {
  onSubmit: (payload: { name: string; rules: ScheduleRules; grace_minutes: number }) => void
  onCancel: () => void
  submitting: boolean
  initial?: ScheduleOut
}

const DEFAULT_SESSION: SessionRule = { name: 'Sesi 1', start: '07:30', end: '09:00' }

function ScheduleFormFields({
  scheduleType, setScheduleType,
  workdayStart, setWorkdayStart,
  workdayEnd, setWorkdayEnd,
  graceMinutes, setGraceMinutes,
  sessions, setSessions,
}: {
  scheduleType: 'shift' | 'session'
  setScheduleType: (t: 'shift' | 'session') => void
  workdayStart: string; setWorkdayStart: (v: string) => void
  workdayEnd: string; setWorkdayEnd: (v: string) => void
  graceMinutes: number; setGraceMinutes: (v: number) => void
  sessions: SessionRule[]; setSessions: (s: SessionRule[]) => void
}) {
  function updateSession(i: number, key: keyof SessionRule, val: string) {
    setSessions(sessions.map((s, idx) => idx === i ? { ...s, [key]: val } : s))
  }
  return (
    <>
      <div className="schedule-type-row">
        {(['shift', 'session'] as const).map((t) => (
          <button key={t} type="button"
            className={`schedule-type-btn${scheduleType === t ? ' schedule-type-btn--active' : ''}`}
            onClick={() => setScheduleType(t)}
          >
            {t === 'shift' ? 'Shift Harian' : 'Sesi / Periode'}
          </button>
        ))}
      </div>

      {scheduleType === 'shift' ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="schedule-form-field">Jam Masuk
            <input className="field-input" type="time" value={workdayStart} onChange={(e) => setWorkdayStart(e.target.value)} required />
          </label>
          <label className="schedule-form-field">Jam Pulang
            <input className="field-input" type="time" value={workdayEnd} onChange={(e) => setWorkdayEnd(e.target.value)} required />
          </label>
        </div>
      ) : (
        <div className="session-list">
          {sessions.map((s, i) => (
            <div key={i} className="session-row">
              <input className="field-input" placeholder="Nama sesi" value={s.name} onChange={(e) => updateSession(i, 'name', e.target.value)} required />
              <input className="field-input" type="time" value={s.start} onChange={(e) => updateSession(i, 'start', e.target.value)} required />
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>–</span>
              <input className="field-input" type="time" value={s.end} onChange={(e) => updateSession(i, 'end', e.target.value)} required />
              {sessions.length > 1 && (
                <button type="button" className="btn-icon btn-icon-danger" onClick={() => setSessions(sessions.filter((_, j) => j !== i))}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSessions([...sessions, { name: `Sesi ${sessions.length + 1}`, start: '07:00', end: '08:30' }])}>
            <Plus size={14} /> Tambah Sesi
          </button>
        </div>
      )}

      <label className="schedule-form-field" style={{ width: 140 }}>
        Toleransi (menit)
        <input className="field-input" type="number" min={0} value={graceMinutes} onChange={(e) => setGraceMinutes(Number(e.target.value))} required />
      </label>
    </>
  )
}

function ScheduleForm({ onSubmit, onCancel, submitting }: ScheduleFormProps) {
  const [name, setName] = useState('')
  const [scheduleType, setScheduleType] = useState<'shift' | 'session'>('shift')
  const [workdayStart, setWorkdayStart] = useState('08:00')
  const [workdayEnd, setWorkdayEnd] = useState('17:00')
  const [graceMinutes, setGraceMinutes] = useState(15)
  const [sessions, setSessions] = useState<SessionRule[]>([DEFAULT_SESSION])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const rules: ScheduleRules = scheduleType === 'shift'
      ? { type: 'shift', workday_start: workdayStart, workday_end: workdayEnd }
      : { type: 'session', sessions }
    onSubmit({ name: name.trim(), rules, grace_minutes: graceMinutes })
  }

  return (
    <form onSubmit={handleSubmit} className="data-card" style={{ padding: '20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label className="schedule-form-field">Nama Jadwal
        <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Shift Pagi / Sesi Pagi" required />
      </label>
      <ScheduleFormFields {...{ scheduleType, setScheduleType, workdayStart, setWorkdayStart, workdayEnd, setWorkdayEnd, graceMinutes, setGraceMinutes, sessions, setSessions }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>{submitting ? 'Menyimpan...' : 'Simpan'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Batal</button>
      </div>
    </form>
  )
}

function EditScheduleModal({ schedule, onSubmit, onClose, submitting }: {
  schedule: ScheduleOut
  onSubmit: (payload: Partial<ScheduleCreate>) => void
  onClose: () => void
  submitting: boolean
}) {
  const [name, setName] = useState(schedule.name)
  const [scheduleType, setScheduleType] = useState<'shift' | 'session'>(schedule.rules.type === 'session' ? 'session' : 'shift')
  const [workdayStart, setWorkdayStart] = useState(schedule.rules.workday_start ?? '08:00')
  const [workdayEnd, setWorkdayEnd] = useState(schedule.rules.workday_end ?? '17:00')
  const [graceMinutes, setGraceMinutes] = useState(schedule.grace_minutes)
  const [sessions, setSessions] = useState<SessionRule[]>(schedule.rules.sessions ?? [DEFAULT_SESSION])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const rules: ScheduleRules = scheduleType === 'shift'
      ? { type: 'shift', workday_start: workdayStart, workday_end: workdayEnd }
      : { type: 'session', sessions }
    onSubmit({ name: name.trim(), rules, grace_minutes: graceMinutes })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Jadwal</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field"><label>Nama Jadwal</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <ScheduleFormFields {...{ scheduleType, setScheduleType, workdayStart, setWorkdayStart, workdayEnd, setWorkdayEnd, graceMinutes, setGraceMinutes, sessions, setSessions }} />
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>{submitting ? 'Menyimpan...' : 'Simpan'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteScheduleModal({ schedule, onConfirm, onClose, loading }: {
  schedule: ScheduleOut
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Hapus Jadwal</h3>
        <p className="confirm-text">Yakin ingin menghapus jadwal <strong style={{ color: 'var(--color-text)' }}>{schedule.name}</strong>? Tindakan ini tidak dapat dibatalkan.</p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Batal</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>{loading ? 'Menghapus...' : 'Hapus'}</button>
        </div>
      </div>
    </div>
  )
}

export function SchedulesPage() {
  const token = useAuthStore((s) => s.accessToken)
  const { show } = useToast()
  const [schedules, setSchedules] = useState<ScheduleOut[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editTarget, setEditTarget] = useState<ScheduleOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduleOut | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)

  async function loadSchedules(authToken: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await listSchedules(authToken)
      setSchedules(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat jadwal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    void loadSchedules(token)
  }, [token])

  async function handleCreate(payload: { name: string; rules: ScheduleRules; grace_minutes: number }) {
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      await createSchedule(token, payload)
      setShowForm(false)
      show('Jadwal berhasil disimpan', 'success')
      await loadSchedules(token)
    } catch (err) {
      show(err instanceof Error ? err.message : 'Gagal menyimpan jadwal', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(payload: Partial<ScheduleCreate>) {
    if (!token || !editTarget) return
    setEditSubmitting(true)
    try {
      const updated = await updateSchedule(token, editTarget.id, payload)
      setSchedules((prev) => prev.map((s) => s.id === updated.id ? updated : s))
      setEditTarget(null)
      show('Jadwal berhasil diperbarui', 'success')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Gagal memperbarui jadwal', 'error')
    } finally {
      setEditSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteSchedule(token, deleteTarget.id)
      setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
      show('Jadwal berhasil dihapus', 'success')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Gagal menghapus jadwal', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="page-toolbar" style={{ marginBottom: '1.5rem' }}>
        <h2 className="page-title">Jadwal Kerja</h2>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Tambah Jadwal
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <ScheduleForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          submitting={submitting}
        />
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="data-card"
              style={{ padding: '16px 20px', display: 'flex', gap: 16 }}
            >
              <div className="skeleton skeleton-text" style={{ flex: 2 }} />
              <div className="skeleton skeleton-text" style={{ flex: 1 }} />
              <div className="skeleton skeleton-text" style={{ flex: 1 }} />
              <div className="skeleton skeleton-badge" />
            </div>
          ))}
        </div>
      )}

      {!loading && schedules.length === 0 && (
        <div className="data-card">
          <div className="empty-state">
            <CalendarDays size={40} color="var(--color-text-muted)" style={{ marginBottom: 12 }} />
            <p style={{ margin: 0, fontWeight: 500 }}>Belum ada jadwal</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
              Klik "Tambah Jadwal" di atas untuk membuat jadwal kerja pertama.
            </p>
          </div>
        </div>
      )}

      {!loading && schedules.length > 0 && (
        <div>
          {schedules.map((s) => (
            <div key={s.id} className="data-card schedule-row">
              <div className="schedule-row-name">
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.name}
                  <span className={`badge ${s.rules.type === 'session' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: 10, padding: '1px 7px' }}>
                    {s.rules.type === 'session' ? 'Sesi' : 'Shift'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {s.rules.type === 'session' ? `${s.rules.sessions?.length ?? 0} sesi` : (s.rules.work_days ?? 'Sen - Jum')}
                </div>
              </div>

              <div className="schedule-row-time">
                <Clock size={15} />
                {s.rules.type === 'session' && s.rules.sessions?.length
                  ? `${s.rules.sessions[0].start} – ${s.rules.sessions[s.rules.sessions.length - 1].end}`
                  : `${s.rules.workday_start ?? '--:--'} – ${s.rules.workday_end ?? '--:--'}`}
              </div>

              <div className="schedule-row-grace">
                Toleransi: {s.grace_minutes} menit
              </div>

              <div className="schedule-row-badge">
                <StatusBadge active={s.is_default} />
              </div>

              <div className="schedule-row-actions">
                <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEditTarget(s)}>
                  <Edit2 size={16} />
                </button>
                <button className="btn btn-danger btn-sm" title="Hapus" onClick={() => setDeleteTarget(s)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <EditScheduleModal
          schedule={editTarget}
          onSubmit={handleEdit}
          onClose={() => setEditTarget(null)}
          submitting={editSubmitting}
        />
      )}
      {deleteTarget && (
        <DeleteScheduleModal
          schedule={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
