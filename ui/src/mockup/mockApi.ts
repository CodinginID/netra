/* Pengganti backend untuk mockup: setiap fetch ke API Netra dijawab dari data
   contoh. Permintaan yang tidak dikenali dijawab 404 dan dicatat di console —
   tidak pernah diteruskan ke server asli. */
import * as P from './fixtures/platform'
import * as T from './fixtures/tenant'
import { day } from './fixtures/time'

type Json = unknown
interface Reply { status: number; body?: Json }
type Handler = (url: URL, body: string | null) => Reply

// Basis untuk mengurai URL: href halaman bila bisa (http/file), selain itu
// (about:srcdoc di preview sandbox) basis tiruan — origin "null" tak bisa jadi basis.
const BASE_HREF = /^(https?|file):/.test(window.location.href) ? window.location.href : 'http://mockup.invalid/'
const API = new URL(import.meta.env.VITE_API_BASE_URL ?? '/api/v1', BASE_HREF)
const API_PATH = API.pathname

const ok = (data: Json): Reply => ({ status: 200, body: { data } })
const noContent: Reply = { status: 204 }

function page<X>(items: X[], url: URL): Reply {
  const limit = Number(url.searchParams.get('limit')) || items.length || 10
  const current = Number(url.searchParams.get('page')) || 1
  const slice = items.slice((current - 1) * limit, current * limit)
  return ok({ items: slice, total: items.length, page: current, limit, pages: Math.max(1, Math.ceil(items.length / limit)) })
}

function search<X extends { full_name?: string; name?: string }>(items: X[], url: URL): X[] {
  const q = (url.searchParams.get('search') ?? '').toLowerCase()
  return q ? items.filter((x) => (x.full_name ?? x.name ?? '').toLowerCase().includes(q)) : items
}

function byField<X>(items: X[], url: URL, field: keyof X & string): X[] {
  const v = url.searchParams.get(field)
  return v ? items.filter((x) => String(x[field]) === v) : items
}

