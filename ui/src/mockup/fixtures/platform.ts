/* Data contoh panel super admin: tenant, paket, langganan, faktur, pemakaian,
   dan permintaan demo. Semua dibuat-buat. */
import type {
  BillingSummaryOut,
  DemoRequestOut,
  InvoiceOut,
  PlanOut,
  PlanTierOut,
  SubscriptionOut,
  TenantOut,
  TenantUsageRow,
  UsageSnapshotOut,
} from '@/api/adminApi'
import { TENANT_ID } from './tenant'
import { at, day } from './time'

const T = (id: string, name: string, slug: string, status: TenantOut['status'], ageDays: number): TenantOut => ({
  id, name, slug, status, config: {}, created_at: at(-ageDays, 10),
})

export const tenants: TenantOut[] = [
  T(TENANT_ID, 'PT Sinar Jaya', 'sinar-jaya', 'active', 200),
  T('t-mitra', 'CV Mitra Sejahtera', 'mitra-sejahtera', 'active', 140),
  T('t-harapan', 'SMK Harapan Bangsa', 'smk-harapan', 'active', 95),
  T('t-klinik', 'Klinik Sehat Sentosa', 'klinik-sentosa', 'active', 30),
  T('t-logistik', 'PT Arus Logistik', 'arus-logistik', 'suspended', 260),
  T('t-kopi', 'Kopi Nusantara Group', 'kopi-nusantara', 'active', 6),
]

const PLAN = (id: string, code: string, name: string): PlanOut => ({
  id, code, name, default_billing_cycle: 'annual', currency: 'IDR', features: {},
  is_active: true, created_at: at(-300, 9), updated_at: at(-40, 9),
})

export const plans: PlanOut[] = [
  PLAN('p-basic', 'BASIC', 'Basic'),
  PLAN('p-pro', 'PRO', 'Pro'),
  PLAN('p-ent', 'ENTERPRISE', 'Enterprise'),
]

export function tiersFor(planId: string): PlanTierOut[] {
  const base = planId === 'p-basic' ? 9000 : planId === 'p-pro' ? 12000 : 15000
  return [
    { min: 1, max: 50, f: 1 },
    { min: 51, max: 200, f: 0.85 },
    { min: 201, max: null, f: 0.7 },
  ].map((t, i) => ({
    id: `${planId}-t${i + 1}`, plan_id: planId, min_users: t.min, max_users: t.max,
    unit_price: Math.round(base * t.f), min_charge: i === 0 ? base * 10 : 0, sort_order: i,
    created_at: at(-300, 9), updated_at: at(-40, 9),
  }))
}

const SUB = (
  id: string, tenantId: string, planId: string, status: SubscriptionOut['status'], endsInDays: number,
): SubscriptionOut => ({
  id, tenant_id: tenantId, plan_id: planId, billing_cycle: status === 'trial' ? 'monthly' : 'annual',
  unit_price_override: null, discount_pct: tenantId === 't-harapan' ? 20 : 0,
  starts_at: day(endsInDays - 365), ends_at: day(endsInDays),
  trial_ends_at: status === 'trial' ? day(endsInDays) : null, status,
  created_at: at(endsInDays - 365, 9), updated_at: at(-10, 9),
})

export const subscriptions: SubscriptionOut[] = [
  SUB('sub-sinar', TENANT_ID, 'p-pro', 'active', 160),
  SUB('sub-mitra', 't-mitra', 'p-basic', 'active', 25),
  SUB('sub-harapan', 't-harapan', 'p-pro', 'past_due', 200),
  SUB('sub-klinik', 't-klinik', 'p-basic', 'trial', 4),
  SUB('sub-logistik', 't-logistik', 'p-ent', 'canceled', -20),
]

const INV = (
  n: number, tenantId: string, status: InvoiceOut['status'], total: number, issuedAgo: number, users: number,
): InvoiceOut => {
  const subtotal = Math.round(total / 1.11)
  return {
    id: `inv-${n}`, invoice_number: `INV-${day().slice(0, 4)}-${String(n).padStart(4, '0')}`,
    tenant_id: tenantId, subscription_id: null, period_start: day(-issuedAgo - 30), period_end: day(-issuedAgo),
    billed_users: users, tier_id: null, subtotal, discount: 0, tax_pct: 11, tax_amount: total - subtotal,
    total, currency: 'IDR', status,
    issued_at: status === 'draft' ? null : at(-issuedAgo, 9),
    due_date: status === 'draft' ? null : day(-issuedAgo + 14),
    paid_at: status === 'paid' ? at(-issuedAgo + 6, 11) : null,
    notes: null,
    lines: [{
      id: `line-${n}`, description: `Langganan ${users} pengguna`, qty: users, unit_price: Math.round(subtotal / users),
      amount: subtotal, sort_order: 0, created_at: at(-issuedAgo, 9), updated_at: at(-issuedAgo, 9),
    }],
    created_at: at(-issuedAgo, 9), updated_at: at(-issuedAgo, 9),
  }
}

