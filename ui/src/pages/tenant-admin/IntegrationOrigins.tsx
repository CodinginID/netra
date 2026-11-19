import { Plus, X } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { ApiKeyOut } from '@/api/adminApi'

/**
 * "Origin embed" card. Origins are stored per API key, so every row shows which
 * key it belongs to; × removes the origin from that key only.
 */
export function IntegrationOrigins({
  keys,
  busy,
  onAdd,
  onRemove,
}: {
  keys: ApiKeyOut[]
  busy: boolean
  onAdd: () => void
  onRemove: (key: ApiKeyOut, origin: string) => void
}) {
  const { t } = useI18n()
  const rows = keys.flatMap((k) => k.allowed_origins.map((origin) => ({ key: k, origin })))
  const canAdd = keys.some((k) => k.status === 'active')

  return (
    <section className="ops-card ops-card-pad int-origins" aria-labelledby="int-origins-title">
      <h3 id="int-origins-title" className="ops-card-title">{t('integration.origins_card_label')}</h3>
      <p className="ops-card-sub">{t('integration.origins_card_desc')}</p>
      {rows.length === 0 ? (
        <p className="int-origins-empty">{t('integration.origins_none')}</p>
      ) : (
        <ul className="int-origin-list">
          {rows.map(({ key, origin }) => (
            <li key={`${key.id}-${origin}`} className="int-origin">
              <span className="int-origin-text">
                <span className="ops-mono int-ellipsis" title={origin}>{origin}</span>
                {keys.length > 1 && <span className="int-origin-key">{key.name}</span>}
              </span>
              <button
                type="button"
                className="int-origin-remove"
                disabled={busy}
                aria-label={`${t('integration.origins_remove')} ${origin}`}
                title={t('integration.origins_remove')}
                onClick={() => onRemove(key, origin)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-sm ops-btn-outline int-origin-add" onClick={onAdd} disabled={!canAdd}>
        <Plus size={14} /> {t('integration.origins_add_btn')}
      </button>
    </section>
  )
}
