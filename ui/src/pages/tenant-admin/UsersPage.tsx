import '@/styles/layout.css'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Users, UserPlus, Search, ScanFace, Shield, Edit2, Trash2, UserX, Eye, EyeOff } from 'lucide-react'
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  type UserOut,
  type UserCreate,
  type UserUpdate,
} from '@/api/adminApi'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/Toast'

// ── Badges ──────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'tenant_admin'
  return (
    <span className={isAdmin ? 'badge badge-blue' : 'badge badge-gray'}>
      {isAdmin && <Shield size={12} />}
      {isAdmin ? 'Admin' : 'Karyawan'}
    </span>
  )
}

function EnrolledBadge({ enrolled }: { enrolled: boolean }) {
  return (
    <span className={enrolled ? 'badge badge-green' : 'badge badge-gray'}>
      {enrolled ? 'Enrolled' : 'Belum Enrolled'}
    </span>
  )
}

// ── Create modal ─────────────────────────────────────────────────────────────

const initialForm: UserCreate = { full_name: '', username: '', password: '', role: 'end_user' }

function CreateUserModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (payload: UserCreate) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<UserCreate>(initialForm)
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Nama lengkap wajib diisi'); return }
    setSubmitting(true)
    setError(null)
    try {
      const payload: UserCreate = { full_name: form.full_name.trim(), role: form.role }
      if (form.username?.trim()) payload.username = form.username.trim()
      if (form.password) payload.password = form.password
      await onSubmit(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah pengguna')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Tambah Pengguna</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Nama Lengkap *</label>
            <input className="field-input" placeholder="Nama lengkap"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Username</label>
            <input className="field-input" placeholder="Username"
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="field">
            <label>Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                className="field-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Password"
                style={{ paddingRight: 40 }}
                value={form.password ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="field">
            <label>Role</label>
            <select className="field-input" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="end_user">Karyawan</option>
              <option value="tenant_admin">Admin</option>
            </select>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit modal ───────────────────────────────────────────────────────────────

function EditUserModal({
  user,
  onSubmit,
  onClose,
}: {
  user: UserOut
  onSubmit: (payload: UserUpdate) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<UserUpdate>({
    full_name: user.full_name,
    username: user.username ?? '',
    role: user.role,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name?.trim()) { setError('Nama lengkap wajib diisi'); return }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        full_name: form.full_name.trim(),
        role: form.role,
        username: form.username?.trim() || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah pengguna')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Pengguna</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Nama Lengkap *</label>
            <input className="field-input" placeholder="Nama lengkap"
              value={form.full_name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Username</label>
            <input className="field-input" placeholder="Username"
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="field">
            <label>Role</label>
            <select className="field-input" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="end_user">Karyawan</option>
              <option value="tenant_admin">Admin</option>
            </select>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteConfirmModal({
  user,
  onConfirm,
  onClose,
  loading,
}: {
  user: UserOut
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Hapus Pengguna</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          Yakin ingin menghapus <strong style={{ color: 'var(--color-text)' }}>{user.full_name}</strong>?
          Tindakan ini tidak bisa dibatalkan dan akan menghapus semua data absensi terkait.
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Batal</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Menghapus...' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function UsersPage() {
  const token = useAuthStore((s) => s.accessToken)
  const navigate = useNavigate()
  const location = useLocation()
  const { show } = useToast()
  // Derive base path from current route so this page works under both /tenant and /admin
  const basePath = location.pathname.startsWith('/admin') ? '/admin' : '/tenant'

  const [users, setUsers] = useState<UserOut[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<UserOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserOut | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function loadUsers() {
    if (!token) return
    setError(null)
    try {
      setUsers(await listUsers(token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengguna')
    }
  }

  useEffect(() => { void loadUsers() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    if (!users) return []
    const enrolled = users.filter((u) => u.enrolled).length
    return [
      { label: 'Total Pengguna', value: users.length, Icon: Users, color: 'var(--color-brand)', bg: 'rgba(13,148,136,0.08)' },
      { label: 'Sudah Enrolled', value: enrolled, Icon: ScanFace, color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
      { label: 'Belum Enrolled', value: users.length - enrolled, Icon: UserX, color: '#ca8a04', bg: 'rgba(202,138,4,0.08)' },
    ]
  }, [users])

  const filtered = useMemo(() => {
    if (!users) return []
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.full_name.toLowerCase().includes(q) || (u.username ?? '').toLowerCase().includes(q),
    )
  }, [users, search])

  async function handleCreate(payload: UserCreate) {
    if (!token) return
    await createUser(token, payload)
    show('Pengguna berhasil ditambahkan', 'success')
    setShowCreate(false)
    void loadUsers()
  }

  async function handleEdit(payload: UserUpdate) {
    if (!token || !editTarget) return
    await updateUser(token, editTarget.id, payload)
    show('Pengguna berhasil diperbarui', 'success')
    setEditTarget(null)
    void loadUsers()
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteUser(token, deleteTarget.id)
      show(`${deleteTarget.full_name} berhasil dihapus`, 'success')
      setDeleteTarget(null)
      void loadUsers()
    } catch (err) {
      show(err instanceof Error ? err.message : 'Gagal menghapus pengguna', 'error')
    } finally {
      setDeleting(false)
    }
  }

  function handleEnroll(user: UserOut) {
    navigate(`${basePath}/enrollment`, { state: { userId: user.id, userName: user.full_name } })
  }

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">Pengguna</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Kelola pengguna tenant
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <UserPlus size={16} /> Tambah Pengguna
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {users === null && !error
          ? [0, 1, 2].map((i) => (
              <div key={i} className="stat-card">
                <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton skeleton-text" style={{ width: '40%', marginBottom: 6 }} />
                  <div className="skeleton skeleton-text sm" />
                </div>
              </div>
            ))
          : stats.map(({ label, value, Icon, color, bg }) => (
              <div key={label} className="stat-card">
                <div className="stat-icon" style={{ background: bg }}>
                  <Icon size={20} color={color} />
                </div>
                <div>
                  <div className="stat-value">{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
              </div>
            ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Search */}
      <div className="search-input-wrap" style={{ maxWidth: 360, marginBottom: 16 }}>
        <Search size={16} />
        <input
          className="search-input"
          placeholder="Cari pengguna..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status Enrolled</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users === null && !error && [0, 1, 2, 3, 4].map((i) => (
              <tr key={i}>
                <td><div className="skeleton skeleton-text" style={{ width: '55%' }} /></td>
                <td><div className="skeleton skeleton-text sm" /></td>
                <td><div className="skeleton skeleton-badge" /></td>
                <td><div className="skeleton skeleton-badge" /></td>
                <td><div className="skeleton skeleton-text" style={{ width: 80, marginLeft: 'auto' }} /></td>
              </tr>
            ))}

            {users !== null && filtered.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <Users size={36} color="var(--color-text-muted)" style={{ marginBottom: 10 }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>
                      {users.length === 0 ? 'Belum ada pengguna' : 'Tidak ada pengguna yang cocok'}
                    </p>
                    {users.length === 0 && (
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)' }}>
                        Klik "Tambah Pengguna" untuk menambahkan karyawan pertama.
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {users !== null && filtered.map((row) => (
              <tr key={row.id}>
                <td style={{ fontWeight: 500 }}>{row.full_name}</td>
                <td style={{ color: 'var(--color-text-secondary)' }}>{row.username ?? '-'}</td>
                <td><RoleBadge role={row.role} /></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EnrolledBadge enrolled={row.enrolled} />
                    {!row.enrolled && (
                      <span style={{ fontSize: 11, color: 'var(--color-brand)', cursor: 'pointer', fontWeight: 500 }} onClick={() => handleEnroll(row)}>
                        Enroll →
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      className="btn-icon"
                      title="Edit pengguna"
                      onClick={() => setEditTarget(row)}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="btn-icon btn-icon-primary"
                      title={row.enrolled ? 'Update enrollment wajah' : 'Enroll wajah'}
                      onClick={() => handleEnroll(row)}
                    >
                      <ScanFace size={15} />
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      title="Hapus pengguna"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <EditUserModal user={editTarget} onSubmit={handleEdit} onClose={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          user={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
