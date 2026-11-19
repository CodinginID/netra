import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, PauseCircle, PlayCircle, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import type { TenantOut, TenantUsageRow } from '@/api/adminApi'
import { useToast } from '@/components/Toast'
import { Pagination } from '@/components/Pagination'
import { MobileFab } from '@/components/MobileFab'
import { ActionMenu, type ActionMenuItem } from '@/components/ActionMenu'
import { ResetTenantDataModal } from '@/components/ResetTenantDataModal'
import { useTenants, useUsageByTenant } from '@/hooks/useApiQueries'
import { useSuspendTenant, useActivateTenant, useDeleteTenant } from '@/hooks/useApiMutations'
import { useI18n } from '@/store/i18nStore'
import { CreateTenantModal, DeleteConfirmModal, ToggleConfirmModal } from './TenantModals'
import { Avatar, Chip, FilterPills, PageHead, formatDate, formatNumber } from './saShared'

type StatusFilter = 'all' | 'active' | 'suspended'

function verticalKey(config: TenantOut['config']): string {
  const mode = (config?.vertical as { mode?: string } | undefined)?.mode ?? 'company'
  return mode === 'university' ? 'university' : mode === 'school' ? 'school' : 'company'
}

/**
 * Super admin tenant list — mockup c5a2747e / 02aa2cb3: one "Kelola" button per
 * row, every other action in a ⋯ menu with the destructive ones last and red.
 * Reset and delete both ask for the slug to be typed.
 */
