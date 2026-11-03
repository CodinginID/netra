import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useTenants, useUsers } from '@/hooks/useApiQueries'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/store/i18nStore'
import { ResetPasswordModal } from '@/components/ResetPasswordModal'
import type { UserOut } from '@/api/adminApi'

const STAFF_ROLES = new Set(['tenant_admin', 'supervisor'])
const muted = { fontSize: 13, color: 'var(--color-text-secondary)' }

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
      <span style={muted}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function TenantInfoCard({ tenantId }: { tenantId: string }) {
  const { t } = useI18n()
  const { data } = useTenants({ limit: 1000 })
  const tenant = data?.items.find((x) => x.id === tenantId)
  if (!tenant) return null
  return (
    <div className="data-card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 8px' }}>{t('account.tenant_info')}</h3>
      <InfoRow label={t('account.tenant_name')} value={tenant.name} />
      <InfoRow label={t('account.tenant_slug')} value={tenant.slug} />
      <InfoRow label={t('account.status')} value={tenant.status === 'active' ? t('active') : t('suspended')} />
      <InfoRow label={t('account.created_at')} value={new Date(tenant.created_at).toLocaleDateString()} />
    </div>
  )
}

function StaffRow({ user, canReset, onReset }: { user: UserOut; canReset: boolean; onReset: () => void }) {
  const { t } = useI18n()
  const roleLabel = user.role === 'tenant_admin' ? t('users.role_admin') : t('users.role_supervisor')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>{user.full_name}</div>
        <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email ?? '-'}</div>
      </div>
      <span className={user.role === 'tenant_admin' ? 'badge badge-blue' : 'badge badge-gray'}>{roleLabel}</span>
      {canReset && (
        <button type="button" className="btn btn-ghost" onClick={onReset} title={t('account.reset_button')}>
          <KeyRound size={14} /> {t('account.reset_button')}
        </button>
      )}
    </div>
  )
}

/** Staff login accounts of the tenant, each with a reset-password action. */
function StaffAccountsCard() {
  const { t } = useI18n()
  const myId = useAuthStore((s) => s.username) // holds the JWT sub (user id)
  const { data, isLoading } = useUsers({ limit: 1000 })
  const [target, setTarget] = useState<UserOut | null>(null)
  const staff = (data?.items ?? []).filter((u) => STAFF_ROLES.has(u.role))
  return (
    <div className="data-card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 4px' }}>{t('account.staff_title')}</h3>
      <p style={{ ...muted, margin: '0 0 8px' }}>{t('account.staff_desc')}</p>
      {isLoading && <p style={muted}>{t('common.loading')}</p>}
      {!isLoading && staff.length === 0 && <p style={muted}>{t('account.staff_empty')}</p>}
      {staff.map((u) => (
        <StaffRow key={u.id} user={u} canReset={u.id !== myId} onReset={() => setTarget(u)} />
      ))}
      {target && <ResetPasswordModal user={target} onClose={() => setTarget(null)} />}
    </div>
  )
}

/** Account section of the tenant Settings page: tenant info + staff accounts. */
export function TenantAccountSection({ tenantId }: { tenantId: string | null }) {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 640, marginBottom: 16 }}>
      {tenantId && <TenantInfoCard tenantId={tenantId} />}
      <StaffAccountsCard />
    </div>
  )
}
