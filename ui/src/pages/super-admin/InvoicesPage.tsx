import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { useInvoices } from '@/hooks/useApiQueries'
import { useUpdateInvoice } from '@/hooks/useApiMutations'
import { type InvoiceOut } from '@/api/adminApi'
import { Pagination } from '@/components/Pagination'
import { FilterPills, PageHead, formatCurrency, formatNumber } from './saShared'
import { InvoiceStatusChip, currentMonth, monthLabel, useTenantNames } from './billingShared'

type StatusFilter = InvoiceOut['status'] | ''

function initialStatus(v: string | null): StatusFilter {
  return v === 'draft' || v === 'issued' || v === 'paid' || v === 'void' ? v : ''
}

/** Billing → Faktur (mockup dd07def6). `?status=` preselects a filter. */
export function InvoicesPage() {
  const { t, locale } = useI18n()
  const { show } = useToast()
  const [params] = useSearchParams()
  const updateInvoice = useUpdateInvoice()
  const { tenants, name } = useTenantNames()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [tenantId, setTenantId] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => initialStatus(params.get('status')))

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

  const markPaid = (invoice: InvoiceOut) =>
    invoice.status === 'issued' && (
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => handleMarkPaid(invoice)}
        disabled={updateInvoice.isPending}
        title={t('invoice.mark_paid')}
      >
        <CheckCircle2 size={14} />
        {t('invoice.mark_paid')}
      </button>
    )

  const empty = <div className="sa-empty">{t('billing.no_invoices')}</div>

  return (
    <div className="sa-page">
      <PageHead title={t('billing.invoice_management')} sub={currentMonth(locale)} />

      <div className="bl-toolbar">
        <FilterPills<StatusFilter>
          ariaLabel={t('invoice.status')}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v)
            setPage(1)
          }}
          options={[
            { value: '', label: t('all_statuses') },
            { value: 'draft', label: t('invoice.status.draft') },
            { value: 'issued', label: t('invoice.status.issued') },
            { value: 'paid', label: t('invoice.status.paid') },
            { value: 'void', label: t('invoice.status.void') },
          ]}
        />
        <select
          className="bl-select"
          value={tenantId}
          onChange={(e) => {
            setTenantId(e.target.value)
            setPage(1)
          }}
          aria-label={t('billing_page.filter_tenant')}
        >
          <option value="">{t('billing_page.all_tenants')}</option>
          {tenants.map((tn) => (
            <option key={tn.id} value={tn.id}>{tn.name}</option>
          ))}
        </select>
      </div>

      <div className="sa-card sa-table-card bl-table">
        <table className="sa-table">
          <thead>
            <tr>
              <th>{t('invoice.invoice_number')}</th>
              <th>{t('billing.usage.tenant')}</th>
              <th>{t('billing_page.period')}</th>
              <th>{t('invoice.billed_users')}</th>
              <th>{t('invoice.total')}</th>
              <th>{t('invoice.status')}</th>
              <th className="sa-right"><span className="sa-sr-only">{t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7}><div className="skeleton skeleton-text sm" /></td></tr>
            )}
            {!isLoading && invoices.length === 0 && (
              <tr><td colSpan={7}>{empty}</td></tr>
            )}
            {!isLoading &&
              invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="sa-mono" style={{ fontWeight: 600, fontSize: 12 }}>{invoice.invoice_number}</td>
                  <td>{name(invoice.tenant_id)}</td>
                  <td className="sa-muted">{monthLabel(invoice.period_start, locale)}</td>
                  <td className="sa-num">{formatNumber(invoice.billed_users)}</td>
                  <td className="sa-num" style={{ fontWeight: 600 }}>{formatCurrency(invoice.total, invoice.currency)}</td>
                  <td><InvoiceStatusChip invoice={invoice} /></td>
                  <td className="sa-right">{markPaid(invoice)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="bl-cards">
        {!isLoading && invoices.length === 0 && <div className="sa-card">{empty}</div>}
        {invoices.map((invoice) => (
          <div key={invoice.id} className="sa-card bl-card">
            <div className="bl-card-top">
              <span className="sa-mono" style={{ fontWeight: 600, fontSize: 12 }}>{invoice.invoice_number}</span>
              <InvoiceStatusChip invoice={invoice} />
            </div>
            <div className="bl-card-top">
              <span className="sa-who-name">{name(invoice.tenant_id)}</span>
              <span className="bl-card-total">{formatCurrency(invoice.total, invoice.currency)}</span>
            </div>
            <div className="bl-card-meta">
              <span>{monthLabel(invoice.period_start, locale)}</span>
              <span>{t('billing_page.billed_users_n', { count: formatNumber(invoice.billed_users) })}</span>
            </div>
            {invoice.status === 'issued' && <div>{markPaid(invoice)}</div>}
          </div>
        ))}
      </div>

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
  )
}