export function TenantsPage() {
  const { show } = useToast()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const searchRef = useRef('')
  const [status, setStatus] = useState<StatusFilter>(() => {
    const s = params.get('status')
    return s === 'active' || s === 'suspended' ? s : 'all'
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<TenantOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TenantOut | null>(null)
  const [resetTarget, setResetTarget] = useState<TenantOut | null>(null)

  // `?new=1` (from the dashboard's "+ Tenant baru") opens the create dialog; closing it drops the flag.
  const createOpen = modalOpen || params.get('new') === '1'
  const closeCreate = () => {
    setModalOpen(false)
    if (params.has('new')) {
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }

  // Debounced server-side search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (value: string) => {
    searchRef.current = value
    setSearch(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setPage(1)
    }, 300)
  }

  const term = searchRef.current.trim()
  const { data: paginatedTenants, isLoading, error } = useTenants({ page, limit, search: term || undefined })
  // Full list: status counts for the pills, and the source for a status-filtered view
  // (the API has no status filter, so that view pages client-side).
  const { data: allData } = useTenants({ limit: 1000 })
  const { data: usage } = useUsageByTenant()
  const usageById = new Map<string, TenantUsageRow>((usage ?? []).map((u) => [u.tenant_id, u]))

  const all = allData?.items ?? []
  const activeCount = all.filter((x) => x.status === 'active').length
  const suspendedCount = all.length - activeCount

  let tenants: TenantOut[]
  let total: number
  let pages: number
  if (status === 'all') {
    tenants = paginatedTenants?.items ?? []
    total = paginatedTenants?.total ?? 0
    pages = paginatedTenants?.pages ?? 1
  } else {
    const needle = term.toLowerCase()
    const filtered = all.filter(
      (x) =>
        x.status === status &&
        (!needle || x.name.toLowerCase().includes(needle) || x.slug.toLowerCase().includes(needle)),
    )
    total = filtered.length
    pages = Math.max(1, Math.ceil(total / limit))
    tenants = filtered.slice((page - 1) * limit, page * limit)
  }
  const loading = status === 'all' ? isLoading : !allData

  const suspendMutation = useSuspendTenant(() => show(t('tenant.toast_deactivated'), 'success'))
  const activateMutation = useActivateTenant(() => show(t('tenant.toast_activated'), 'success'))
  const deleteMutation = useDeleteTenant(() => {
    show(t('tenant.toast_deleted'), 'success')
    setDeleteTarget(null)
  })

  const handleConfirmToggle = () => {
    if (!confirmTarget) return
    const onError = (err: unknown) =>
      show(err instanceof Error ? err.message : t('tenant.error_update_failed'), 'error')
    if (confirmTarget.status === 'active') suspendMutation.mutate(confirmTarget.id, { onError })
    else activateMutation.mutate(confirmTarget.id, { onError })
    setConfirmTarget(null)
  }

  const busyId = suspendMutation.isPending
    ? suspendMutation.variables
    : activateMutation.isPending
      ? activateMutation.variables
      : null

  const handleDelete = (tenant: TenantOut) => {
    deleteMutation.mutate(tenant.id, {
      onError: (err) => show(err instanceof Error ? err.message : t('tenant.error_delete_failed'), 'error'),
    })
  }

  const changeStatus = (s: StatusFilter) => {
    setStatus(s)
    setPage(1)
    const next = new URLSearchParams(params)
    if (s === 'all') next.delete('status')
    else next.set('status', s)
    setParams(next, { replace: true })
  }

  const menuItems = (tenant: TenantOut): ActionMenuItem[] => [
    tenant.status === 'active'
      ? { key: 'toggle', label: t('tenants.menu_suspend'), icon: <PauseCircle size={15} />, onSelect: () => setConfirmTarget(tenant) }
      : { key: 'toggle', label: t('tenants.menu_activate'), icon: <PlayCircle size={15} />, onSelect: () => setConfirmTarget(tenant) },
    { key: 'reset', label: t('tenants.menu_reset'), icon: <RotateCcw size={15} />, danger: true, separatorBefore: true, onSelect: () => setResetTarget(tenant) },
    { key: 'delete', label: t('tenants.menu_delete'), icon: <Trash2 size={15} />, danger: true, onSelect: () => setDeleteTarget(tenant) },
  ]

  const statusChip = (tenant: TenantOut) =>
    tenant.status === 'active' ? <Chip tone="g">{t('active')}</Chip> : <Chip tone="m">{t('suspended')}</Chip>

  const actions = (tenant: TenantOut) => (
    <div className="tn-actions">
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
        title={t('tenant.manage_tooltip')}
      >
        {t('btn.manage')} <ArrowUpRight size={13} />
      </button>
      <ActionMenu
        variant="horizontal"
        header={tenant.name}
        label={t('tenants.more_actions', { name: tenant.name })}
        items={menuItems(tenant)}
        disabled={busyId === tenant.id}
      />
    </div>
  )

  const emptyText = total === 0 && !term && status === 'all' ? t('tenant.empty') : t('tenant.empty_search')

  return (
    <div className="sa-page">
      <PageHead
        title={t('tenants.title')}
        sub={t('tenants.registered_count', { count: allData?.total ?? paginatedTenants?.total ?? 0 })}
        actions={
          <>
            <label className="sa-search">
              <Search size={15} aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t('tenants.search_placeholder')}
                aria-label={t('tenants.search_placeholder')}
              />
            </label>
            <button className="btn btn-primary add-fab-twin" onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              {t('platform_home.new_tenant')}
            </button>
          </>
        }
      />

      <FilterPills<StatusFilter>
        ariaLabel={t('tenants.filter_label')}
        value={status}
        onChange={changeStatus}
        options={[
          { value: 'all', label: t('tenants.filter_all'), count: all.length },
          { value: 'active', label: t('active'), count: activeCount },
          { value: 'suspended', label: t('suspended'), count: suspendedCount },
        ]}
      />

      {error && <div className="error-banner">{error.message}</div>}

      <div className="sa-card sa-table-card tn-table">
        <table className="sa-table">
          <thead>
            <tr>
              <th>{t('tenants.col_tenant')}</th>
              <th>{t('tenants.col_users')}</th>
              <th>{t('tenants.col_devices')}</th>
              <th>{t('tenants.col_plan')}</th>
              <th>{t('tenant.col_status')}</th>
              <th>{t('tenant.col_registered')}</th>
              <th className="sa-right"><span className="sa-sr-only">{t('tenant.col_actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              [0, 1, 2].map((i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={7}><div className="skeleton skeleton-text sm" /></td>
                </tr>
              ))}
            {!loading && tenants.length === 0 && (
              <tr>
                <td colSpan={7}><div className="sa-empty">{emptyText}</div></td>
              </tr>
            )}
            {!loading &&
              tenants.map((tenant) => {
                const u = usageById.get(tenant.id)
                return (
                  <tr key={tenant.id}>
                    <td>
                      <div className="tn-name-cell">
                        <Avatar name={tenant.name} />
                        <div style={{ minWidth: 0 }}>
                          <div className="sa-who-name">{tenant.name}</div>
                          <div className="sa-who-sub">
                            <span className="sa-mono">{tenant.slug}</span> · {t(verticalKey(tenant.config))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="sa-num">{u ? formatNumber(u.active_users) : '–'}</td>
                    <td className="sa-num">{u ? formatNumber(u.devices) : '–'}</td>
                    <td>{u?.plan_name ?? <span className="sa-muted">{t('billing.usage.no_plan')}</span>}</td>
                    <td>{statusChip(tenant)}</td>
                    <td className="sa-muted">{formatDate(tenant.created_at)}</td>
                    <td className="sa-right">{actions(tenant)}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        {!loading && (
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        )}
      </div>

      {/* Phone: one card per tenant */}
      <div className="tn-cards">
        {loading && <div className="sa-card tn-card"><div className="skeleton skeleton-text" /></div>}
        {!loading && tenants.length === 0 && <div className="sa-card"><div className="sa-empty">{emptyText}</div></div>}
        {!loading &&
          tenants.map((tenant) => {
            const u = usageById.get(tenant.id)
            return (
              <div key={tenant.id} className="sa-card tn-card">
                <div className="tn-card-top">
                  <Avatar name={tenant.name} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="sa-who-name">{tenant.name}</div>
                    <div className="sa-who-sub sa-mono">{tenant.slug}</div>
                  </div>
                  {statusChip(tenant)}
                </div>
                <div className="tn-card-meta">
                  {u && <span>{t('platform_home.user_count', { count: formatNumber(u.active_users) })}</span>}
                  {u && <span>{t('tenants.device_count', { count: formatNumber(u.devices) })}</span>}
                  <span>{u?.plan_name ?? t('billing.usage.no_plan')}</span>
                </div>
                <div className="tn-card-actions">
                  <span className="sa-card-sub">{formatDate(tenant.created_at)}</span>
                  {actions(tenant)}
                </div>
              </div>
            )
          })}
        {!loading && pages > 1 && (
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        )}
      </div>

      <MobileFab onClick={() => setModalOpen(true)} label={t('tenant.add')}>
        <Plus size={24} />
      </MobileFab>

      {createOpen && (
        <CreateTenantModal onClose={closeCreate} onCreated={() => show(t('tenant.toast_created'), 'success')} />
      )}
      {confirmTarget && (
        <ToggleConfirmModal
          tenant={confirmTarget}
          onConfirm={handleConfirmToggle}
          onClose={() => setConfirmTarget(null)}
          busy={busyId === confirmTarget.id}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          tenant={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          busy={deleteMutation.isPending}
        />
      )}
      {resetTarget && <ResetTenantDataModal tenant={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  )
}
