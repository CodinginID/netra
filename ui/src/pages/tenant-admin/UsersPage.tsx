import '@/styles/layout.css'
import '@/styles/pages/users.css'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ActionMenu } from '@/components/ActionMenu'
import { ResetPasswordModal } from '@/components/ResetPasswordModal'
import { useUsers } from '@/hooks/useApiQueries'
import { useCreateUser, useUpdateUser, useDeleteUser, useRestoreUser } from '@/hooks/useApiMutations'
import { useToast } from '@/components/Toast'
import { Pagination } from '@/components/Pagination'
import { SwipeCard } from '@/components/SwipeCard'
import { PullToRefresh } from '@/components/PullToRefresh'
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/store/i18nStore'
import type { UserOut, UserCreate, UserUpdate } from '@/api/adminApi'
import { PageHead, Pills, SearchBox, StatCard, StatRow, Who, type PillItem } from './PeopleUi'
import { CreateUserModal, EditUserModal, DeleteConfirmModal } from './UsersModals'
import { FaceChip, UsersActionSheet, buildUserActions, idOrEmail, roleLabel, type UserActionHandlers } from './UsersActions'

type SortKey = 'full_name' | 'role' | 'enrolled'
type Filter = 'all' | 'not_enrolled' | 'end_user' | 'supervisor' | 'tenant_admin' | 'inactive'

function matchesFilter(u: UserOut, f: Filter): boolean {
  switch (f) {
    case 'all': return true
    case 'not_enrolled': return u.is_active && !u.enrolled
    case 'inactive': return !u.is_active
    case 'end_user': return u.role !== 'tenant_admin' && u.role !== 'supervisor'
    default: return u.role === f
  }
}

