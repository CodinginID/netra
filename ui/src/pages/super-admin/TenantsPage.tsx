import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, Plus, Search, X } from 'lucide-react'
import {
  type TenantOut,
} from '@/api/adminApi'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'
import { Pagination } from '@/components/Pagination'
import { MobileFab } from '@/components/MobileFab'
import { useTenants } from '@/hooks/useApiQueries'
import { useCreateTenant, useSuspendTenant, useActivateTenant } from '@/hooks/useApiMutations'
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
  return (
    <span className={status === 'active' ? 'badge badge-green' : 'badge badge-gray'}>
      {status === 'active' ? 'Aktif' : 'Suspended'}
    </span>
  )
}

function VerticalBadge({ config }: { config: TenantOut['config'] }) {
  const mode = (config?.vertical as { mode?: string } | undefined)?.mode ?? 'company'
  if (mode === 'university') return <span className="badge badge-blue">Universitas</span>
  if (mode === 'school') return <span className="badge badge-green">Sekolah</span>
  return <span className="badge badge-gray">Perusahaan</span>
}

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateTenantModal({ onClose, onCreated }: CreateModalProps) {
  const { show } = useToast()
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
      show('Password minimal 8 karakter', 'error')
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
          show(err instanceof Error ? err.message : 'Gagal membuat tenant', 'error')
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
          <h3 className="modal-title" style={{ marginBottom: 0 }}>Tambah Tenant</h3>
          <button
            aria-label="Tutup"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', border: 'none' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="field">
            <label htmlFor="tenant-name">Nama Tenant</label>
            <input
              id="tenant-name"
              className="field-input"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="PT Maju Jaya"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-slug">Slug</label>
            <input
              id="tenant-slug"
              className="field-input"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(slugify(e.target.value))
              }}
              placeholder="maju-jaya"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-email">Email Admin</label>
            <input
              id="tenant-admin-email"
              className="field-input"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@organisasi.com"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-password">Password Admin</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="tenant-admin-password"
                className="field-input"
                type={showAdminPw ? 'text' : 'password'}
                style={{ paddingRight: 40 }}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowAdminPw((v) => !v)}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                aria-label={showAdminPw ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showAdminPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="tenant-admin-fullname">Nama Lengkap Admin</label>
            <input
              id="tenant-admin-fullname"
              className="field-input"
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              placeholder="Budi Santoso"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="tenant-vertical">Jenis Organisasi</label>
            <select
              id="tenant-vertical"
              className="field-input"
              value={vertical}
              onChange={(e) => setVertical(e.target.value as 'company' | 'school' | 'university')}
            >
              <option value="company">Perusahaan</option>
              <option value="school">Sekolah (K-12)</option>
              <option value="university">Universitas / Kampus</option>
            </select>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={createMutation.isPending}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Membuat...' : 'Buat Tenant'}
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
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })
  const isSuspend = tenant.status === 'active'
  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div ref={modalRef} className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{isSuspend ? 'Suspend Tenant' : 'Aktifkan Tenant'}</h3>
        <p className="confirm-text">
          Yakin ingin {isSuspend ? 'menangguhkan' : 'mengaktifkan kembali'} tenant{' '}
          <strong style={{ color: 'var(--color-text)' }}>{tenant.name}</strong>?
          {isSuspend && ' Pengguna tenant tidak dapat login selama ditangguhkan.'}
        </p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Batal</button>
          <button
            className={isSuspend ? 'btn btn-warning' : 'btn btn-success'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '...' : isSuspend ? 'Suspend' : 'Aktifkan'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TenantsPage() {
  const { show } = useToast()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const searchRef = useRef('')
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<TenantOut | null>(null)

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
  const pages = paginatedTenants?.pages ?? 0

  const suspendMutation = useSuspendTenant(() => {
    show('Tenant dinonaktifkan', 'success')
  })
  const activateMutation = useActivateTenant(() => {
    show('Tenant diaktifkan', 'success')
  })

  const handleConfirmToggle = () => {
    if (!confirmTarget) return
    if (confirmTarget.status === 'active') {
      suspendMutation.mutate(confirmTarget.id, {
        onError: (err) => {
          show(err instanceof Error ? err.message : 'Gagal memperbarui status', 'error')
        },
      })
    } else {
      activateMutation.mutate(confirmTarget.id, {
        onError: (err) => {
          show(err instanceof Error ? err.message : 'Gagal memperbarui status', 'error')
        },
      })
    }
    setConfirmTarget(null)
  }

  const handleCreated = () => {
    show('Tenant berhasil dibuat', 'success')
  }

  const busyId = suspendMutation.isPending ? suspendMutation.variables : (activateMutation.isPending ? activateMutation.variables : null)

  return (
    <div>
      <div className="page-toolbar">
        <h2 className="page-title">Tenants</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              className="search-input"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Cari tenant..."
              aria-label="Cari tenant"
            />
          </div>
          <button className="btn btn-primary add-fab-twin" onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            Tambah Tenant
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error.message}</div>}

      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nama Tenant</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Terdaftar</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
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
                </tr>
              ))}

            {!isLoading && tenants.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    {total === 0 ? 'Belum ada tenant terdaftar' : 'Tidak ada tenant yang cocok'}
                  </div>
                </td>
              </tr>
            )}

            {!isLoading &&
              tenants.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {t.name}
                      <VerticalBadge config={t.config} />
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{t.slug}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(t.created_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {t.status === 'active' ? (
                      <button
                        className="btn btn-sm btn-warning"
                        onClick={() => setConfirmTarget(t)}
                        disabled={busyId === t.id}
                      >
                        {busyId === t.id ? '...' : 'Suspend'}
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => setConfirmTarget(t)}
                        disabled={busyId === t.id}
                      >
                        {busyId === t.id ? '...' : 'Aktifkan'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!isLoading && (
          <Pagination page={page} limit={limit} total={total} pages={pages} onPageChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1) }} />
        )}
      </div>

      <MobileFab onClick={() => setModalOpen(true)} label="Tambah Tenant">
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
    </div>
  )
}
