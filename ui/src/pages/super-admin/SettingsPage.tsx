import { useI18n } from '@/store/i18nStore'

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n()

  return (
    <div>
      <div className="page-header">
        <h2>{t('settings.title')}</h2>
      </div>

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
    </div>
  )
}
