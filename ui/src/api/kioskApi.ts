const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

export type AttendanceAction = 'checkin' | 'checkout'

export interface AttendanceResult {
  user_id: string
  full_name: string
  status: 'on_time' | 'late' | 'early_leave'
  action: AttendanceAction
  timestamp: string
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
    throw new KioskError('not_recognized', json.detail ?? 'Wajah tidak dikenali')
  }
  if (res.status === 422) {
    throw new KioskError('liveness_failed', json.detail ?? 'Liveness gagal')
  }
  if (!res.ok) {
    throw new KioskError('server_error', json.detail ?? json.error ?? `Server error (${res.status})`)
  }

  return json.data ?? json
}

export class KioskError extends Error {
  constructor(
    public readonly code: 'not_recognized' | 'liveness_failed' | 'server_error',
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
