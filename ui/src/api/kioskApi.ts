const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export type AttendanceAction = 'checkin' | 'checkout'

export interface AttendanceOut {
  id: string
  user_id: string
  type: 'check_in' | 'check_out'
  status: 'on_time' | 'late' | 'early_leave'
  occurred_at: string
}

export interface AttendanceResult {
  user_id: string
  full_name: string
  similarity: number
  attendance: AttendanceOut
}

export async function postAttendance(
  deviceToken: string,
  action: AttendanceAction,
  imageBlob: Blob,
  livenessScore?: number
): Promise<AttendanceResult> {
  const endpoint = action === 'checkin' ? 'checkin' : 'checkout'
  const form = new FormData()
  form.append('image', imageBlob, 'frame.jpg')
  if (livenessScore !== undefined) {
    form.append('liveness_score', String(livenessScore))
  }

  const res = await fetch(`${API_BASE}/attendance/${endpoint}`, {
    method: 'POST',
    headers: { 'X-Device-Token': deviceToken },
    body: form,
  })

  const json = await res.json().catch(() => ({}))

  if (res.status === 404) {
    throw new KioskError(
      'not_recognized',
      'Wajah belum terdaftar atau tidak cocok. Silakan hubungi admin untuk pendaftaran wajah.',
    )
  }
  if (res.status === 409) {
    throw new KioskError('duplicate', json.detail ?? 'Absensi sudah tercatat hari ini')
  }
  if (res.status === 422) {
    const detail = json.error ?? json.detail ?? 'Validation error'
    // Check if it's a FastAPI validation error (array of field errors)
    if (Array.isArray(detail)) {
      const fieldErrors = detail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
      throw new KioskError('server_error', `Validation error: ${fieldErrors}`)
    }
    // Map server-side validation reasons to clear, human messages.
    const msg = String(detail).toLowerCase()
    if (msg.includes('liveness')) {
      throw new KioskError(
        'liveness_failed',
        'Verifikasi keaslian wajah gagal. Pastikan wajah asli (bukan foto/layar) menghadap kamera dengan pencahayaan cukup.',
      )
    }
    if (msg.includes('empty image') || msg.includes('decode')) {
      throw new KioskError('liveness_failed', 'Gambar tidak terbaca. Coba lagi.')
    }
    if (msg.includes('no face') || msg.includes('face not detected')) {
      throw new KioskError('not_recognized', 'Wajah tidak terdeteksi. Posisikan wajah di tengah kamera.')
    }
    // Generic validation error
    throw new KioskError('server_error', String(detail))
  }
  if (!res.ok) {
    throw new KioskError('server_error', json.error ?? json.detail ?? `Server error (${res.status})`)
  }

  return json.data ?? json
}

export interface Coords {
  lat: number
  lng: number
}

export async function postAutoAttendance(
  deviceToken: string,
  imageBlob: Blob,
  coords?: Coords | null,
): Promise<AttendanceResult> {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.jpg')
  if (coords) {
    form.append('lat', String(coords.lat))
    form.append('lng', String(coords.lng))
  }

  const res = await fetch(`${API_BASE}/attendance/auto`, {
    method: 'POST',
    headers: { 'X-Device-Token': deviceToken },
    body: form,
  })

  const json = await res.json().catch(() => ({}))

  if (res.status === 404) {
    throw new KioskError(
      'not_recognized',
      'Wajah belum terdaftar atau tidak cocok. Silakan hubungi admin untuk pendaftaran wajah.',
    )
  }
  if (res.status === 409) {
    throw new KioskError('duplicate', json.detail ?? 'Absensi sudah tercatat hari ini')
  }
  if (res.status === 422) {
    const detail = json.error ?? json.detail ?? 'Validation error'
    // Check if it's a FastAPI validation error (array of field errors)
    if (Array.isArray(detail)) {
      const fieldErrors = detail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
      throw new KioskError('server_error', `Validation error: ${fieldErrors}`)
    }
    // Map server-side validation reasons to clear, human messages.
    const msg = String(detail).toLowerCase()
    if (msg.includes('liveness')) {
      throw new KioskError(
        'liveness_failed',
        'Verifikasi keaslian wajah gagal. Pastikan wajah asli (bukan foto/layar) menghadap kamera dengan pencahayaan cukup.',
      )
    }
    if (msg.includes('empty image') || msg.includes('decode')) {
      throw new KioskError('liveness_failed', 'Gambar tidak terbaca. Coba lagi.')
    }
    if (msg.includes('no face') || msg.includes('face not detected')) {
      throw new KioskError('not_recognized', 'Wajah tidak terdeteksi. Posisikan wajah di tengah kamera.')
    }
    // Generic validation error
    throw new KioskError('server_error', String(detail))
  }
  if (!res.ok) {
    throw new KioskError('server_error', json.error ?? json.detail ?? `Server error (${res.status})`)
  }

  return json.data ?? json
}

export class KioskError extends Error {
  constructor(
    public readonly code: 'not_recognized' | 'liveness_failed' | 'duplicate' | 'server_error',
    message: string
  ) {
    super(message)
    this.name = 'KioskError'
  }
}

export const DEVICE_TOKEN_KEY = 'netra-kiosk-device-token'

export function getStoredDeviceToken(): string {
  return localStorage.getItem(DEVICE_TOKEN_KEY) ?? ''
}

export function saveDeviceToken(token: string): void {
  localStorage.setItem(DEVICE_TOKEN_KEY, token)
}
