import { Ban, Globe, RefreshCw, Trash2 } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { ApiKeyOut } from '@/api/adminApi'
import { ActionMenu, type ActionMenuItem } from '@/components/ActionMenu'
import { daysUntil, relativeTime, shortDate } from './tenantOpsFormat'

const SOON_DAYS = 30

interface Handlers {
  onEditOrigins: (k: ApiKeyOut) => void
  onRotate: (k: ApiKeyOut) => void
  onRevoke: (k: ApiKeyOut) => void
  onDelete: (k: ApiKeyOut) => void
}

/** Expiry chip: green while valid, yellow within 30 days, red once expired or revoked. */
function useExpiry() {
  const { t, locale } = useI18n()
  return (k: ApiKeyOut): { tone: 'g' | 'w' | 'r' | 'm'; label: string } => {
    if (k.status !== 'active') return { tone: 'r', label: t('integration.status_revoked') }
    if (!k.expires_at) return { tone: 'm', label: t('integration.no_expiry') }
    const left = daysUntil(k.expires_at)
    if (left !== null && left <= 0) return { tone: 'r', label: t('integration.expired') }
    const label = shortDate(k.expires_at, locale) ?? '—'
    return { tone: left !== null && left <= SOON_DAYS ? 'w' : 'g', label }
  }
}

function KeyMenu({ k, onEditOrigins, onRotate, onRevoke, onDelete }: { k: ApiKeyOut } & Handlers) {
  const { t } = useI18n()
  const items: ActionMenuItem[] = [
    { key: 'origins', label: t('integration.edit_origins_btn'), icon: <Globe size={15} />, onSelect: () => onEditOrigins(k) },
    { key: 'rotate', label: t('integration.reset_btn'), title: t('integration.reset_title'), icon: <RefreshCw size={15} />, onSelect: () => onRotate(k) },
  ]
  if (k.status === 'active') {
    items.push({ key: 'revoke', label: t('integration.revoke_btn'), icon: <Ban size={15} />, onSelect: () => onRevoke(k) })
  }
  items.push({
    key: 'delete',
    label: t('integration.delete_permanent'),
    icon: <Trash2 size={15} />,
    danger: true,
    separatorBefore: true,
    onSelect: () => onDelete(k),
  })
  return <ActionMenu label={`${t('integration.key_actions')} ${k.name}`} items={items} />
}

export function IntegrationKeys({ keys, ...handlers }: { keys: ApiKeyOut[] } & Handlers) {
  const { t, locale } = useI18n()
  const expiry = useExpiry()
  const lastUsed = (k: ApiKeyOut) => relativeTime(k.last_used_at, locale) ?? t('integration.never_used')

  return (
    <>
      <div className="ops-card ops-table int-table ops-desktop-only" role="table" aria-label={t('integration.keys_label')}>
        <div className="ops-table-row ops-table-head" role="row">
          <span role="columnheader">{t('integration.col_name')}</span>
          <span role="columnheader">{t('integration.col_scopes')}</span>
          <span role="columnheader">{t('integration.col_expires')}</span>
          <span role="columnheader">{t('integration.col_last_used')}</span>
          <span role="columnheader"><span className="ops-sr-only">{t('integration.key_actions')}</span></span>
        </div>
        {keys.map((k) => {
          const e = expiry(k)
          return (
            <div key={k.id} className="ops-table-row" role="row">
              <div role="cell">
                <div className="ops-strong int-ellipsis" title={k.name}>{k.name}</div>
                <span className="ops-mono">{k.prefix}••</span>
              </div>
              <div role="cell" className="int-scopes">
                {k.scopes.map((s) => <span key={s} className="ops-chip ops-chip--b">{s}</span>)}
              </div>
              <div role="cell"><span className={`ops-chip ops-chip--${e.tone}`}>{e.label}</span></div>
              <div role="cell" className="ops-muted">{lastUsed(k)}</div>
              <div role="cell"><KeyMenu k={k} {...handlers} /></div>
            </div>
          )
        })}
      </div>

      <div className="int-key-cards ops-phone-only">
        <p className="int-section-label">{t('integration.keys_label')}</p>
        {keys.map((k) => {
          const e = expiry(k)
          return (
            <article key={k.id} className="ops-card int-key-card" aria-label={k.name}>
              <div className="int-key-card-top">
                <span className="ops-strong int-ellipsis">{k.name}</span>
                <span className={`ops-chip ops-chip--${e.tone}`}>{e.label}</span>
                <KeyMenu k={k} {...handlers} />
              </div>
              <span className="ops-mono">{k.prefix}••</span>
              <div className="int-key-card-meta">
                <span>{k.scopes.join(', ')}</span>
                <span>{k.last_used_at ? t('integration.used_ago', { when: lastUsed(k) }) : t('integration.never_used')}</span>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
