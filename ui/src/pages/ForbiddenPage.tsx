import { Link } from 'react-router-dom'
import { useI18n } from '@/store/i18nStore'
import '@/styles/layout.css'

export function ForbiddenPage() {
  const { t } = useI18n()
  return (
    <div className="error-page">
      <h1>{t('error.403_title')}</h1>
      <p>{t('error.403_desc')}</p>
      <Link to="/">{t('error.go_home')}</Link>
    </div>
  )
}
