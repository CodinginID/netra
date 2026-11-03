import { useI18n } from '@/store/i18nStore'
import { useAuthStore } from '@/store/authStore'
import { useTenantContext } from '@/hooks/useTenantContext'
import { TenantAccountSection } from '@/components/TenantAccountSection'
import { AboutSection } from '@/components/AboutSection'

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n()
  const role = useAuthStore((s) => s.role)
  const { tenantId } = useTenantContext()
  // Super admin inside a tenant view, or a tenant admin in their own area.
  // Supervisors can't manage accounts, so they only get the language setting.
  const showAccounts = (role === 'super_admin' && !!tenantId) || role === 'tenant_admin'

  return (
    <div>
      <div className="page-header">
        <h2>{t('settings.title')}</h2>
      </div>

      {showAccounts && <TenantAccountSection tenantId={tenantId} />}

      <div className="data-card" style={{ maxWidth: 480 }}>
        <div style={{ padding: 20 }}>
          <div className="field">
            <label htmlFor="locale-select">{t('settings.language')}</label>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>
              {t('settings.language_desc')}
            </p>
            <select
              id="locale-select"
              className="field-input"
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'id' | 'en')}
            >
              <option value="id">{t('settings.language_id')}</option>
              <option value="en">{t('settings.language_en')}</option>
            </select>
          </div>
        </div>
      </div>

      <AboutSection />
    </div>
  )
}
