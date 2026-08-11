import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, Plus, Search, X, ArrowUpRight, Trash2 } from 'lucide-react'
import {
  type TenantOut,
} from '@/api/adminApi'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { Pagination } from '@/components/Pagination'
import { MobileFab } from '@/components/MobileFab'
import { useTenants } from '@/hooks/useApiQueries'
import { useCreateTenant, useSuspendTenant, useActivateTenant, useDeleteTenant } from '@/hooks/useApiMutations'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/store/i18nStore'
import '@/styles/layout.css'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }: { status: TenantOut['status'] }) {
  const { t } = useI18n()
  return (
    <span className={status === 'active' ? 'badge badge-green' : 'badge badge-gray'}>
      {status === 'active' ? t('active') : t('suspended')}
    </span>
  )
}

function VerticalBadge({ config }: { config: TenantOut['config'] }) {
  const { t } = useI18n()
  const mode = (config?.vertical as { mode?: string } | undefined)?.mode ?? 'company'
  if (mode === 'university') return <span className="badge badge-blue">{t('university')}</span>
  if (mode === 'school') return <span className="badge badge-green">{t('school')}</span>
  return <span className="badge badge-gray">{t('company')}</span>
}

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateTenantModal({ onClose, onCreated }: CreateModalProps) {
  const { show } = useToast()
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminFullName, setAdminFullName] = useState('')
  const [vertical, setVertical] = useState<'company' | 'school' | 'university'>('company')
  const [showAdminPw, setShowAdminPw] = useState(false)
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const createMutation = useCreateTenant(() => {
    onClose()
    onCreated()
  })

  const onNameChange = (value: string) => {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (createMutation.isPending) return
    if (adminPassword.length < 8) {
      show(t('tenant.error_password_min'), 'error')
      return
    }
    createMutation.mutate(
      {
        name: name.trim(),
        slug: slug.trim(),
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword,
        admin_full_name: adminFullName.trim(),
        config: { vertical: { mode: vertical } },
      },
      {
        onError: (err) => {
          show(err instanceof Error ? err.message : t('tenant.error_create_failed'), 'error')
        },
      },
    )
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-card"
        style={{ maxHeight: '90vh', overflowY: 'auto', padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h3 className="modal-title" style={{ marginBottom: 0 }}>{t('tenant.add')}</h3>
          <button
            aria-label={t('common.close')}
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', border: 'none' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="field">
            <label htmlFor="tenant-name">{t('tenant.form_name')}</label>
            <input
              id="tenant-name"
              className="field-input"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t('tenant.form_name_placeholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-slug">{t('tenant.form_slug')}</label>
            <input
              id="tenant-slug"
              className="field-input"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
              placeholder={t('tenant.form_slug_placeholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-email">{t('tenant.form_admin_email')}</label>
            <input
              id="tenant-admin-email"
              className="field-input"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder={t('tenant.form_admin_email_placeholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-password">{t('tenant.form_admin_password')}</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="tenant-admin-password"
                className="field-input"
                type={showAdminPw ? 'text' : 'password'}
                style={{ paddingRight: 40 }}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder={t('tenant.form_admin_password_placeholder')}
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowAdminPw((v) => !v)}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                aria-label={showAdminPw ? t('login.hide_password') : t('login.show_password')}
              >
                {showAdminPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-fullname">{t('tenant.form_admin_fullname')}</label>
            <input
              id="tenant-admin-fullname"
              className="field-input"
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              placeholder={t('tenant.form_admin_fullname_placeholder')}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-vertical">{t('tenant.form_vertical')}</label>
            <select
              id="tenant-vertical"
              className="field-input"
              value={vertical}
              onChange={(e) => setVertical(e.target.value as 'company' | 'school' | 'university')}
            >
              <option value="company">{t('tenant.option_company')}</option>
              <option value="school">{t('tenant.option_school')}</option>
              <option value="university">{t('tenant.option_university')}</option>
            </select>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createMutation.isPending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('common.creating') : t('tenant.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ToggleConfirmModal({ tenant, onConfirm, onClose, busy }: {
  tenant: TenantOut
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const isSuspend = tenant.status === 'active'
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{isSuspend ? t('tenant.suspend_title') : t('tenant.activate_title')}</h3>
        <p className="confirm-text">
          {t('tenant.confirm_toggle', {
            action: isSuspend ? t('tenant.suspend') : t('tenant.activate'),
            name: tenant.name,
          })}
          {isSuspend && ' ' + t('tenant.toggle_warning')}
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button
            className={isSuspend ? 'btn btn-warning' : 'btn btn-success'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '...' : isSuspend ? t('tenant.suspend') : t('tenant.activate')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmModal({ tenant, onConfirm, onClose, busy }: {
  tenant: TenantOut
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  const { t } = useI18n()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t('tenant.delete_title')}</h3>
        <p className="confirm-text">
          {t('tenant.confirm_delete', { name: tenant.name })}{' '}
          <strong>{t('tenant.delete_warning')}</strong>
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? '...' : t('tenant.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TenantsPage() {
  const { show } = useToast()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const searchRef = useRef('')
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<TenantOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TenantOut | null>(null)

  const handleKelola = (tenantId: string) => {
    navigate(`/admin/tenants/${tenantId}`)
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

  const { data: paginatedTenants, isLoading, error } = useTenants({ page, limit, search: searchRef.current.trim() || undefined })
  const tenants = paginatedTenants?.items ?? []
  const total = paginatedTenants?.total ?? 0
  const pages = paginatedTenants?.pages ?? 1

  const suspendMutation = useSuspendTenant(() => {
    show(t('tenant.toast_deactivated'), 'success')
  })
  const activateMutation = useActivateTenant(() => {
    show(t('tenant.toast_activated'), 'success')
  })
  const deleteMutation = useDeleteTenant(() => {
    show(t('tenant.toast_deleted'), 'success')
    setDeleteTarget(null)
  })

  const handleConfirmToggle = () => {
    if (!confirmTarget) return
    if (confirmTarget.status === 'active') {
      suspendMutation.mutate(confirmTarget.id, {
        onError: (err) => {
          show(err instanceof Error ? err.message : t('tenant.error_update_failed'), 'error')
        },
      })
    } else {
      activateMutation.mutate(confirmTarget.id, {
        onError: (err) => {
          show(err instanceof Error ? err.message : t('tenant.error_update_failed'), 'error')
        },
      })
    }
    setConfirmTarget(null)
  }

  const handleCreated = () => {
    show(t('tenant.toast_created'), 'success')
  }

  const busyId = suspendMutation.isPending ? suspendMutation.variables : (activateMutation.isPending ? activateMutation.variables : null)

  const handleDelete = (tenant: TenantOut) => {
    deleteMutation.mutate(tenant.id, {
      onError: (err) => {
        show(err instanceof Error ? err.message : t('tenant.error_delete_failed'), 'error')
      },
    })
  }

  return (
    <div>
      <div className="page-toolbar">
        <h2 className="page-title">{t('tenant.title')}</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              className="search-input"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t('tenant.search_placeholder')}
              aria-label={t('tenant.search_placeholder')}
            />
          </div>
          <button className="btn btn-primary add-fab-twin" onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            {t('tenant.add')}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('tenant.col_name')}</th>
              <th>{t('tenant.col_slug')}</th>
              <th>{t('tenant.col_status')}</th>
              <th>{t('tenant.col_registered')}</th>
              <th colSpan={2} style={{ textAlign: 'right' }}>{t('tenant.col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              [0, 1, 2].map((i) => (
                <tr key={`sk-${i}`}>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-badge" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text" style={{ width: 70, marginLeft: 'auto' }} /></td>
                  <td><div className="skeleton skeleton-text" style={{ width: 70, marginLeft: 'auto' }} /></td>
                </tr>
              ))}

            {!isLoading && tenants.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    {total === 0 ? t('tenant.empty') : t('tenant.empty_search')}
                  </div>
                </td>
              </tr>
            )}

            {!isLoading &&
              tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td style={{ fontWeight: 600 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {tenant.name}
                      <VerticalBadge config={tenant.config} />
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{tenant.slug}</td>
                  <td><StatusBadge status={tenant.status} /></td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(tenant.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleKelola(tenant.id)}
                      title={t('tenant.manage_tooltip')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {t('btn.manage')} <ArrowUpRight size={13} />
                    </button>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {tenant.status === 'active' ? (
                      <button
                        className="btn btn-sm btn-warning"
                        onClick={() => setConfirmTarget(tenant)}
                        disabled={busyId === tenant.id}
                      >
                        {busyId === tenant.id ? '...' : t('tenant.suspend')}
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => setConfirmTarget(tenant)}
                        disabled={busyId === tenant.id}
                      >
                        {busyId === tenant.id ? '...' : t('tenant.activate')}
                      </button>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => setDeleteTarget(tenant)}
                      disabled={busyId === tenant.id}
                      title={t('tenant.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!isLoading && (
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        )}
      </div>

      <MobileFab onClick={() => setModalOpen(true)} label={t('tenant.add')}>
        <Plus size={24} />
      </MobileFab>

      {modalOpen && (
        <CreateTenantModal onClose={() => setModalOpen(false)} onCreated={handleCreated} />
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
    </div>
  )
}
