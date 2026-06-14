const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

export interface UserItem {
  id: string
  username: string
  full_name?: string
}

export async function fetchUsers(accessToken: string): Promise<UserItem[]> {
  const res = await fetch(`${API_BASE}/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch users (${res.status})`)
  }
  const json = await res.json()
  // Support both { data: [...] } and plain array responses
  return Array.isArray(json) ? json : (json.data ?? [])
}

export interface EnrollmentResult {
  user_id: string
  status: string
  message?: string
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
