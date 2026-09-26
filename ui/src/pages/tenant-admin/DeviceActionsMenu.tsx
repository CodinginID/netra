import { Eye, KeyRound, Trash2, WifiOff } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'
import type { DeviceOut } from '@/api/adminApi'
import { ActionMenu, type ActionMenuItem } from '@/components/ActionMenu'

interface Props {
  device: DeviceOut
  busy: boolean
  onViewToken: () => void
  onRegenerate: () => void
  onRevoke: () => void
  onDelete: () => void
}

/** The ⋮ menu on a device card: view / reset token, revoke, delete. */
export function DeviceActionsMenu({ device, busy, onViewToken, onRegenerate, onRevoke, onDelete }: Props) {
  const { t } = useI18n()
  const active = device.status === 'active'
  const viewable = active && device.token_available !== false

  const items: ActionMenuItem[] = []
  if (active) {
    items.push({
      key: 'view',
      label: t('devices.view_token'),
      icon: <Eye size={15} />,
      disabled: !viewable,
      hint: viewable ? undefined : t('devices.view_token_legacy'),
      onSelect: onViewToken,
    })
  }
  items.push({
    key: 'regenerate',
    label: active ? t('devices.reset_token') : t('devices.restore_token'),
    title: active ? t('devices.reset_title_active') : t('devices.reset_title_inactive'),
    icon: <KeyRound size={15} />,
    onSelect: onRegenerate,
  })
  if (active) {
    items.push({ key: 'revoke', label: t('devices.revoke'), icon: <WifiOff size={15} />, onSelect: onRevoke })
  }
  items.push({
    key: 'delete',
    label: t('devices.delete'),
    icon: <Trash2 size={15} />,
    danger: true,
    separatorBefore: true,
    onSelect: onDelete,
  })

  return <ActionMenu label={`${t('devices.actions')} ${device.name}`} items={items} disabled={busy} />
}
