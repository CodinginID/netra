import { useAuthStore } from '@/store/authStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

function makeHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  const tenantId = useAuthStore.getState().selectedTenantId
  const h: Record<string, string> = { ...extra, Authorization: `Bearer ${token}` }
  if (tenantId) h['X-Tenant-Id'] = tenantId
  return h
}

export interface UserItem {
  id: string
  username: string
  full_name?: string
}

export async function fetchUsers(accessToken: string): Promise<UserItem[]> {
  const res = await fetch(`${API_BASE}/users`, {
    headers: makeHeaders(accessToken),
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch users (${res.status})`)
  }
  const json = await res.json()
  // Support both { data: [...] } and plain array responses
  return Array.isArray(json) ? json : (json.data ?? [])
}

export async function grantConsent(accessToken: string, userId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/consents`, {
    method: 'POST',
    headers: makeHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user_id: userId, granted: true, purpose: 'biometric_attendance' }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.detail ?? json.error ?? `Gagal menyimpan consent (${res.status})`)
  }
}

export interface EnrollmentResult {
  user_id: string
  status: string
  message?: string
}

export async function selfEnrollFace(
  accessToken: string,
  imageBlob: Blob
): Promise<EnrollmentResult> {
  const form = new FormData()
  form.append('image', imageBlob, 'face.jpg')

  const res = await fetch(`${API_BASE}/enrollment/self`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })

  const json = await res.json().catch(() => ({}))

  if (res.status === 403) {
    throw new Error(json.detail ?? json.error ?? 'Consent belum diberikan (403)')
  }
  if (!res.ok) {
    throw new Error(json.detail ?? json.error ?? `Enrollment failed (${res.status})`)
  }

  return json.data ?? json
}

export async function selfEnrollMultiAngle(
  accessToken: string,
  blobs: Blob[],
): Promise<EnrollmentResult> {
  const form = new FormData()
  blobs.forEach((blob, i) => form.append('images', blob, `face_${i}.jpg`))

  const res = await fetch(`${API_BASE}/enrollment/self/multi`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })

  const json = await res.json().catch(() => ({}))
  if (res.status === 403) throw new Error(json.detail ?? 'Consent belum diberikan (403)')
  if (!res.ok) throw new Error(json.detail ?? `Enrollment failed (${res.status})`)
  return json.data ?? json
}

export async function enrollFaceMulti(
  accessToken: string,
  userId: string,
  blobs: Blob[],
): Promise<EnrollmentResult> {
  const form = new FormData()
  form.append('user_id', userId)
  blobs.forEach((blob, i) => form.append('images', blob, `face_${i}.jpg`))

  const res = await fetch(`${API_BASE}/enrollment/multi`, {
    method: 'POST',
    headers: makeHeaders(accessToken),
    body: form,
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 403) throw new Error(json.detail ?? 'Consent belum diberikan (403)')
  if (!res.ok) throw new Error(json.detail ?? `Enrollment failed (${res.status})`)
  return json.data ?? json
}

export async function enrollFace(
  accessToken: string,
  userId: string,
  imageBlob: Blob
): Promise<EnrollmentResult> {
  const form = new FormData()
  form.append('user_id', userId)
  form.append('image', imageBlob, 'face.jpg')

  const res = await fetch(`${API_BASE}/enrollment`, {
    method: 'POST',
    headers: makeHeaders(accessToken),
    body: form,
  })

  const json = await res.json().catch(() => ({}))

  if (res.status === 403) {
    throw new Error(json.detail ?? json.error ?? 'Consent belum diberikan (403)')
  }
  if (!res.ok) {
    throw new Error(json.detail ?? json.error ?? `Enrollment failed (${res.status})`)
  }

  return json.data ?? json
}