/** Token JWT palsu: hanya `sub` yang dibaca UI (authStore.setTokens). */
function fakeJwt(sub: string): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${enc({ alg: 'none' })}.${enc({ sub })}.mockup`
}

function login(body: string | null): Reply {
  const { email = '', password = '' } = JSON.parse(body ?? '{}') as { email?: string; password?: string }
  if (password !== 'netra123') return { status: 401, body: { error: 'Password salah' } }
  const role = email.startsWith('super') ? 'super_admin' : 'tenant_admin'
  return ok({ access_token: fakeJwt(email), refresh_token: 'mockup', role, token_type: 'bearer' })
}

/** GET routes — urutan penting: yang spesifik sebelum yang berparameter. */
const GET: Array<[RegExp, Handler]> = [
  [/^\/users\/trash$/, (u) => page(T.trashedUsers, u)],
  [/^\/users$/, (u) => page(search(T.users, u), u)],
  [/^\/devices\/trash$/, (u) => page(T.trashedDevices, u)],
  [/^\/devices\/[^/]+\/token$/, () => ok({ ...T.devices[0], token: 'ntr_dev_contoh_8c1f0a' })],
  [/^\/devices$/, (u) => page(T.devices, u)],
  [/^\/schedules\/trash$/, (u) => page([], u)],
  [/^\/schedules$/, (u) => {
    const type = u.searchParams.get('type')
    const rows = type ? T.schedules.filter((s) => s.rules.type === type) : T.schedules
    const counts = { all: T.schedules.length, shift: 2, session: 1 }
    const reply = page(rows, u) as { status: number; body: { data: object } }
    return ok({ ...reply.body.data, counts })
  }],
  [/^\/attendance$/, (u) => page(byField(T.attendance, u, 'user_id'), u)],
  [/^\/reports\/attendance\/daily$/, (u) => ok(T.dailyRecap(u.searchParams.get('date') ?? day()))],
  [/^\/reports\/attendance\/status$/, () => ok(T.dailyStatus)],
  [/^\/api-keys\/scopes$/, () => ok(T.apiScopes)],
  [/^\/api-keys$/, () => ok(T.apiKeys)],
  [/^\/onboarding\/status$/, () => ok(T.onboarding)],
  [/^\/tenants$/, (u) => page(search(P.tenants, u), u)],
  [/^\/billing\/plans\/([^/]+)\/tiers$/, (u) => ok(P.tiersFor(u.pathname.split('/').slice(-2, -1)[0] ?? ''))],
  [/^\/billing\/plans\/[^/]+$/, (u) => ok(P.plans.find((p) => u.pathname.endsWith(p.id)) ?? P.plans[0])],
  [/^\/billing\/plans$/, (u) => page(P.plans, u)],
  [/^\/billing\/subscriptions$/, (u) => page(byField(P.subscriptions, u, 'tenant_id'), u)],
  [/^\/billing\/usage\/by-tenant$/, () => ok(P.usageByTenant)],
  [/^\/billing\/usage$/, (u) => page(P.usageSnapshots(u.searchParams.get('tenant_id') ?? T.TENANT_ID), u)],
  [/^\/billing\/summary$/, () => ok(P.billingSummary)],
  [/^\/billing\/invoices\/[^/]+$/, (u) => ok(P.invoices.find((i) => u.pathname.endsWith(i.id)) ?? P.invoices[0])],
  [/^\/billing\/invoices$/, (u) => page(byField(byField(P.invoices, u, 'tenant_id'), u, 'status'), u)],
  [/^\/demo-requests$/, (u) => page(byField(P.demoRequests, u, 'status'), u)],
  [/^\/embed\/session$/, () => ok({
    purpose: 'enrollment', external_id: 'EMP-0042', full_name: 'Rina Wijaya', is_minor: false,
    return_origin: 'https://hr.sinarjaya.co.id',
  })],
]

/** Mutasi: jawaban sukses generik, kecuali yang perlu bentuk khusus. */
const WRITE: Array<[RegExp, Handler]> = [
  [/^\/auth\/check-email$/, () => ok({ exists: true })],
  [/^\/auth\/login$/, (_u, b) => login(b)],
  [/^\/attendance\/auto$/, () => ok({
    user_id: 'u-001', full_name: 'Rina Wijaya', similarity: 0.93,
    attendance: { id: 'a-new', user_id: 'u-001', type: 'check_in', status: 'on_time', occurred_at: new Date().toISOString() },
  })],
]

function route(method: string, url: URL, body: string | null): Reply {
  const path = url.pathname.slice(API_PATH.length) || '/'
  const table = method === 'GET' ? GET : WRITE
  const hit = table.find(([re]) => re.test(path))
  if (hit) return hit[1](url, body)
  if (method === 'DELETE') return noContent
  if (method !== 'GET') return ok(JSON.parse(body ?? '{}'))
  console.warn(`[mockup] tidak ada data contoh untuk GET ${path}`)
  return { status: 404, body: { error: `Mockup: tidak ada data untuk ${path}` } }
}

function bodyText(init?: RequestInit): string | null {
  return typeof init?.body === 'string' ? init.body : null
}

/** Pasang pengganti `window.fetch`. Hanya URL di bawah API Netra yang dibelokkan. */
export function installMockFetch(delayMs = 150): void {
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : String(input)
    const url = new URL(raw, BASE_HREF)
    if (url.origin !== API.origin || !url.pathname.startsWith(API_PATH)) return real(input, init)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const reply = route(method, url, bodyText(init))
    await new Promise((r) => setTimeout(r, delayMs))
    const payload = reply.status === 204 ? null : JSON.stringify(reply.body ?? {})
    return new Response(payload, { status: reply.status, headers: { 'Content-Type': 'application/json' } })
  }
}
