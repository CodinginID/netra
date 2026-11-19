import { Eye, KeyRound, Tablet } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { DeviceOut } from '@/api/adminApi'
import { DeviceActionsMenu } from './DeviceActionsMenu'
import { relativeTime } from './tenantOpsFormat'

export type DeviceTone = 'g' | 'w' | 'm'

/** Aktif (seen at least once) · Belum dipakai (never connected) · Dicabut (token revoked). */
export function deviceState(device: DeviceOut): { tone: DeviceTone; labelKey: string } {
  if (device.status !== 'active') return { tone: 'm', labelKey: 'devices.status_revoked' }
  if (!device.last_seen_at) return { tone: 'w', labelKey: 'devices.status_unused' }
  return { tone: 'g', labelKey: 'devices.status_active' }
}

interface Props {
  device: DeviceOut
  busy: boolean
  onViewToken: () => void
  onRegenerate: () => void
  onRevoke: () => void
  onDelete: () => void
}

export function DevicesCard({ device, busy, onViewToken, onRegenerate, onRevoke, onDelete }: Props) {
  const { t, locale } = useI18n()
  const { tone, labelKey } = deviceState(device)
  const active = device.status === 'active'
  const viewable = active && device.token_available !== false
  const seen = relativeTime(device.last_seen_at, locale)
  const detail = !active
    ? t('devices.token_revoked_note')
    : seen
      ? t('devices.last_active_ago', { when: seen })
      : t('devices.never_active')

  return (
    <article className="ops-card dev-card" aria-labelledby={`dev-${device.id}`}>
      <div className="dev-card-main">
        <span className={`ops-ico ops-ico--${tone}`} aria-hidden="true">
          <Tablet size={18} />
        </span>
        <div className="dev-card-body">
          <div className="dev-card-title">
            <h3 id={`dev-${device.id}`} title={device.name}>{device.name}</h3>
            <span className={`ops-chip ops-chip--${tone} ops-desktop-only`}>{t(labelKey)}</span>
          </div>
          <p className="dev-card-detail ops-desktop-only">{detail}</p>
          <p className="dev-card-status ops-phone-only">
            <span className={`dev-dot dev-dot--${tone}`} aria-hidden="true" />
            {t(labelKey)}
          </p>
        </div>
        <span className="ops-phone-only">
          <DeviceActionsMenu device={device} busy={busy} onViewToken={onViewToken}
            onRegenerate={onRegenerate} onRevoke={onRevoke} onDelete={onDelete} />
        </span>
      </div>

      <div className="dev-card-foot ops-desktop-only">
        <span className="ops-mono">{active ? t('devices.token_masked') : t('devices.token_inactive')}</span>
        <div className="dev-card-actions">
          {viewable ? (
            <button type="button" className="btn btn-sm ops-btn-outline" onClick={onViewToken} disabled={busy}>
              <Eye size={14} /> {t('devices.view_token')}
            </button>
          ) : (
            <button type="button" className="btn btn-sm ops-btn-outline" onClick={onRegenerate} disabled={busy}
              title={active ? t('devices.reset_title_active') : t('devices.reset_title_inactive')}>
              <KeyRound size={14} /> {active ? t('devices.reset_token') : t('devices.restore_token')}
            </button>
          )}
          <DeviceActionsMenu device={device} busy={busy} onViewToken={onViewToken}
            onRegenerate={onRegenerate} onRevoke={onRevoke} onDelete={onDelete} />
        </div>
      </div>
    </article>
  )
}
