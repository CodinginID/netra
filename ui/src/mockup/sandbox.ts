/* Mengisolasi satu iframe mockup dari browser asli: localStorage di memori,
   sesi login contoh, WebSocket yang diam, dan kamera berupa gambar diam.
   Dipanggil sekali sebelum halaman dirender. */
import { createJSONStorage } from 'zustand/middleware'
import { useAuthStore } from '@/store/authStore'
import { saveDeviceToken } from '@/api/kioskApi'
import type { Role } from '@/types/auth'

/** Kunci yang disalin dari localStorage asli agar tema dan bahasa ikut. */
const COPIED_KEYS = ['netra-theme', 'netra-i18n']

function memoryStorage(): Storage {
  const mem = new Map<string, string>()
  for (const k of COPIED_KEYS) {
    const v = window.localStorage.getItem(k)
    if (v !== null) mem.set(k, v)
  }
  mem.set('netra.onboarding.seen.v1', '1')
  return {
    get length() { return mem.size },
    clear: () => mem.clear(),
    getItem: (k) => mem.get(k) ?? null,
    key: (i) => [...mem.keys()][i] ?? null,
    removeItem: (k) => { mem.delete(k) },
    setItem: (k, v) => { mem.set(k, String(v)) },
  }
}

/** Mulai sekarang semua tulisan ke localStorage hanya hidup di iframe ini. */
function isolateStorage(): void {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  useAuthStore.persist.setOptions({ storage: createJSONStorage(() => window.localStorage) })
}

function signIn(role: Role | null): void {
  if (!role) {
    useAuthStore.setState({ accessToken: null, refreshToken: null, role: null, username: null, isAuthenticated: false })
    return
  }
  const username = role === 'super_admin' ? 'superadmin@netra.id' : 'admin@sinarjaya.co.id'
  useAuthStore.setState({ accessToken: 'mockup', refreshToken: null, role, username, isAuthenticated: true })
}

class SilentSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  readyState = 0
  onopen = null
  onclose = null
  onmessage = null
  onerror = null
  readonly url: string
  constructor(url: string | URL) {
    super()
    this.url = String(url)
  }
  send(): void {}
  close(): void { this.readyState = 3 }
}

function drawCameraFrame(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#334155')
  g.addColorStop(1, '#0f172a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#64748b'
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.42, w * 0.12, h * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.95, w * 0.26, h * 0.28, 0, Math.PI, 0)
  ctx.fill()
}

/** Kamera palsu: stream dari canvas, jadi tidak ada izin kamera yang diminta. */
function fakeCamera(): void {
  const getUserMedia = async (): Promise<MediaStream> => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const tick = () => { drawCameraFrame(ctx, canvas.width, canvas.height); requestAnimationFrame(tick) }
      tick()
    }
    return canvas.captureStream(15)
  }
  const devices = { getUserMedia, enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {} }
  Object.defineProperty(navigator, 'mediaDevices', { value: devices, configurable: true })
}

export interface SandboxOptions {
  role: Role | null
  deviceToken?: string
}

export function installSandbox({ role, deviceToken }: SandboxOptions): void {
  isolateStorage()
  signIn(role)
  if (deviceToken) saveDeviceToken(deviceToken)
  window.WebSocket = SilentSocket as unknown as typeof WebSocket
  fakeCamera()
}
