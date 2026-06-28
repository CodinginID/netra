import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Building2 } from 'lucide-react'
import { useTenants } from '@/hooks/useApiQueries'
import { useRef, useState, useEffect } from 'react'
import { useI18n } from '@/store/i18nStore'

interface TenantContextBannerProps {
  tenantId: string
  /** Called when user picks a new tenant from the quick switcher. */
  onSwitch: (tenantId: string) => void
}

/**
 * Banner shown at the top of every tenant-scoped page.
 * Compact: [Back] [icon] [tenant name (clickable)] [status badge]
 * Clicking the tenant name opens a quick-switch dropdown.
 */
export function TenantContextBanner({ tenantId, onSwitch }: TenantContextBannerProps) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { data: tenantsData } = useTenants({ limit: 1000 })
  const tenants = tenantsData?.items ?? []
  const current = tenants.find((t$) => t$.id === tenantId)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="tenant-context-banner" ref={rootRef}>
      <button
        className="tenant-context-back"
        onClick={() => navigate('/admin/tenants')}
        title={t('banner.back_tooltip')}
        aria-label={t('banner.back_tooltip')}
      >
        <ArrowLeft size={16} />
      </button>

      <Building2 size={16} className="tenant-context-icon" />

      <button
        className="tenant-context-name"
        onClick={() => tenants.length > 1 && setOpen((v) => !v)}
        title={tenants.length > 1 ? t('banner.switch_tooltip') : undefined}
      >
        {current ? current.name : t('banner.loading')}
      </button>

      {current && (
        <span className={`tenant-context-badge badge-${current.status}`}>
          {current.status === 'active' ? t('active') : t('suspended')}
        </span>
      )}

      {open && tenants.length > 1 && (
        <div className="tenant-context-switcher-menu" role="listbox">
          <div className="tenant-context-switcher-list">
            {tenants
              .filter((t$) => t$.status === 'active')
              .map((t$) => (
                <button
                  key={t$.id}
                  type="button"
                  role="option"
                  aria-selected={t$.id === tenantId}
                  className={`tenant-context-switcher-item${t$.id === tenantId ? ' active' : ''}`}
                  onClick={() => { onSwitch(t$.id); setOpen(false) }}
                >
                  {t$.name}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