export function UsersPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const { show } = useToast()
  const myId = useAuthStore((s) => s.username) // holds the JWT sub (user id)
  useEdgeSwipeBack() // 3.5 — swipe from the left edge to go back (mobile)
  // Derive base path from current route so this page works under both /tenant and /admin
  const basePath = location.pathname.startsWith('/admin') ? '/admin' : '/tenant'

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [searchParam, setSearchParam] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<UserOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserOut | null>(null)
  const [resetTarget, setResetTarget] = useState<UserOut | null>(null)
  const [sheetTarget, setSheetTarget] = useState<UserOut | null>(null)

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

  // Server page for the default "Semua" view…
  const { data: paginatedUsers, isLoading: pageLoading, error, refetch } = useUsers({ page, limit, search: searchParam || undefined })
  // …and the full tenant list (API max 1000) for the stat cards and the other filters.
  const { data: allUsersData, isLoading: allLoading, refetch: refetchAll } = useUsers({ limit: 1000 })
  const allUsers = useMemo(() => allUsersData?.items ?? [], [allUsersData])

  const closeModal = useCallback(() => {
    setShowCreate(false)
    setEditTarget(null)
  }, [])

  const createMutation = useCreateUser((user) => {
    closeModal()
    // A revived record brings its attendance history and enrolled face back
    // with it — say so, otherwise the admin has no way to know.
    show(user.revived ? t('users.toast_revived', { name: user.full_name }) : t('users.toast_created'), 'success')
  })

  const updateMutation = useUpdateUser(() => {
    closeModal()
    show(t('users.toast_updated'), 'success')
  })

  const activeMutation = useUpdateUser()

  // Capture delete target info for the undo toast callback
  const [deletedUserId, setDeletedUserId] = useState('')
  const [deletedUserName, setDeletedUserName] = useState('')

  const restoreMutation = useRestoreUser(() => {
    show(t('users.toast_restored'), 'success')
  })

  const deleteMutation = useDeleteUser(() => {
    setDeleteTarget(null)
    show(t('users.toast_deleted', { name: deletedUserName }), 'success', {
      label: t('common.undo'),
      onClick: () => restoreMutation.mutate(deletedUserId),
    })
  })

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

  function handleToggleActive(user: UserOut) {
    const next = !user.is_active
    activeMutation.mutate(
      { userId: user.id, payload: { is_active: next } },
      {
        onSuccess: () => show(t(next ? 'users.toast_activated' : 'users.toast_deactivated', { name: user.full_name }), 'success'),
        onError: (err) => show(err instanceof Error ? err.message : t('users.load_error'), 'error'),
      },
    )
  }

  const handlers: UserActionHandlers = {
    onEnroll: handleEnroll,
    onEdit: setEditTarget,
    onResetPassword: setResetTarget,
    onToggleActive: handleToggleActive,
    onDelete: setDeleteTarget,
  }

  // Filtered views run on the full list; "Semua" keeps server pagination + search.
  const clientMode = filter !== 'all'
  const clientList = useMemo(() => {
    if (!clientMode) return []
    const q = search.trim().toLowerCase()
    return allUsers.filter((u) =>
      matchesFilter(u, filter) &&
      (!q || [u.full_name, u.username, u.external_id, u.email].some((v) => (v ?? '').toLowerCase().includes(q))),
    )
  }, [clientMode, allUsers, filter, search])

  const isLoading = clientMode ? allLoading : pageLoading
  const total = clientMode ? clientList.length : paginatedUsers?.total ?? 0
  const pages = clientMode ? Math.max(1, Math.ceil(clientList.length / limit)) : paginatedUsers?.pages ?? 1
  const users: UserOut[] | null = clientMode
    ? clientList.slice((page - 1) * limit, page * limit)
    : paginatedUsers?.items ?? null

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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortHead = (key: SortKey, label: string) => (
    <th aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="tp-sort" onClick={() => toggleSort(key)}>
        {label}
        <span aria-hidden="true" style={{ opacity: sortKey === key ? 1 : 0.35 }}>
          {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )

  function changeFilter(f: Filter) {
    setFilter(f)
    setPage(1)
  }

  const totalAll = allUsersData?.total ?? paginatedUsers?.total ?? 0
  const enrolledCount = allUsers.filter((u) => u.enrolled).length
  const notEnrolledCount = allUsers.filter((u) => matchesFilter(u, 'not_enrolled')).length
  const inactiveCount = allUsers.filter((u) => !u.is_active).length

  const pillItems: PillItem<Filter>[] = [
    { key: 'all', label: t('users.filter_all'), count: totalAll },
    { key: 'not_enrolled', label: t('users.face_missing'), count: notEnrolledCount },
    { key: 'end_user', label: t('users.role_employee'), desktopOnly: true },
    { key: 'supervisor', label: t('users.role_supervisor'), desktopOnly: true },
    { key: 'tenant_admin', label: t('users.role_admin'), desktopOnly: true },
    { key: 'inactive', label: t('users.inactive'), count: inactiveCount || undefined },
  ]

  const emptyState = (
    <EmptyState
      icon="users"
      title={clientMode || searchParam ? t('users.empty_filtered') : t('users.empty')}
      description={clientMode || searchParam ? t('users.empty_filtered_desc') : t('users.empty_desc')}
      action={!clientMode && !searchParam
        ? <button className="btn btn-primary" onClick={() => setShowCreate(true)}>{t('users.add')}</button>
        : undefined}
    />
  )
  const pagination = (
    <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
  )

  return (
    <div className="tp-page">
      <PageHead
        title={t('users.title')}
        subtitle={<>
          <span className="tp-desktop-only">{t('users.subtitle_count', { count: totalAll })}</span>
        </>}
        actions={<>
          <span className="tp-phone-only tp-muted users-count">{t('users.count_short', { count: totalAll })}</span>
          <button className="btn btn-primary add-fab-twin" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {t('users.add')}
          </button>
        </>}
      />

      <div className="tp-desktop-only">
        {allLoading && !error ? <StatRow skeleton={3} /> : (
          <StatRow>
            <StatCard label={t('users.stat_total')} value={totalAll} tone="m" active={filter === 'all'} onClick={() => changeFilter('all')} />
            <StatCard label={t('users.stat_enrolled')} value={enrolledCount} tone="g" />
            <StatCard
              label={t('users.stat_not_enrolled')}
              value={notEnrolledCount}
              tone="w"
              sub={t('users.stat_not_enrolled_sub')}
              active={filter === 'not_enrolled'}
              onClick={() => changeFilter('not_enrolled')}
            />
          </StatRow>
        )}
      </div>

      <div className="tp-toolbar users-toolbar">
        <Pills items={pillItems} value={filter} onChange={changeFilter} label={t('users.filter_label')} />
        <SearchBox value={search} onChange={handleSearchChange} placeholder={t('users.search_placeholder')} label={t('users.search_label')} />
      </div>

      {error && <div className="error-banner">{error instanceof Error ? error.message : t('users.load_error')}</div>}

      {/* Table — desktop */}
      <div className="tp-card tp-desktop-only">
        <table className="tp-table users-table">
          <thead>
            <tr>
              {sortHead('full_name', t('users.th_name'))}
              {sortHead('role', t('users.th_role'))}
              <th>{t('users.th_id_email')}</th>
              {sortHead('enrolled', t('users.th_face'))}
              <th><span className="tp-sr-only">{t('users.th_actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !error && [0, 1, 2, 3, 4].map((i) => (
              <tr key={i}>
                <td><div className="skeleton skeleton-text" style={{ width: '55%' }} /></td>
                <td><div className="skeleton skeleton-text sm" /></td>
                <td><div className="skeleton skeleton-text sm" /></td>
                <td><div className="skeleton skeleton-badge" /></td>
                <td><div className="skeleton skeleton-text" style={{ width: 60, marginLeft: 'auto' }} /></td>
              </tr>
            ))}
            {!isLoading && sorted !== null && sorted.length === 0 && (
              <tr><td colSpan={5}>{emptyState}</td></tr>
            )}
            {!isLoading && sorted?.map((row) => (
              <tr key={row.id} className={row.is_active ? undefined : 'users-row-inactive'}>
                <td><Who name={row.full_name} /></td>
                <td>{roleLabel(row.role, t)}</td>
                <td className="tp-muted users-id">{idOrEmail(row)}</td>
                <td><FaceChip user={row} /></td>
                <td>
                  <div className="users-row-actions">
                    {!row.enrolled && row.is_active && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleEnroll(row)} aria-label={t('users.enroll_aria_new')}>
                        {t('users.action_enroll_short')}
                      </button>
                    )}
                    <ActionMenu label={t('users.actions_for', { name: row.full_name })} items={buildUserActions(row, myId, handlers, t)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && users !== null && users.length > 0 && pagination}
      </div>

      {/* Card list — phone (swipe actions + pull-to-refresh + ⋯ bottom sheet) */}
      <div className="tp-phone-only">
        {isLoading ? (
          <div className="empty-state">{t('common.loading')}</div>
        ) : sorted === null || sorted.length === 0 ? (
          <div className="tp-card">{emptyState}</div>
        ) : (
          <PullToRefresh onRefresh={async () => { await Promise.all([refetch(), refetchAll()]) }}>
            <div className="tp-card tp-list users-list">
              {sorted.map((row) => (
                <SwipeCard
                  key={row.id}
                  left={{ icon: <Pencil size={20} />, label: t('common.edit'), variant: 'primary', onAction: () => setEditTarget(row) }}
                  right={{ icon: <Trash2 size={20} />, label: t('common.delete'), variant: 'danger', onAction: () => setDeleteTarget(row) }}
                >
                  <div className={`tp-list-row users-list-row${row.is_active ? '' : ' users-row-inactive'}`}>
                    <Who name={row.full_name} sub={`${roleLabel(row.role, t)} · ${idOrEmail(row)}`} />
                    <FaceChip user={row} short />
                    <button
                      type="button"
                      className="users-dots"
                      aria-label={t('users.actions_for', { name: row.full_name })}
                      aria-haspopup="dialog"
                      onClick={() => setSheetTarget(row)}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </SwipeCard>
              ))}
            </div>
            <div className="users-phone-pagination">{pagination}</div>
          </PullToRefresh>
        )}
      </div>

      <button type="button" className="users-fab" onClick={() => setShowCreate(true)} aria-label={t('users.add')}>
        <Plus size={18} aria-hidden="true" /> {t('users.add_short')}
      </button>

      {sheetTarget && (
        <UsersActionSheet
          user={sheetTarget}
          items={buildUserActions(sheetTarget, myId, handlers, t)}
          onClose={() => setSheetTarget(null)}
        />
      )}
      {showCreate && <CreateUserModal onSubmit={handleCreate} onClose={() => setShowCreate(false)} />}
      {editTarget && (
        <EditUserModal user={editTarget} onSubmit={(p) => handleEdit(p.userId, p.payload)} onClose={() => setEditTarget(null)} />
      )}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
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
