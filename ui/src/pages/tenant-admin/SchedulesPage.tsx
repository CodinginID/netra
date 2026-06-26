import { useState } from 'react'
import { Plus, Clock, Edit2, Trash2, X } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import {
  type ScheduleOut,
  type ScheduleCreate,
  type SessionRule,
  type ScheduleRules,
} from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { useSchedules } from '@/hooks/useApiQueries'
import { useCreateSchedule, useUpdateSchedule, useDeleteSchedule, useRestoreSchedule } from '@/hooks/useApiMutations'
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
              <input className="field-input" placeholder="Nama sesi" value={s.name} onChange={(e) => updateSession(i, 'name', e.target.value)} required aria-label={`Nama sesi ${i + 1}`} />
              <input className="field-input" type="time" value={s.start} onChange={(e) => updateSession(i, 'start', e.target.value)} required aria-label={`Waktu mulai sesi ${i + 1}`} />
              <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>–</span>
              <input className="field-input" type="time" value={s.end} onChange={(e) => updateSession(i, 'end', e.target.value)} required aria-label={`Waktu selesai sesi ${i + 1}`} />
              {sessions.length > 1 && (
                <button type="button" className="btn-icon btn-icon-danger" aria-label="Hapus sesi" onClick={() => setSessions(sessions.filter((_, j) => j !== i))}>
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
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const rules: ScheduleRules = scheduleType === 'shift'
      ? { type: 'shift', workday_start: workdayStart, workday_end: workdayEnd }
      : { type: 'session', sessions }
    onSubmit({ name: name.trim(), rules, grace_minutes: graceMinutes })
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Jadwal</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field"><label htmlFor="edit-schedule-name">Nama Jadwal</label>
            <input id="edit-schedule-name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} required />
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
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Hapus Jadwal</h3>
        <p className="confirm-text">Yakin hapus jadwal <strong style={{ color: 'var(--color-text)' }}>{schedule.name}</strong>? Data dapat dipulihkan dalam 30 hari.</p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Batal</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>{loading ? 'Menghapus...' : 'Hapus'}</button>
        </div>
      </div>
    </div>
  )
}

export function SchedulesPage() {
  const { show } = useToast()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<ScheduleOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScheduleOut | null>(null)

  const { data: paginatedSchedules, isLoading, error } = useSchedules({ page, limit })
  const schedules = paginatedSchedules?.items ?? []
  const total = paginatedSchedules?.total ?? 0
  const pages = paginatedSchedules?.pages ?? 0

  const createMutation = useCreateSchedule(() => {
    setShowForm(false)
    show('Jadwal berhasil disimpan', 'success')
  })

  const updateMutation = useUpdateSchedule(() => {
    setEditTarget(null)
    show('Jadwal berhasil diperbarui', 'success')
  })

  const deleteMutation = useDeleteSchedule()
  const restoreMutation = useRestoreSchedule()

  function handleCreate(payload: { name: string; rules: ScheduleRules; grace_minutes: number }) {
    createMutation.mutate(payload, {
      onError: (err) => {
        show(err instanceof Error ? err.message : 'Gagal menyimpan jadwal', 'error')
      },
    })
  }

  function handleEdit(payload: Partial<ScheduleCreate>) {
    if (!editTarget) return
    updateMutation.mutate({ scheduleId: editTarget.id, payload }, {
      onError: (err) => {
        show(err instanceof Error ? err.message : 'Gagal memperbarui jadwal', 'error')
      },
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    const deletedSchedule = { ...deleteTarget }
    deleteMutation.mutate(deletedSchedule.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        show(`${deletedSchedule.name} berhasil dihapus`, 'success', {
          label: 'Undo',
          onClick: () => {
            restoreMutation.mutate(deletedSchedule.id, {
              onError: () => {
                show('Gagal membatalkan penghapusan', 'error')
              },
            })
          },
        })
      },
      onError: (err) => {
        show(err instanceof Error ? err.message : 'Gagal menghapus jadwal', 'error')
      },
    })
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

      {error && <div className="error-banner">{error.message}</div>}

      {showForm && (
        <ScheduleForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          submitting={createMutation.isPending}
        />
      )}

      {isLoading && (
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

      {!isLoading && schedules.length === 0 && (
        <div className="data-card">
          <EmptyState
            icon="calendar"
            title="Belum ada jadwal"
            description="Buat jadwal kehadiran default untuk tenant Anda"
            action={
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                Tambah Jadwal
              </button>
            }
          />
        </div>
      )}

      {!isLoading && schedules.length > 0 && (
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
                <button className="btn btn-ghost btn-sm" title="Edit" aria-label="Ubah jadwal" onClick={() => setEditTarget(s)}>
                  <Edit2 size={16} />
                </button>
                <button className="btn btn-danger btn-sm" title="Hapus" aria-label="Hapus jadwal" onClick={() => setDeleteTarget(s)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        </div>
      )}

      {editTarget && (
        <EditScheduleModal
          schedule={editTarget}
          onSubmit={handleEdit}
          onClose={() => setEditTarget(null)}
          submitting={updateMutation.isPending}
        />
      )}
      {deleteTarget && (
        <DeleteScheduleModal
          schedule={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
