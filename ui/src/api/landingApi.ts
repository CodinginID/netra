const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export interface DemoRequestPayload {
  name: string
  organization: string
  email: string
  phone?: string
  message?: string
}

/** Public, unauthenticated submission from the marketing landing page. */
export async function submitDemoRequest(payload: DemoRequestPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/demo-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (res.ok) return

  const json = await res.json().catch(() => ({}))
  if (Array.isArray(json.detail)) {
    const msgs = json.detail
      .map((d: unknown) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : null))
      .filter((m: string | null): m is string => Boolean(m))
    if (msgs.length) throw new Error(msgs.join('; '))
  }
  if (typeof json.detail === 'string') throw new Error(json.detail)
  if (res.status === 429) throw new Error('Terlalu banyak permintaan. Coba lagi beberapa saat lagi.')
  throw new Error(`Request failed (${res.status})`)
}
