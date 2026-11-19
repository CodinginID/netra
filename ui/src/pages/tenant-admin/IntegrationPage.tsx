import { useState } from 'react'
import { Plus } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import type { ApiKeyOut, ApiKeyCreated } from '@/api/adminApi'
import { useApiKeys, useApiKeyScopes } from '@/hooks/useApiQueries'
import {
  useCreateApiKey,
  useRotateApiKey,
  useRevokeApiKey,
  useDeleteApiKey,
  useUpdateApiKeyOrigins,
} from '@/hooks/useApiMutations'
import { IntegrationGuide } from './IntegrationGuide'
import { IntegrationKeys } from './IntegrationKeys'
import { IntegrationOrigins } from './IntegrationOrigins'
import { AddOriginModal, CreateKeyModal, EditOriginsModal, NewKeyDialog, type CreateKeyPayload } from './IntegrationModals'
import '@/styles/layout.css'
import '@/styles/pages/ops-common.css'
import '@/styles/pages/integration.css'

export function IntegrationPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const { data: keys, isLoading, error } = useApiKeys()
  const { data: scopes } = useApiKeyScopes()
  const [showForm, setShowForm] = useState(false)
  const [newKey, setNewKey] = useState<ApiKeyCreated | null>(null)
  const [rotated, setRotated] = useState(false)
  const [editingOrigins, setEditingOrigins] = useState<ApiKeyOut | null>(null)
  const [addingOrigin, setAddingOrigin] = useState(false)

  const createMutation = useCreateApiKey(() => {
    setShowForm(false)
    show(t('integration.toast_created'), 'success')
  })
  const rotateMutation = useRotateApiKey()
  const revokeMutation = useRevokeApiKey(() => show(t('integration.toast_revoked'), 'success'))
  const deleteMutation = useDeleteApiKey(() => show(t('integration.toast_deleted'), 'success'))
  const updateOriginsMutation = useUpdateApiKeyOrigins(() => {
    setEditingOrigins(null)
    setAddingOrigin(false)
    show(t('integration.toast_origins_updated'), 'success')
  })

  const originsError = (e: unknown) => show(e instanceof Error ? e.message : t('integration.toast_origins_failed'), 'error')

  const handleCreate = (payload: CreateKeyPayload) => {
    createMutation.mutate(payload, {
      onSuccess: (k) => { setRotated(false); setNewKey(k) },
      onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_create_failed'), 'error'),
    })
  }
  const saveOrigins = (keyId: string, allowedOrigins: string[]) => {
    updateOriginsMutation.mutate({ keyId, allowedOrigins }, { onError: originsError })
  }
  const handleUpdateOrigins = (allowedOrigins: string[]) => {
    if (editingOrigins) saveOrigins(editingOrigins.id, allowedOrigins)
  }
  const handleAddOrigin = (k: ApiKeyOut, origin: string) => {
    if (k.allowed_origins.includes(origin)) { setAddingOrigin(false); return }
    saveOrigins(k.id, [...k.allowed_origins, origin])
  }
  const handleRemoveOrigin = (k: ApiKeyOut, origin: string) => {
    saveOrigins(k.id, k.allowed_origins.filter((o) => o !== origin))
  }
  const handleRotate = (k: ApiKeyOut) => {
    if (!window.confirm(t('integration.reset_confirm', { name: k.name }))) return
    rotateMutation.mutate(k.id, {
      onSuccess: (nk) => { setRotated(true); setNewKey(nk); show(t('integration.toast_key_created'), 'success') },
      onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_reset_failed'), 'error'),
    })
  }
  const handleRevoke = (k: ApiKeyOut) => {
    if (!window.confirm(t('integration.revoke_confirm', { name: k.name }))) return
    revokeMutation.mutate(k.id, { onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_revoke_failed'), 'error') })
  }
  const handleDelete = (k: ApiKeyOut) => {
    if (!window.confirm(t('integration.delete_confirm', { name: k.name }))) return
    deleteMutation.mutate(k.id, { onError: (e) => show(e instanceof Error ? e.message : t('integration.toast_delete_failed'), 'error') })
  }

  const rows = keys ?? []
  const activeKeys = rows.filter((k) => k.status === 'active')

  return (
    <div className="ops-page int-page">
      <div className="ops-head">
        <div>
          <h2>{t('integration.title')}</h2>
          <p>{t('integration.subtitle')}</p>
        </div>
        <button className="btn btn-primary ops-desktop-only" onClick={() => setShowForm(true)}>
          <Plus size={16} /> {t('integration.add')}
        </button>
      </div>

      {error && <div className="error-banner">{error instanceof Error ? error.message : t('integration.load_error')}</div>}

      {isLoading ? (
        <div className="ops-card ops-card-pad">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton skeleton-text" style={{ margin: '10px 0' }} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="data-card">
          <EmptyState
            icon="monitor"
            title={t('integration.empty')}
            description={t('integration.empty_desc')}
            action={<button className="btn btn-primary" onClick={() => setShowForm(true)}>{t('integration.add')}</button>}
          />
        </div>
      ) : (
        <IntegrationKeys
          keys={rows}
          onEditOrigins={setEditingOrigins}
          onRotate={handleRotate}
          onRevoke={handleRevoke}
          onDelete={handleDelete}
        />
      )}

      <button type="button" className="btn btn-primary ops-phone-only int-phone-add" onClick={() => setShowForm(true)}>
        <Plus size={16} /> {t('integration.add')}
      </button>

      <div className={`int-bottom${rows.length === 0 ? ' int-bottom--single' : ''}`}>
        {rows.length > 0 && (
          <IntegrationOrigins
            keys={rows}
            busy={updateOriginsMutation.isPending}
            onAdd={() => setAddingOrigin(true)}
            onRemove={handleRemoveOrigin}
          />
        )}
        <IntegrationGuide />
      </div>

      {newKey && <NewKeyDialog apiKey={newKey} rotated={rotated} onClose={() => setNewKey(null)} />}
      {showForm && (
        <CreateKeyModal
          scopes={scopes ?? { 'attendance:read': 'Baca catatan & laporan kehadiran' }}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          submitting={createMutation.isPending}
        />
      )}
      {editingOrigins && (
        <EditOriginsModal
          apiKey={editingOrigins}
          onSubmit={handleUpdateOrigins}
          onCancel={() => setEditingOrigins(null)}
          submitting={updateOriginsMutation.isPending}
        />
      )}
      {addingOrigin && activeKeys.length > 0 && (
        <AddOriginModal
          keys={activeKeys}
          onSubmit={handleAddOrigin}
          onCancel={() => setAddingOrigin(false)}
          submitting={updateOriginsMutation.isPending}
        />
      )}
    </div>
  )
}
