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
import { useI18n, t as tFn } from '@/store/i18nStore'
import type { UserOut, UserCreate, UserUpdate } from '@/api/adminApi'

// ── Badges ──────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'tenant_admin'
  return (
    <span className={isAdmin ? 'badge badge-blue' : 'badge badge-gray'}>
      {isAdmin && <Shield size={12} />}
      {isAdmin ? tFn('users.role_admin') : tFn('users.role_employee')}
    </span>
  )
}

function EnrolledBadge({ enrolled }: { enrolled: boolean }) {
  return (
    <span className={enrolled ? 'badge badge-green' : 'badge badge-gray'}>
      {enrolled ? tFn('users.enrolled') : tFn('users.not_enrolled')}
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
  const { t } = useI18n()
  const [form, setForm] = useState<UserCreate>(initialForm)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const isStaff = STAFF_ROLES.includes(form.role ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError(t('users.full_name_required')); return }
    if (isStaff) {
      if (!form.email?.trim()) { setError(t('users.email_required')); return }
      if (!form.password || form.password.length < 8) { setError(t('users.password_min')); return }
    } else {
      if (!form.external_id?.trim()) { setError(t('users.unique_id_required')); return }
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
        <h3 className="modal-title">{t('users.create_title')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="create-full-name">{t('users.full_name_label')}</label>
            <input id="create-full-name" className="field-input" placeholder={t('users.full_name_placeholder')}
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="create-role">{t('users.role_label')}</label>
            <select id="create-role" className="field-input" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="end_user">{t('users.role_employee_student')}</option>
              <option value="supervisor">{t('users.role_supervisor')}</option>
              <option value="tenant_admin">{t('users.role_admin_option')}</option>
            </select>
          </div>

          {!isStaff && (
            <div className="field">
              <label htmlFor="create-external-id">{t('users.unique_id_label')}</label>
              <input id="create-external-id" className="field-input" placeholder={t('users.unique_id_placeholder')}
                value={form.external_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))} required />
            </div>
          )}

          {isStaff && (
            <>
              <div className="field">
                <label htmlFor="create-email">{t('users.email_label')} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('users.email_note')}</span></label>
                <input id="create-email" className="field-input" type="email" placeholder={t('users.email_placeholder')}
                  value={form.email ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="field">
                <label htmlFor="create-password">{t('users.password_label')}</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="create-password"
                    className="field-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder={t('users.password_placeholder')}
                    style={{ paddingRight: 40 }}
                    value={form.password ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    aria-label={showPw ? t('users.hide_password') : t('users.show_password')}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="create-username">{t('users.username_label')} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('users.username_optional')}</span></label>
            <input id="create-username" className="field-input" placeholder={t('users.username_placeholder')}
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('users.cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('users.save')}</button>
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
  const { t } = useI18n()
  const [form, setForm] = useState<UserUpdate>({
    full_name: user.full_name,
    username: user.username ?? '',
    role: user.role,
  })
  const [error, setError] = useState<string | null>(null)
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name?.trim()) { setError(t('users.full_name_required')); return }
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
        <h3 className="modal-title">{t('users.edit_title')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="edit-full-name">{t('users.full_name_label')}</label>
            <input id="edit-full-name" className="field-input" placeholder={t('users.full_name_placeholder')}
              value={form.full_name ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label htmlFor="edit-username">{t('users.username_label')}</label>
            <input id="edit-username" className="field-input" placeholder={t('users.username_label')}
              value={form.username ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="edit-role">{t('users.role_label')}</label>
            <select id="edit-role" className="field-input" value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="end_user">{t('users.role_employee')}</option>
              <option value="tenant_admin">{t('users.role_admin')}</option>
            </select>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('users.cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('users.save_changes')}</button>
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
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('users.delete_title')}</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          {t('users.delete_confirm', { name: user.full_name })}
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? t('common.deleting') : t('common.delete')}
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
  const { t } = useI18n()
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
    show(t('users.toast_created'), 'success')
  })

  const updateMutation = useUpdateUser(() => {
    closeModal()
    show(t('users.toast_updated'), 'success')
  })

  const deleteMutation = useDeleteUser(() => {
    setDeleteTarget(null)
    show(t('users.toast_deleted', { name: deletedUserName }), 'success', {
      label: t('common.undo'),
      onClick: () => restoreMutation.mutate(deletedUserId),
    })
  })

  const restoreMutation = useRestoreUser(() => {
    show(t('users.toast_restored'), 'success')
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
          <h2 className="page-title">{t('users.title')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('users.subtitle')}
          </p>
        </div>
        <button className="btn btn-primary add-fab-twin" onClick={() => setShowCreate(true)}>
          <UserPlus size={16} /> {t('users.add')}
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
              { label: t('users.stat_total'), value: total, Icon: Users, color: 'var(--color-brand)', bg: 'rgba(13,148,136,0.08)' },
              { label: t('users.stat_enrolled'), value: enrolledCount, Icon: ScanFace, color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
              { label: t('users.stat_not_enrolled'), value: notEnrolledCount, Icon: UserX, color: '#ca8a04', bg: 'rgba(202,138,4,0.08)' },
            ].map(({ label, value, Icon, color, bg }) => (
              <div key={label} className="stat-card">
                <div className="stat-icon" style={{ background: bg }}>
                  <Icon size={20} color={color} />
                </div>
                <div>
                  <div className="stat-value">{value}</div>
                  <div className="stat-label">{t('stat.total_users')}</div>
                </div>
              </div>
            ))}
      </div>

      {error && <div className="error-banner">{error instanceof Error ? error.message : t('users.load_error')}</div>}

      {/* Search */}
      <div className="search-input-wrap" style={{ maxWidth: 360, marginBottom: 16 }}>
        <Search size={16} />
        <input
          className="search-input"
          placeholder={t('users.search_placeholder')}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label={t('users.search_label')}
        />
      </div>

      {/* Table — desktop */}
      <div className="data-card users-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('full_name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                {t('users.th_name')} {sortGlyph('full_name')}
              </th>
              <th>{t('users.th_username')}</th>
              <th onClick={() => toggleSort('role')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                {t('users.th_role')} {sortGlyph('role')}
              </th>
              <th onClick={() => toggleSort('enrolled')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                {t('users.th_enrolled_status')} {sortGlyph('enrolled')}
              </th>
              <th style={{ textAlign: 'right' }}>{t('users.th_actions')}</th>
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
                    title={t('users.empty')}
                    description={t('users.empty_desc')}
                    action={
                      <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                        {t('users.add')}
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
                        {t('users.enroll_inline')} →
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      className="btn-icon"
                      title={t('users.edit_tooltip')}
                      aria-label={t('users.edit_aria')}
                      onClick={() => setEditTarget(row)}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="btn-icon btn-icon-primary"
                      title={row.enrolled ? t('users.enroll_aria_update') : t('users.enroll_aria_new')}
                      aria-label={row.enrolled ? t('users.enroll_aria_update') : t('users.enroll_aria_new')}
                      onClick={() => handleEnroll(row)}
                    >
                      <ScanFace size={15} />
                    </button>
                    <button
                      className="btn-icon btn-icon-danger"
                      title={t('users.delete_tooltip')}
                      aria-label={t('users.delete_aria')}
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
                left={{ icon: <Edit2 size={20} />, label: t('common.edit'), variant: 'primary', onAction: () => setEditTarget(row) }}
                right={{ icon: <Trash2 size={20} />, label: t('common.delete'), variant: 'danger', onAction: () => setDeleteTarget(row) }}
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
                    <span className="label">{t('users.card_username')}</span>
                    <span className="value">{row.username ?? '-'}</span>
                  </div>
                  <div className="user-card-detail-row">
                    <span className="label">{t('users.card_role')}</span>
                    <span className="value"><RoleBadge role={row.role} /></span>
                  </div>
                  <div className="user-card-detail-row">
                    <span className="label">{t('users.card_enrolled_status')}</span>
                    <span className="value"><EnrolledBadge enrolled={row.enrolled} /></span>
                  </div>
                  <div className="user-card-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditTarget(row)}>
                      <Edit2 size={15} /> {t('users.card_edit')}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleEnroll(row)}>
                      <ScanFace size={15} /> {row.enrolled ? t('users.card_update') : t('users.card_enroll')}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(row)}>
                      <Trash2 size={15} /> {t('users.card_delete')}
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

      <MobileFab onClick={() => setShowCreate(true)} label={t('users.add')}>
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
