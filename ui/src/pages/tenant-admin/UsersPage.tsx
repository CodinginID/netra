import '@/styles/layout.css'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Users, UserPlus, Search, ScanFace, Shield, Edit2, Trash2, UserX, Eye, EyeOff } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useUsers } from '@/hooks/useApiQueries'
import { useCreateUser, useUpdateUser, useDeleteUser, useRestoreUser } from '@/hooks/useApiMutations'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { Pagination } from '@/components/Pagination'
import { SwipeCard } from '@/components/SwipeCard'
import { PullToRefresh } from '@/components/PullToRefresh'
import { MobileFab } from '@/components/MobileFab'
import { ExpandableCard } from '@/components/ExpandableCard'
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack'
import type { UserOut, UserCreate, UserUpdate } from '@/api/adminApi'

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

const initialForm: UserCreate = {
  full_name: '',
  username: '',
  email: '',
  external_id: '',
  password: '',
  role: 'end_user',
}

const STAFF_ROLES = ['tenant_admin', 'supervisor']

function CreateUserModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (payload: UserCreate) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<UserCreate>(initialForm)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const isStaff = STAFF_ROLES.includes(form.role ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Nama lengkap wajib diisi'); return }
    if (isStaff) {
      // Staff log in by email — email + password required.
      if (!form.email?.trim()) { setError('Email wajib untuk admin/supervisor'); return }
      if (!form.password || form.password.length < 8) { setError('Password minimal 8 karakter'); return }
    } else {
      // End users are matched to client systems by external_id (NIS/NIP/NIK).
      if (!form.external_id?.trim()) { setError('ID unik (NIS/NIP/NIK) wajib untuk karyawan/siswa'); return }
    }
    setError(null)
    const payload: UserCreate = { full_name: form.full_name.trim(), role: form.role }
    if (form.username?.trim()) payload.username = form.username.trim()
    if (isStaff) {
      payload.email = form.email!.trim().toLowerCase()
      payload.password = form.password
    } else {
      payload.external_id = form.external_id!.trim()
    }
    onSubmit(payload)
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Tambah Pengguna</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="create-full-name">Nama Lengkap *</label>
            <input id="create-full-name" className="field-input" placeholder="Nama lengkap"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="create-role">Role</label>
            <select id="create-role" className="field-input" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="end_user">Karyawan / Siswa</option>
              <option value="supervisor">Supervisor</option>
              <option value="tenant_admin">Admin</option>
            </select>
          </div>

          {!isStaff && (
            <div className="field">
              <label htmlFor="create-external-id">ID Unik (NIS/NIP/NIK) *</label>
              <input id="create-external-id" className="field-input" placeholder="mis. 1023456"
                value={form.external_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))} required />
            </div>
          )}

          {isStaff && (
            <>
              <div className="field">
                <label htmlFor="create-email">Email * <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>(untuk login)</span></label>
                <input id="create-email" className="field-input" type="email" placeholder="admin@organisasi.com"
                  value={form.email ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="field">
                <label htmlFor="create-password">Password *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="create-password"
                    className="field-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Minimal 8 karakter"
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
            </>
          )}

          <div className="field">
            <label htmlFor="create-username">Username <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>(opsional)</span></label>
            <input id="create-username" className="field-input" placeholder="Username (opsional)"
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary">Simpan</button>
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
  onSubmit: (payload: { userId: string; payload: UserUpdate }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<UserUpdate>({
    full_name: user.full_name,
    username: user.username ?? '',
    role: user.role,
  })
  const [error, setError] = useState<string | null>(null)
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name?.trim()) { setError('Nama lengkap wajib diisi'); return }
    setError(null)
    onSubmit({
      userId: user.id,
      payload: {
        full_name: form.full_name.trim(),
        role: form.role,
        username: form.username?.trim() || undefined,
      },
    })
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Edit Pengguna</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="edit-full-name">Nama Lengkap *</label>
            <input id="edit-full-name" className="field-input" placeholder="Nama lengkap"
              value={form.full_name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="edit-username">Username</label>
            <input id="edit-username" className="field-input" placeholder="Username"
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="edit-role">Role</label>
            <select id="edit-role" className="field-input" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="end_user">Karyawan</option>
              <option value="tenant_admin">Admin</option>
            </select>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary">Simpan Perubahan</button>
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
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Hapus Pengguna</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          Yakin hapus <strong style={{ color: 'var(--color-text)' }}>{user.full_name}</strong>? Data dapat dipulihkan dari Tempat Sampah dalam 30 hari.
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
  const navigate = useNavigate()
  const location = useLocation()
  const { show } = useToast()
  useEdgeSwipeBack() // 3.5 — swipe from the left edge to go back (mobile)
  // Derive base path from current route so this page works under both /tenant and /admin
  const basePath = location.pathname.startsWith('/admin') ? '/admin' : '/tenant'

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchParam, setSearchParam] = useState('')
  const [sortKey, setSortKey] = useState<'full_name' | 'role' | 'enrolled'>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<UserOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserOut | null>(null)

  // Debounced server-side search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearchParam(value.trim())
      setPage(1)
    }, 300)
  }, [])

  // React Query
  const { data: paginatedUsers, isLoading, error, refetch } = useUsers({ page, limit, search: searchParam || undefined })
  const users = paginatedUsers?.items ?? null
  const total = paginatedUsers?.total ?? 0
  const pages = paginatedUsers?.pages ?? 1

  const closeModal = useCallback(() => {
    setShowCreate(false)
    setEditTarget(null)
  }, [])

  const createMutation = useCreateUser(() => {
    closeModal()
    show('Pengguna berhasil ditambahkan', 'success')
  })

  const updateMutation = useUpdateUser(() => {
    closeModal()
    show('Pengguna berhasil diperbarui', 'success')
  })

  const deleteMutation = useDeleteUser(() => {
    setDeleteTarget(null)
    show(`${deletedUserName} berhasil dihapus`, 'success', {
      label: 'Undo',
      onClick: () => restoreMutation.mutate(deletedUserId),
    })
  })

  const restoreMutation = useRestoreUser(() => {
    show('Pengguna berhasil dipulihkan', 'success')
  })

  // Capture delete target info for the undo toast callback
  const [deletedUserId, setDeletedUserId] = useState('')
  const [deletedUserName, setDeletedUserName] = useState('')

  function handleCreate(payload: UserCreate) {
    createMutation.mutate(payload)
  }

  function handleEdit(userId: string, payload: UserUpdate) {
    updateMutation.mutate({ userId, payload })
  }

  function handleDelete() {
    if (!deleteTarget) return
    setDeletedUserId(deleteTarget.id)
    setDeletedUserName(deleteTarget.full_name)
    deleteMutation.mutate(deleteTarget.id)
  }

  function handleEnroll(user: UserOut) {
    navigate(`${basePath}/enrollment`, { state: { userId: user.id, userName: user.full_name } })
  }

  const enrolledCount = users ? users.filter((u) => u.enrolled).length : 0
  const notEnrolledCount = users ? users.length - enrolledCount : 0

  const sorted = useMemo(() => {
    if (!users) return users
    return [...users].sort((a, b) => {
      let av: string, bv: string
      if (sortKey === 'full_name') { av = a.full_name ?? ''; bv = b.full_name ?? '' }
      else if (sortKey === 'role') { av = a.role; bv = b.role }
      else { av = a.enrolled ? '1' : '0'; bv = b.enrolled ? '1' : '0' }
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [users, sortKey, sortDir])

  function toggleSort(key: 'full_name' | 'role' | 'enrolled') {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortGlyph = (key: 'full_name' | 'role' | 'enrolled') =>
    sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">Pengguna</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Kelola pengguna tenant
          </p>
        </div>
        <button className="btn btn-primary add-fab-twin" onClick={() => setShowCreate(true)}>
          <UserPlus size={16} /> Tambah Pengguna
        </button>
      </div>

      {/* Stat cards */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {isLoading && !error
          ? [0, 1, 2].map((i) => (
              <div key={i} className="stat-card">
                <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton skeleton-text" style={{ width: '40%', marginBottom: 6 }} />
                  <div className="skeleton skeleton-text sm" />
                </div>
              </div>
            ))
          : [
              { label: 'Total Pengguna', value: total, Icon: Users, color: 'var(--color-brand)', bg: 'rgba(13,148,136,0.08)' },
              { label: 'Sudah Enrolled', value: enrolledCount, Icon: ScanFace, color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
              { label: 'Belum Enrolled', value: notEnrolledCount, Icon: UserX, color: '#ca8a04', bg: 'rgba(202,138,4,0.08)' },
            ].map(({ label, value, Icon, color, bg }) => (
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

      {error && <div className="error-banner">{error instanceof Error ? error.message : 'Gagal memuat pengguna'}</div>}

      {/* Search */}
      <div className="search-input-wrap" style={{ maxWidth: 360, marginBottom: 16 }}>
        <Search size={16} />
        <input
          className="search-input"
          placeholder="Cari pengguna..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Cari pengguna"
        />
      </div>

      {/* Table — desktop */}
      <div className="data-card users-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('full_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Nama {sortGlyph('full_name')}
              </th>
              <th>Username</th>
              <th onClick={() => toggleSort('role')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Role {sortGlyph('role')}
              </th>
              <th onClick={() => toggleSort('enrolled')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                Status Enrolled {sortGlyph('enrolled')}
              </th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !error && [0, 1, 2, 3, 4].map((i) => (
              <tr key={i}>
                <td><div className="skeleton skeleton-text" style={{ width: '55%' }} /></td>
                <td><div className="skeleton skeleton-text sm" /></td>
                <td><div className="skeleton skeleton-badge" /></td>
                <td><div className="skeleton skeleton-badge" /></td>
                <td><div className="skeleton skeleton-text" style={{ width: 80, marginLeft: 'auto' }} /></td>
              </tr>
            ))}

            {!isLoading && users !== null && users.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon="users"
                    title="Belum ada pengguna"
                    description="Tambahkan pengguna pertama Anda untuk mulai mengelola absensi"
                    action={
                      <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        Tambah Pengguna
                      </button>
                    }
                  />
                </td>
              </tr>
            )}

            {sorted !== null && sorted.length > 0 && sorted.map((row) => (
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
                      aria-label="Ubah pengguna"
                      onClick={() => setEditTarget(row)}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="btn-icon btn-icon-primary"
                      title={row.enrolled ? 'Update enrollment wajah' : 'Enroll wajah'}
                      aria-label={row.enrolled ? 'Update enrollment wajah' : 'Enroll wajah'}
                      onClick={() => handleEnroll(row)}
                    >
                      <ScanFace size={15} />
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      title="Hapus pengguna"
                      aria-label="Hapus pengguna"
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
        {!isLoading && users !== null && (
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        )}
      </div>

      {/* Card list — mobile (swipe actions + pull-to-refresh + expandable detail) */}
      {!isLoading && sorted !== null && sorted.length > 0 && (
        <PullToRefresh onRefresh={() => refetch()}>
          <div className="users-card-list">
            {sorted.map((row) => (
              <SwipeCard
                key={row.id}
                left={{ icon: <Edit2 size={20} />, label: 'Edit', variant: 'primary', onAction: () => setEditTarget(row) }}
                right={{ icon: <Trash2 size={20} />, label: 'Hapus', variant: 'danger', onAction: () => setDeleteTarget(row) }}
              >
                <ExpandableCard
                  header={
                    <div>
                      <div className="user-card-title">{row.full_name}</div>
                      <div className="user-card-badges">
                        <RoleBadge role={row.role} />
                        <EnrolledBadge enrolled={row.enrolled} />
                      </div>
                    </div>
                  }
                >
                  <div className="user-card-detail-row">
                    <span className="label">Username</span>
                    <span className="value">{row.username ?? '-'}</span>
                  </div>
                  <div className="user-card-detail-row">
                    <span className="label">Role</span>
                    <span className="value"><RoleBadge role={row.role} /></span>
                  </div>
                  <div className="user-card-detail-row">
                    <span className="label">Status Enrolled</span>
                    <span className="value"><EnrolledBadge enrolled={row.enrolled} /></span>
                  </div>
                  <div className="user-card-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(row)}>
                      <Edit2 size={15} /> Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleEnroll(row)}>
                      <ScanFace size={15} /> {row.enrolled ? 'Update' : 'Enroll'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(row)}>
                      <Trash2 size={15} /> Hapus
                    </button>
                  </div>
                </ExpandableCard>
              </SwipeCard>
            ))}
          </div>
          <div className="users-card-list">
            <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
          </div>
        </PullToRefresh>
      )}

      <MobileFab onClick={() => setShowCreate(true)} label="Tambah Pengguna">
        <UserPlus size={24} />
      </MobileFab>

      {showCreate && (
        <CreateUserModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <EditUserModal user={editTarget} onSubmit={(p) => handleEdit(p.userId, p.payload)} onClose={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          user={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
