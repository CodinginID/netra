import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Check, ChevronsUpDown, Search } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useTenants } from '@/hooks/useApiQueries'
import type { TenantOut } from '@/api/adminApi'

/**
 * Slack/Vercel-style tenant switcher for super admins.
 *
 * A super admin's JWT carries `tenant_id: null` (they belong to no single
 * tenant), so they must choose which tenant context to act in. The choice is
 * stored in the auth store and sent as `X-Tenant-Id` on every API call.
 *
 * Renders nothing for non-super_admin roles — tenant users are already scoped
 * by their JWT and have no need to switch.
 */
export function TenantSwitcher() {
  const role = useAuthStore((s) => s.role)
  const selectedTenantId = useAuthStore((s) => s.selectedTenantId)
  const setSelectedTenantId = useAuthStore((s) => s.setSelectedTenantId)
  const qc = useQueryClient()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useTenants({ limit: 100 })
  const tenants = useMemo(() => data?.items ?? [], [data])
  const selected = tenants.find((t) => t.id === selectedTenantId) ?? null

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    // Focus the search box when the menu opens
    searchRef.current?.focus()
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (role !== 'super_admin') return null

  const filtered = query
    ? tenants.filter(
        (t) =>
          t.name.toLowerCase().includes(query.toLowerCase()) ||
          t.slug.toLowerCase().includes(query.toLowerCase()),
      )
    : tenants

  function choose(tenant: TenantOut | null) {
    setSelectedTenantId(tenant?.id ?? null)
    setOpen(false)
    setQuery('')
    // Query keys are tenant-agnostic, so drop cached data from the previous
    // tenant and refetch under the new context.
    qc.invalidateQueries()
  }

  return (
    <div className="tenant-switcher" ref={rootRef}>
      <button
        type="button"
        className={`tenant-switcher-trigger${selected ? '' : ' is-empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected ? `Tenant aktif: ${selected.name}` : 'Pilih tenant untuk dikelola'}
      >
        <Building2 size={15} className="tenant-switcher-icon" />
        <span className="tenant-switcher-name">{selected ? selected.name : 'Pilih tenant'}</span>
        <ChevronsUpDown size={14} className="tenant-switcher-caret" />
      </button>

      {open && (
        <div className="tenant-switcher-menu" role="listbox">
          <div className="tenant-switcher-search">
            <Search size={14} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Cari tenant..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Cari tenant"
            />
          </div>

          <div className="tenant-switcher-list">
            {isLoading ? (
              <div className="tenant-switcher-empty">Memuat tenant...</div>
            ) : filtered.length === 0 ? (
              <div className="tenant-switcher-empty">Tidak ada tenant cocok</div>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={t.id === selectedTenantId}
                  className={`tenant-switcher-item${t.id === selectedTenantId ? ' active' : ''}`}
                  onClick={() => choose(t)}
                >
                  <span className={`tenant-switcher-status status-${t.status}`} />
                  <span className="tenant-switcher-item-text">
                    <span className="tenant-switcher-item-name">{t.name}</span>
                    <span className="tenant-switcher-item-slug">{t.slug}</span>
                  </span>
                  <span className={`tenant-switcher-badge badge-${t.status}`}>
                    {t.status === 'active' ? 'Aktif' : 'Ditangguhkan'}
                  </span>
                  {t.id === selectedTenantId && <Check size={15} className="tenant-switcher-check" />}
                </button>
              ))
            )}
          </div>

          {selected && (
            <button type="button" className="tenant-switcher-clear" onClick={() => choose(null)}>
              Kosongkan konteks tenant
            </button>
          )}
        </div>
      )}
    </div>
  )
}
