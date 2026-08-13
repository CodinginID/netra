import { useState } from 'react'
import { Search, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { useInvoices } from '@/hooks/useApiQueries'
import { useUpdateInvoice } from '@/hooks/useApiMutations'
import { type InvoiceOut } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { BillingTabs } from './BillingTabs'
import '@/styles/layout.css'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number, currency: string = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function StatusBadge({ status }: { status: InvoiceOut['status'] }) {
  const { t } = useI18n()
  const statusClass: Record<InvoiceOut['status'], string> = {
    draft: 'badge-gray',
    issued: 'badge-blue',
    paid: 'badge-green',
    void: 'badge-red',
  }

  return (
    <span className={`badge ${statusClass[status] ?? 'badge-gray'}`}>
      {t(`invoice.status.${status}`)}
    </span>
  )
}

export function InvoicesPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const updateInvoice = useUpdateInvoice()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [tenantId, setTenantId] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceOut['status'] | ''>('')

  const { data: invoicesData, isLoading, refetch } = useInvoices({
    page,
    limit,
    tenant_id: tenantId || undefined,
    status: statusFilter || undefined,
  })

  const invoices = invoicesData?.items ?? []
  const total = invoicesData?.total ?? 0
  const pages = invoicesData?.pages ?? 1

  const handleMarkPaid = async (invoice: InvoiceOut) => {
    try {
      await updateInvoice.mutateAsync({
        invoiceId: invoice.id,
        payload: { status: 'paid' },
      })
      show(t('toast_invoice_paid'), 'success')
      refetch()
    } catch (err) {
      show(err instanceof Error ? err.message : t('toast_save_failed'), 'error')
    }
  }

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2 className="page-title">{t('billing.invoice_management')}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('billing.invoice_management_desc')}
          </p>
        </div>
      </div>

      <BillingTabs />

      <div className="filter-row">
        <div className="search-input-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
          <Search size={16} />
          <input
            className="search-input"
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value)
              setPage(1)
            }}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
          />
        </div>
        <select
          className="field-input"
          style={{ maxWidth: 200 }}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as InvoiceOut['status'] | '')
            setPage(1)
          }}
        >
          <option value="">{t('all_statuses')}</option>
          <option value="draft">{t('invoice.status.draft')}</option>
          <option value="issued">{t('invoice.status.issued')}</option>
          <option value="paid">{t('invoice.status.paid')}</option>
          <option value="void">{t('invoice.status.void')}</option>
        </select>
      </div>

      <div className="data-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('invoice.invoice_number')}</th>
              <th>{t('subscription.tenant_id')}</th>
              <th>{t('invoice.period_start')}</th>
              <th>{t('invoice.period_end')}</th>
              <th>{t('invoice.billed_users')}</th>
              <th>{t('invoice.total')}</th>
              <th>{t('invoice.status')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              [0, 1, 2].map((i) => (
                <tr key={`sk-${i}`}>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-text sm" /></td>
                  <td><div className="skeleton skeleton-badge" /></td>
                  <td><div className="skeleton skeleton-text" style={{ width: 90, marginLeft: 'auto' }} /></td>
                </tr>
              ))}

            {!isLoading && invoices.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{t('billing.no_invoices')}</div>
                </td>
              </tr>
            )}

            {!isLoading &&
              invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td style={{ fontWeight: 600 }}>{invoice.invoice_number}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{invoice.tenant_id}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(invoice.period_start)}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(invoice.period_end)}</td>
                  <td>{invoice.billed_users}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(invoice.total, invoice.currency)}</td>
                  <td><StatusBadge status={invoice.status} /></td>
                  <td style={{ textAlign: 'right' }}>
                    {invoice.status === 'issued' && (
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleMarkPaid(invoice)}
                        disabled={updateInvoice.isPending}
                        title={t('invoice.mark_paid')}
                      >
                        <CheckCircle2 size={14} />
                        {t('invoice.mark_paid')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!isLoading && (
          <Pagination
            page={page}
            limit={limit}
            total={total}
            pages={pages}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit)
              setPage(1)
            }}
          />
        )}
      </div>
    </div>
  )
}