export const invoices: InvoiceOut[] = [
  INV(118, TENANT_ID, 'issued', 1_598_400, 5, 12),
  INV(117, 't-harapan', 'issued', 4_262_400, 24, 40),
  INV(116, 't-mitra', 'paid', 1_198_800, 30, 10),
  INV(115, TENANT_ID, 'paid', 1_465_200, 35, 11),
  INV(119, 't-kopi', 'draft', 999_000, 0, 8),
  INV(114, 't-logistik', 'void', 8_880_000, 60, 80),
]

export const billingSummary: BillingSummaryOut = {
  unpaid: { count: 2, by_currency: [{ currency: 'IDR', total: 5_860_800 }] },
  overdue: { count: 1, by_currency: [{ currency: 'IDR', total: 4_262_400 }] },
  draft: { count: 1, by_currency: [{ currency: 'IDR', total: 999_000 }] },
  paid_this_month: { count: 2, by_currency: [{ currency: 'IDR', total: 2_664_000 }] },
  trials_ending: 1,
  past_due_count: 1,
  subscriptions_ending: 1,
  tenants_without_subscription: 1,
}

const USAGE = (
  id: string, name: string, users: number, devices: number, punches: number, delta: number | null,
  plan: string | null, max: number | null,
): TenantUsageRow => ({
  tenant_id: id, tenant_name: name, snapshot_date: day(-1), active_users: users, devices, punches,
  active_users_delta_7d: delta, plan_name: plan, tier_max_users: max, over_tier: max !== null && users > max,
})

export const usageByTenant: TenantUsageRow[] = [
  USAGE(TENANT_ID, 'PT Sinar Jaya', 11, 2, 412, 1, 'Pro', 50),
  USAGE('t-harapan', 'SMK Harapan Bangsa', 212, 4, 6120, 14, 'Pro', 200),
  USAGE('t-mitra', 'CV Mitra Sejahtera', 10, 1, 280, 0, 'Basic', 50),
  USAGE('t-klinik', 'Klinik Sehat Sentosa', 18, 1, 96, null, 'Basic', 50),
  USAGE('t-kopi', 'Kopi Nusantara Group', 8, 1, 12, null, null, null),
]

export function usageSnapshots(tenantId: string): UsageSnapshotOut[] {
  return Array.from({ length: 14 }, (_, i) => ({
    id: `snap-${tenantId}-${i}`, tenant_id: tenantId, snapshot_date: day(-14 + i),
    active_users: 9 + Math.min(i, 2), devices: 2, punches: 18 + ((i * 7) % 6),
    created_at: at(-14 + i, 1), updated_at: at(-14 + i, 1),
  }))
}

export const demoRequests: DemoRequestOut[] = [
  {
    id: 'demo-1', name: 'Ratna Sari', organization: 'Yayasan Pendidikan Cendekia', email: 'ratna@cendekia.sch.id',
    phone: '+62 812-3456-7890', status: 'new', created_at: at(0, 9, 14), updated_at: at(0, 9, 14),
    message: 'Kami punya 3 sekolah dengan total sekitar 450 siswa dan guru. Apakah bisa absen per sesi pelajaran, dan apakah orang tua bisa dapat notifikasi?',
  },
  {
    id: 'demo-2', name: 'Dimas Prakoso', organization: 'PT Bangun Karya', email: 'dimas@bangunkarya.id',
    phone: '+62 821-1111-2222', status: 'new', created_at: at(-1, 15, 2), updated_at: at(-1, 15, 2),
    message: 'Butuh absensi untuk pekerja proyek di 5 lokasi berbeda. Perangkat kami tablet Android.',
  },
  {
    id: 'demo-3', name: 'Fitri Handayani', organization: 'Klinik Pratama Medika', email: 'fitri@medika.co.id',
    phone: null, status: 'contacted', created_at: at(-4, 10), updated_at: at(-3, 11), message: null,
  },
  {
    id: 'demo-4', name: 'Bayu Saputra', organization: 'Toko Roti Sejahtera', email: 'bayu@rotisejahtera.id',
    phone: '+62 857-0000-1234', status: 'closed', created_at: at(-12, 13), updated_at: at(-8, 9),
    message: 'Sudah memakai sistem lain, terima kasih.',
  },
]
