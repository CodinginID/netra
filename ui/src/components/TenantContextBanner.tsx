import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown } from 'lucide-react'
import { useTenants } from '@/hooks/useApiQueries'
import { useRef, useState, useEffect } from 'react'
import { useI18n } from '@/store/i18nStore'
import { Avatar, Chip } from '@/pages/super-admin/saShared'

interface TenantContextBannerProps {
  tenantId: string
  /** Called when user picks a new tenant from the quick switcher. */
  onSwitch: (tenantId: string) => void
}

/** Show a search box in the switcher once the list gets long. */
const SEARCH_FROM = 6

/**
 * Banner shown at the top of every tenant-scoped page.
 * Compact: [Back] [avatar] [tenant name ▾ (switcher)] [status chip]
 * The switcher lists active tenants, filterable when there are many.
 */
export function TenantContextBanner({ tenantId, onSwitch }: TenantContextBannerProps) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { data: tenantsData } = useTenants({ limit: 1000 })
  const tenants = tenantsData?.items ?? []
  const current = tenants.find((t$) => t$.id === tenantId)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setQuery('')
  }

  const canSwitch = tenants.length > 1
  const needle = query.trim().toLowerCase()
  const options = tenants
    .filter((t$) => t$.status === 'active')
    .filter((t$) => !needle || t$.name.toLowerCase().includes(needle) || t$.slug.toLowerCase().includes(needle))

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

      <Avatar name={current?.name ?? '?'} className="tcb-av" />

      <button
        ref={triggerRef}
        className="tenant-context-name"
        onClick={() => canSwitch && setOpen((v) => !v)}
        title={canSwitch ? t('banner.switch_tooltip') : undefined}
        aria-haspopup={canSwitch ? 'listbox' : undefined}
        aria-expanded={canSwitch ? open : undefined}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current ? current.name : t('banner.loading')}
        </span>
        {canSwitch && <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {current && (current.status === 'active' ? <Chip tone="g">{t('active')}</Chip> : <Chip tone="m">{t('suspended')}</Chip>)}

      {open && canSwitch && (
        <div className="tenant-context-switcher-menu">
          {tenants.length >= SEARCH_FROM && (
            <div className="tcb-search">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('tenants.search_placeholder')}
                aria-label={t('tenants.search_placeholder')}
              />
            </div>
          )}
          <div className="tenant-context-switcher-list" role="listbox" aria-label={t('banner.switch_tooltip')}>
            {options.length === 0 && <div className="tcb-empty">{t('tenant.empty_search')}</div>}
            {options.map((t$) => (
              <button
                key={t$.id}
                type="button"
                role="option"
                aria-selected={t$.id === tenantId}
                className={`tenant-context-switcher-item${t$.id === tenantId ? ' active' : ''}`}
                onClick={() => { onSwitch(t$.id); setOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Avatar name={t$.name} className="tcb-av" />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t$.name}</span>
                {t$.id === tenantId && <Check size={14} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
