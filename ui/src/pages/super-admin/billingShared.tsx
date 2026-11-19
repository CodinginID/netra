import { usePlans, useTenants } from '@/hooks/useApiQueries'
import { useI18n } from '@/store/i18nStore'
import type { InvoiceOut, SubscriptionOut } from '@/api/adminApi'
import { Chip, type Tone } from './saShared'
import '@/styles/pages/sa-billing.css'

/** Billing rows only carry ids — resolve them to names from lists already cached elsewhere. */
export function useTenantNames() {
  const { data } = useTenants({ limit: 1000 })
  const items = data?.items ?? []
  const map = new Map(items.map((x) => [x.id, x.name]))
  return { tenants: items, name: (id: string) => map.get(id) ?? id.slice(0, 8) }
}

export function usePlanNames() {
  const { data } = usePlans({ page: 1, limit: 200 })
  const items = data?.items ?? []
  const map = new Map(items.map((p) => [p.id, p.name]))
  return { plans: items, name: (id: string) => map.get(id) ?? id.slice(0, 8) }
}

export function isOverdue(inv: InvoiceOut): boolean {
  return inv.status === 'issued' && !inv.paid_at && !!inv.due_date && new Date(inv.due_date).getTime() < Date.now()
}

export function InvoiceStatusChip({ invoice }: { invoice: InvoiceOut }) {
  const { t } = useI18n()
  if (isOverdue(invoice)) return <Chip tone="r">{t('billing.summary.overdue')}</Chip>
  const tone: Record<InvoiceOut['status'], Tone> = { draft: 'm', issued: 'w', paid: 'g', void: 'm' }
  return <Chip tone={tone[invoice.status] ?? 'm'}>{t(`invoice.status.${invoice.status}`)}</Chip>
}

export function SubscriptionStatusChip({ status }: { status: SubscriptionOut['status'] }) {
  const { t } = useI18n()
  const tone: Record<SubscriptionOut['status'], Tone> = { trial: 'w', active: 'g', past_due: 'r', canceled: 'm' }
  return <Chip tone={tone[status] ?? 'm'}>{t(`subscription.status.${status}`)}</Chip>
}

export function monthLabel(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'id-ID', { month: 'short', year: 'numeric' })
}

export function currentMonth(locale: string): string {
  return new Date().toLocaleDateString(locale === 'en' ? 'en-GB' : 'id-ID', { month: 'long', year: 'numeric' })
}
