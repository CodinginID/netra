# Embed Enrollment Guided Face Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the embed enrollment page's bare camera + manual-button capture with a guided 3-angle (front/left/right) capture flow that has live face-detection overlay, an animated oval guide, countdown, and clear Indonesian instructions — matching the kiosk self-enroll UX.

**Architecture:** A new hook `useGuidedCapture` (front/left/right timed sequence + preview/retake state machine) is extracted for `EmbedEnrollPage` to consume alongside the existing `useFaceDetection` hook. `EmbedEnrollPage.tsx`'s `camera`/`submitting` phases are rewritten to drive this hook and render the guide UI, reusing existing `kiosk.css`/`selfenroll.css` classes. No backend changes (already accepts 1–3 images).

**Tech Stack:** React + TypeScript (Vite), existing `useFaceDetection` hook (MediaPipe, already a dependency), plain CSS classes from `kiosk.css`/`selfenroll.css`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-11-embed-enroll-guided-capture-design.md`
- Do not modify `SelfEnrollPage.tsx` or `kiosk.css`/`selfenroll.css` content — only *import* the existing CSS files into `EmbedEnrollPage.tsx` and reuse class names verbatim.
- No i18n migration — new copy is hardcoded Indonesian strings, matching this file's existing convention (it doesn't use `useI18n` today).
- No backend changes.
- This repo's `ui/` has no test framework configured (no vitest/jest, no existing `*.test.*` files) — verification is `npm --prefix ui run build` (tsc + vite build) for type/build correctness, plus a manual dev-server walkthrough. Do not introduce a test framework as part of this plan.
- Keep files under 500 lines (CLAUDE.md project rule).

---

### Task 1: `useGuidedCapture` hook

**Files:**
- Create: `ui/src/hooks/useGuidedCapture.ts`

**Interfaces:**
- Produces (consumed by Task 2):
  - `export type GuidedCapturePhase = 'front' | 'left' | 'right' | 'preview'`
  - `export const GUIDED_CAPTURE_PHASE_ORDER: Exclude<GuidedCapturePhase, 'preview'>[]` (value `['front', 'left', 'right']`)
  - `export interface CapturePhaseConfig { label: string; hint: string; arrow?: string; duration: number }`
  - `export function useGuidedCapture(args: { active: boolean; phases: Record<Exclude<GuidedCapturePhase, 'preview'>, CapturePhaseConfig>; captureFrame: () => Promise<Blob | null> }): { capturePhase: GuidedCapturePhase | null; countdown: number; capturedBlobs: Blob[]; previewUrls: string[]; phaseIdx: number; phaseConfig: CapturePhaseConfig | null; progressPct: number; retake: () => void }`

- [ ] **Step 1: Write the hook**

Create `ui/src/hooks/useGuidedCapture.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

export interface CapturePhaseConfig {
  label: string
  hint: string
  arrow?: string
  duration: number
}

export type GuidedCapturePhase = 'front' | 'left' | 'right' | 'preview'

export const GUIDED_CAPTURE_PHASE_ORDER: Exclude<GuidedCapturePhase, 'preview'>[] = ['front', 'left', 'right']

interface UseGuidedCaptureArgs {
  /** Sequence auto-starts (after a short delay) once true, unless a capture is already in progress or done. */
  active: boolean
  phases: Record<Exclude<GuidedCapturePhase, 'preview'>, CapturePhaseConfig>
  captureFrame: () => Promise<Blob | null>
}

interface UseGuidedCaptureResult {
  capturePhase: GuidedCapturePhase | null
  countdown: number
  capturedBlobs: Blob[]
  previewUrls: string[]
  phaseIdx: number
  phaseConfig: CapturePhaseConfig | null
  progressPct: number
  retake: () => void
}

/** Guided multi-angle face capture: front -> left -> right, each on a fixed countdown, then preview. */
export function useGuidedCapture({ active, phases, captureFrame }: UseGuidedCaptureArgs): UseGuidedCaptureResult {
  const [capturePhase, setCapturePhase] = useState<GuidedCapturePhase | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  const captureFrameRef = useRef(captureFrame)
  captureFrameRef.current = captureFrame

  const runSequence = useCallback(async () => {
    const blobs: Blob[] = []
    const urls: string[] = []

    for (const phase of GUIDED_CAPTURE_PHASE_ORDER) {
      const { duration } = phases[phase]
      setCapturePhase(phase)

      await new Promise<void>((resolve) => {
        let remaining = duration
        setCountdown(remaining)
        const id = setInterval(() => {
          remaining -= 1
          setCountdown(remaining)
          if (remaining <= 0) {
            clearInterval(id)
            resolve()
          }
        }, 1000)
      })

      const blob = await captureFrameRef.current()
      if (!blob) continue
      blobs.push(blob)
      urls.push(URL.createObjectURL(blob))
    }

    setCapturedBlobs(blobs)
    setPreviewUrls(urls)
    setCapturePhase('preview')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases])

  // Auto-start 1.2s after `active` flips true, unless a sequence already ran/is running.
  useEffect(() => {
    if (!active || capturePhase !== null) return
    const t = setTimeout(() => { void runSequence() }, 1200)
    return () => clearTimeout(t)
  }, [active, capturePhase, runSequence])

  // Revoke any outstanding object URLs on unmount only.
  const previewUrlsRef = useRef(previewUrls)
  previewUrlsRef.current = previewUrls
  useEffect(() => {
    return () => { previewUrlsRef.current.forEach(URL.revokeObjectURL) }
  }, [])

  const retake = useCallback(() => {
    previewUrls.forEach(URL.revokeObjectURL)
    setCapturedBlobs([])
    setPreviewUrls([])
    setCapturePhase(null)
  }, [previewUrls])

  const phaseIdx = capturePhase && capturePhase !== 'preview' ? GUIDED_CAPTURE_PHASE_ORDER.indexOf(capturePhase) : -1
  const phaseConfig = capturePhase && capturePhase !== 'preview' ? phases[capturePhase] : null
  const progressPct = phaseConfig ? (1 - countdown / phaseConfig.duration) * 100 : 0

  return { capturePhase, countdown, capturedBlobs, previewUrls, phaseIdx, phaseConfig, progressPct, retake }
}
```

- [ ] **Step 2: Verify it type-checks and builds**

Run: `npm --prefix /Users/anonymous/Documents/office/codinginid/netra/ui run build`
Expected: build succeeds with no TypeScript errors (this hook isn't wired into any page yet, so it's dead code at this point — that's fine, `tsc` still checks unused exported files without warning since it's a module, not an unused local variable).

- [ ] **Step 3: Commit**

```bash
git add ui/src/hooks/useGuidedCapture.ts
git commit -m "feat: add useGuidedCapture hook for multi-angle face capture"
```

---

### Task 2: Rewire `EmbedEnrollPage` to use guided capture

**Files:**
- Modify: `ui/src/pages/embed/EmbedEnrollPage.tsx` (full rewrite of the `camera`/`submitting` phase logic and JSX; `loading`/`invalid`/`consent`/`success`/`error` phases keep their existing behavior)

**Interfaces:**
- Consumes from Task 1: `useGuidedCapture`, `GUIDED_CAPTURE_PHASE_ORDER`, `CapturePhaseConfig` from `@/hooks/useGuidedCapture`.
- Consumes existing: `useFaceDetection` from `@/hooks/useFaceDetection` (signature: `(videoRef: RefObject<HTMLVideoElement>, overlayRef: RefObject<HTMLCanvasElement>, active: boolean) => { hasFace: boolean; detectorReady: boolean }`).
- Consumes existing CSS classes (verified present, do not invent new ones): `.kiosk-camera-wrapper`, `.kiosk-video`, `.kiosk-detection-canvas`, `.kiosk-hud`, `.kiosk-hud-svg`, `.selfenroll-phase-dots`, `.selfenroll-phase-dot` (+ `.active`/`.done`), `.selfenroll-phase-overlay` (+ `.selfenroll-phase-overlay--dim`), `.selfenroll-phase-label`, `.selfenroll-arrow`, `.selfenroll-phase-hint`, `.selfenroll-countdown-wrap`/`-bar`/`-fill`/`-num`, `.selfenroll-phase-num`, `.selfenroll-previews` (+ `.selfenroll-previews--sm`), `.selfenroll-preview-thumb`.
- Note: `.kiosk-actions` / `.kiosk-btn-checkout` are referenced by `SelfEnrollPage.tsx` but have **no** CSS definition anywhere in the repo (pre-existing gap, confirmed via grep across `ui/src/styles/`) — do not reuse them; build the Ulangi/Lanjut action row with this file's own inline `styles` object instead (as below).

- [ ] **Step 1: Replace the full file content**

Replace all of `ui/src/pages/embed/EmbedEnrollPage.tsx` with:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { GUIDED_CAPTURE_PHASE_ORDER, useGuidedCapture, type CapturePhaseConfig } from '@/hooks/useGuidedCapture'
import '@/styles/kiosk.css'
import '@/styles/selfenroll.css'

/**
 * Chromeless enrollment page meant to be loaded inside a client app's <iframe>.
 * Auth is the one-time embed token from the URL (?token=). It bootstraps context
 * from GET /embed/session, guides a 3-angle face capture, POSTs to /embed/enroll,
 * then reports the result back to the parent app via postMessage.
 *
 * No sidebar/topbar/login — see docs embed plan §6.7.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1'

const PHASE_CONFIG: Record<'front' | 'left' | 'right', CapturePhaseConfig> = {
  front: { label: 'Hadapkan wajah lurus ke kamera', hint: 'Pastikan wajah terlihat jelas dan pencahayaan cukup', duration: 3 },
  left: { label: 'Putar wajah ke kiri', hint: 'Tahan posisi hingga hitungan selesai', arrow: '←', duration: 4 },
  right: { label: 'Putar wajah ke kanan', hint: 'Tahan posisi hingga hitungan selesai', arrow: '→', duration: 4 },
}

const PREVIEW_LABELS = ['Depan', 'Kiri', 'Kanan']

interface SessionInfo {
  purpose: string
  external_id: string | null
  full_name: string | null
  is_minor: boolean
  return_origin: string
}

type Phase = 'loading' | 'invalid' | 'consent' | 'camera' | 'submitting' | 'success' | 'error'

function notifyParent(returnOrigin: string | undefined, msg: Record<string, unknown>) {
  if (!returnOrigin) return
  try {
    window.parent?.postMessage({ source: 'netra', ...msg }, returnOrigin)
  } catch {
    /* parent gone / origin mismatch — ignore */
  }
}

export function EmbedEnrollPage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [phase, setPhase] = useState<Phase>('loading')
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)
  const [guardian, setGuardian] = useState('')
  const [cameraReady, setCameraReady] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // 1. Bootstrap session context.
  useEffect(() => {
    if (!token) {
      setPhase('invalid')
      setErrorMsg('Token tidak ditemukan')
      return
    }
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/embed/session`, {
          headers: { 'X-Embed-Token': token },
        })
        if (!res.ok) {
          setPhase('invalid')
          setErrorMsg(res.status === 401 ? 'Sesi tidak valid atau kedaluwarsa' : `Gagal memuat sesi (${res.status})`)
          return
        }
        const json = await res.json()
        setInfo(json.data as SessionInfo)
        setPhase('consent')
      } catch {
        setPhase('invalid')
        setErrorMsg('Tidak dapat terhubung ke server')
      }
    })()
  }, [token])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraReady(false)
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  async function startCamera() {
    if (!consentChecked) return
    if (info?.is_minor && !guardian.trim()) return
    setPhase('camera')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraReady(true)
    } catch {
      setPhase('error')
      setErrorMsg('Kamera tidak dapat diakses. Pastikan izin kamera diberikan.')
    }
  }

  const captureFrame = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return resolve(null)
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
      ctx.restore()
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    })
  }, [])

  const { capturePhase, countdown, capturedBlobs, previewUrls, phaseIdx, phaseConfig, progressPct, retake } =
    useGuidedCapture({ active: phase === 'camera' && cameraReady, phases: PHASE_CONFIG, captureFrame })

  const detectionActive = phase === 'camera' && cameraReady && capturePhase !== 'preview'
  const { hasFace } = useFaceDetection(videoRef, overlayRef, detectionActive)

  async function submit() {
    if (capturedBlobs.length === 0) {
      setPhase('error')
      setErrorMsg('Gagal mengambil gambar')
      return
    }
    stopCamera()
    setPhase('submitting')
    const form = new FormData()
    capturedBlobs.forEach((blob, i) => form.append('images', blob, `face-${i}.jpg`))
    form.append('consent', 'true')
    if (info?.is_minor) form.append('guardian_name', guardian.trim())

    try {
      const res = await fetch(`${API_BASE}/embed/enroll`, {
        method: 'POST',
        headers: { 'X-Embed-Token': token },
        body: form,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = json.detail ?? json.error ?? `Enrollment gagal (${res.status})`
        setPhase('error')
        setErrorMsg(msg)
        notifyParent(info?.return_origin, { type: 'enroll:error', message: msg })
        return
      }
      setPhase('success')
      notifyParent(info?.return_origin, {
        type: 'enroll:success',
        user_id: json.data?.user_id,
        external_id: info?.external_id,
      })
    } catch {
      setPhase('error')
      setErrorMsg('Tidak dapat terhubung ke server')
      notifyParent(info?.return_origin, { type: 'enroll:error', message: 'network' })
    }
  }

  function retryFromError() {
    retake()
    setPhase(info ? 'consent' : 'invalid')
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {phase === 'loading' && <p style={styles.muted}>Memuat…</p>}

        {phase === 'invalid' && (
          <>
            <h2 style={styles.title}>Sesi tidak tersedia</h2>
            <p style={styles.muted}>{errorMsg}</p>
          </>
        )}

        {phase === 'consent' && info && (
          <>
            <h2 style={styles.title}>Daftar Wajah</h2>
            {info.full_name && <p style={styles.muted}>Untuk: <strong>{info.full_name}</strong></p>}
            <label style={styles.consentRow}>
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
              <span>Saya menyetujui perekaman & pemrosesan data biometrik wajah untuk keperluan absensi.</span>
            </label>
            {info.is_minor && (
              <div style={styles.field}>
                <label style={styles.label}>Nama Wali / Orang Tua (wajib untuk di bawah umur)</label>
                <input
                  style={styles.input}
                  value={guardian}
                  onChange={(e) => setGuardian(e.target.value)}
                  placeholder="Nama wali"
                />
              </div>
            )}
            <button
              style={{ ...styles.btn, ...(canProceed(consentChecked, info, guardian) ? {} : styles.btnDisabled) }}
              disabled={!canProceed(consentChecked, info, guardian)}
              onClick={() => void startCamera()}
            >
              Lanjut ke Kamera
            </button>
          </>
        )}

        {(phase === 'camera' || phase === 'submitting') && (
          <>
            <h2 style={styles.title}>
              {capturePhase === 'preview' ? 'Periksa hasil foto' : 'Rekam Wajah'}
            </h2>
            <p style={styles.muted}>
              {capturePhase === 'preview'
                ? 'Pastikan ketiga foto jelas sebelum melanjutkan.'
                : 'Ikuti instruksi di bawah kamera. Foto diambil otomatis.'}
            </p>

            {capturePhase && capturePhase !== 'preview' && (
              <div className="selfenroll-phase-dots">
                {GUIDED_CAPTURE_PHASE_ORDER.map((p, i) => (
                  <div
                    key={p}
                    className={`selfenroll-phase-dot ${phaseIdx > i ? 'done' : capturePhase === p ? 'active' : ''}`}
                  />
                ))}
              </div>
            )}

            <div className="kiosk-camera-wrapper" style={styles.videoWrap}>
              <video ref={videoRef} className="kiosk-video" autoPlay playsInline muted />

              {cameraReady && capturePhase !== 'preview' && (
                <canvas ref={overlayRef} className="kiosk-detection-canvas" />
              )}

              {cameraReady && capturePhase !== 'preview' && (
                <div className="kiosk-hud" aria-hidden="true">
                  <svg viewBox="0 0 560 420" className="kiosk-hud-svg">
                    {!hasFace && (
                      <ellipse cx="280" cy="210" rx="110" ry="135"
                        fill="none" stroke="rgba(107,216,203,0.3)" strokeWidth="1.5" strokeDasharray="6 5" />
                    )}
                    <path d="M 80 130 L 80 90 L 120 90" fill="none" stroke="rgba(107,216,203,0.7)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M 480 130 L 480 90 L 440 90" fill="none" stroke="rgba(107,216,203,0.7)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M 80 290 L 80 330 L 120 330" fill="none" stroke="rgba(107,216,203,0.7)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M 480 290 L 480 330 L 440 330" fill="none" stroke="rgba(107,216,203,0.7)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
              )}

              {phaseConfig && (
                <div className="selfenroll-phase-overlay">
                  <div className="selfenroll-phase-label">
                    {phaseConfig.arrow && <span className="selfenroll-arrow">{phaseConfig.arrow}</span>}
                    {phaseConfig.label}
                  </div>
                  <div className="selfenroll-phase-hint">{phaseConfig.hint}</div>
                  <div className="selfenroll-countdown-wrap">
                    <div className="selfenroll-countdown-bar">
                      <div className="selfenroll-countdown-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="selfenroll-countdown-num">{countdown}s</span>
                  </div>
                  <div className="selfenroll-phase-num">{phaseIdx + 1} / 3</div>
                </div>
              )}

              {cameraReady && !capturePhase && (
                <div className="selfenroll-phase-overlay selfenroll-phase-overlay--dim">
                  <div className="selfenroll-phase-label">Bersiap…</div>
                  <div className="selfenroll-phase-hint">Posisikan wajah Anda di dalam oval</div>
                </div>
              )}
            </div>

            {capturePhase === 'preview' && previewUrls.length > 0 && (
              <>
                <div className="selfenroll-previews selfenroll-previews--sm">
                  {previewUrls.map((url, i) => (
                    <div key={i} className="selfenroll-preview-thumb">
                      <img src={url} alt={PREVIEW_LABELS[i]} />
                      <span>{PREVIEW_LABELS[i]}</span>
                    </div>
                  ))}
                </div>
                <div style={styles.actionsRow}>
                  <button style={styles.btnSecondary} disabled={phase === 'submitting'} onClick={retake}>
                    Ulangi
                  </button>
                  <button
                    style={{ ...styles.btn, flex: 1, width: 'auto', ...(phase === 'submitting' ? styles.btnDisabled : {}) }}
                    disabled={phase === 'submitting'}
                    onClick={() => void submit()}
                  >
                    {phase === 'submitting' ? 'Memproses…' : 'Lanjut'}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {phase === 'success' && (
          <>
            <div style={styles.bigIcon}>✅</div>
            <h2 style={styles.title}>Wajah berhasil didaftarkan</h2>
            <p style={styles.muted}>Anda dapat menutup jendela ini.</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div style={styles.bigIcon}>⚠️</div>
            <h2 style={styles.title}>Gagal</h2>
            <p style={styles.muted}>{errorMsg}</p>
            <button style={styles.btn} onClick={retryFromError}>Coba lagi</button>
          </>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

function canProceed(consent: boolean, info: SessionInfo, guardian: string): boolean {
  if (!consent) return false
  if (info.is_minor && !guardian.trim()) return false
  return true
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f1f5f9',
    padding: 16,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 8px 30px rgba(15,23,42,0.12)',
    textAlign: 'center',
  },
  title: { fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '4px 0 10px' },
  muted: { fontSize: 14, color: '#64748b', margin: '4px 0' },
  consentRow: { display: 'flex', gap: 8, alignItems: 'flex-start', textAlign: 'left', fontSize: 13, color: '#334155', margin: '14px 0' },
  field: { textAlign: 'left', marginBottom: 14 },
  label: { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 },
  videoWrap: { margin: '8px 0 16px' },
  btn: { width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0d9488', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  bigIcon: { fontSize: 44, marginBottom: 8 },
  actionsRow: { display: 'flex', gap: 10 },
}
```

- [ ] **Step 2: Verify it type-checks and builds**

Run: `npm --prefix /Users/anonymous/Documents/office/codinginid/netra/ui run build`
Expected: build succeeds with no TypeScript errors, no missing-import errors for `@/hooks/useGuidedCapture`, `@/hooks/useFaceDetection`, `@/styles/kiosk.css`, `@/styles/selfenroll.css`.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/embed/EmbedEnrollPage.tsx
git commit -m "feat: guided 3-angle face capture with live overlay for embed enrollment"
```

---

### Task 3: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm --prefix /Users/anonymous/Documents/office/codinginid/netra/ui run dev`
Expected: Vite dev server starts without errors.

- [ ] **Step 2: Walk the flow in a real browser with a camera**

Open `http://localhost:5173/embed/enroll?token=<a valid embed session token minted via POST /integration/embed-sessions>` (adjust host/port to whatever `vite` printed) and confirm:
- Consent step unchanged (checkbox, guardian field for minors, "Lanjut ke Kamera" button).
- After granting camera permission: front phase shows the oval guide, live bounding-box overlay reacting to your face, "Hadapkan wajah lurus ke kamera" label, a 3s countdown bar, and phase dot 1 active.
- Left phase (4s, `←` arrow, "Putar wajah ke kiri") and right phase (4s, `→` arrow, "Putar wajah ke kanan") follow automatically.
- Preview step shows 3 thumbnails labeled Depan/Kiri/Kanan with "Ulangi" and "Lanjut" buttons.
- "Ulangi" restarts the front→left→right sequence cleanly (no leftover thumbnails, no duplicate timers — countdown should read exactly 3 again on front).
- "Lanjut" stops the camera, shows "Memproses…", then either the success screen or a server error message (test with an already-consumed/expired token to see the error path, then confirm "Coba lagi" returns to consent with the guided-capture state reset — the next attempt should start a fresh front/left/right sequence, not jump straight to a stale preview).

This step requires human interaction (camera permission, a live face, a valid backend-issued token) and cannot be scripted — perform it manually and report any visual glitch back for a follow-up fix rather than deferring it.
