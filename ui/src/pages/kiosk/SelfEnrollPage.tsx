import { useRef, useState, useEffect, useCallback, type FormEvent } from 'react'
import { Eye } from 'lucide-react'
import { loginApi } from '@/api/authApi'
import { grantConsent, selfEnrollMultiAngle } from '@/api/enrollmentApi'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import '@/styles/kiosk.css'
import '@/styles/selfenroll.css'

type Step = 'login' | 'capture' | 'consent'
type CapturePhase = 'front' | 'left' | 'right' | 'preview'
type CameraState = 'idle' | 'active' | 'denied' | 'unavailable'

interface Session { token: string; userId: string; name: string }

const PHASE_ORDER: CapturePhase[] = ['front', 'left', 'right', 'preview']

const PHASE_CONFIG: Record<Exclude<CapturePhase, 'preview'>, { label: string; hint: string; arrow?: string; duration: number }> = {
  front: { label: 'Lihat LURUS ke kamera',  hint: 'Pandang langsung ke kamera, jaga posisi',   duration: 3 },
  left:  { label: 'Putar ke KIRI ←',        hint: 'Putar kepala perlahan ke kiri',              arrow: '←', duration: 4 },
  right: { label: 'Putar ke KANAN →',       hint: 'Putar kepala perlahan ke kanan',             arrow: '→', duration: 4 },
}

function decodeSubject(token: string): string {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  return payload.sub
}

export function SelfEnrollPage() {
  const [step, setStep] = useState<Step>('login')
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Login form
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')

  // Active capture
  const [capturePhase, setCapturePhase] = useState<CapturePhase | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const capturePhaseRef = useRef(capturePhase)
  useEffect(() => { capturePhaseRef.current = capturePhase }, [capturePhase])

  // Consent + done
  const [consentChecked, setConsentChecked] = useState(false)
  const [done, setDone] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Face detection overlay — active during capture (not during preview)
  const detectionActive = step === 'capture' && cameraState === 'active' && capturePhase !== 'preview'
  const { hasFace } = useFaceDetection(videoRef, overlayRef, detectionActive)

  useEffect(() => {
    return () => {
      stopCamera()
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      previewUrls.forEach(URL.revokeObjectURL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraState('idle')
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraState('unavailable'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      setCameraState('active')
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch (err) {
      const name = (err as Error).name
      setCameraState(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'unavailable')
    }
  }

  function captureFrame(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return resolve(null)
      canvas.width  = video.videoWidth  || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.save(); ctx.scale(-1, 1)
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
      ctx.restore()
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
    })
  }

  // Run the guided capture sequence: front → left → right → preview
  const runCaptureSequence = useCallback(async () => {
    const phases: Exclude<CapturePhase, 'preview'>[] = ['front', 'left', 'right']
    const blobs: Blob[] = []
    const urls: string[] = []

    for (const phase of phases) {
      const { duration } = PHASE_CONFIG[phase]
      setCapturePhase(phase)

      // Countdown
      await new Promise<void>((resolve) => {
        let remaining = duration
        setCountdown(remaining)
        const id = setInterval(() => {
          remaining -= 1
          setCountdown(remaining)
          if (remaining <= 0) { clearInterval(id); resolve() }
        }, 1000)
      })

      // Capture frame
      const blob = await captureFrame()
      if (!blob) continue
      blobs.push(blob)
      urls.push(URL.createObjectURL(blob))
    }

    setCapturedBlobs(blobs)
    setPreviewUrls(urls)
    setCapturePhase('preview')
  }, []) // captureFrame uses refs only

  // Auto-start sequence 1.2s after camera becomes ready
  useEffect(() => {
    if (step !== 'capture' || cameraState !== 'active' || capturePhase !== null) return
    const t = setTimeout(() => { void runCaptureSequence() }, 1200)
    return () => clearTimeout(t)
  }, [step, cameraState, capturePhase, runCaptureSequence])

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const tokens = await loginApi({ username: username.trim(), password, tenant_slug: tenantSlug.trim() || undefined })
      const userId = decodeSubject(tokens.access_token)
      setSession({ token: tokens.access_token, userId, name: username.trim() })
      setStep('capture')
      void startCamera()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal')
    } finally {
      setBusy(false)
    }
  }

  function retake() {
    previewUrls.forEach(URL.revokeObjectURL)
    setCapturedBlobs([])
    setPreviewUrls([])
    setCapturePhase(null) // triggers useEffect → re-runs sequence
    setError('')
  }

  async function handleSubmit() {
    if (!session || capturedBlobs.length === 0) return
    setError('')
    setBusy(true)
    try {
      await grantConsent(session.token, session.userId)
      await selfEnrollMultiAngle(session.token, capturedBlobs)
      stopCamera()
      setDone(true)
      resetTimerRef.current = setTimeout(resetAll, 6000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pendaftaran gagal')
    } finally {
      setBusy(false)
    }
  }

  function resetAll() {
    previewUrls.forEach(URL.revokeObjectURL)
    stopCamera()
    setStep('login'); setSession(null)
    setUsername(''); setPassword(''); setTenantSlug('')
    setCapturedBlobs([]); setPreviewUrls([])
    setCapturePhase(null); setConsentChecked(false)
    setDone(false); setError('')
  }

  // ── derived
  const phaseIdx = capturePhase && capturePhase !== 'preview' ? PHASE_ORDER.indexOf(capturePhase) : -1
  const phaseConfig = capturePhase && capturePhase !== 'preview' ? PHASE_CONFIG[capturePhase] : null
  const progressPct = phaseConfig ? (1 - countdown / phaseConfig.duration) * 100 : 0

  return (
    <div className="kiosk-page">
      <div className="kiosk-header">
        <div className="kiosk-brand">
          <Eye size={24} strokeWidth={2.5} className="kiosk-brand-icon" />
          <span>netra</span>
        </div>
        <span className="selfenroll-title">Pendaftaran Wajah Mandiri</span>
      </div>

      <div className="kiosk-camera-area">
        {/* Step indicator */}
        <div className="selfenroll-steps">
          <span className={`selfenroll-step ${step === 'login' ? 'active' : 'done'}`}>1. Masuk</span>
          <span className={`selfenroll-step ${step === 'capture' ? 'active' : step === 'consent' ? 'done' : ''}`}>2. Rekam Wajah</span>
          <span className={`selfenroll-step ${step === 'consent' ? 'active' : ''}`}>3. Persetujuan</span>
        </div>

        {error && <div className="kiosk-no-token-warning">{error}</div>}

        {/* ── Step 1: Login ── */}
        {step === 'login' && (
          <form className="selfenroll-form" onSubmit={handleLogin}>
            <p className="selfenroll-hint">Masuk dengan akun Anda untuk mendaftarkan wajah secara mandiri.</p>
            <input className="kiosk-token-input" type="text" placeholder="Username" value={username}
              onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            <input className="kiosk-token-input" type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <input className="kiosk-token-input" type="text" placeholder="Kode institusi (tenant slug)"
              value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} spellCheck={false} />
            <button className="kiosk-btn kiosk-btn-checkin" type="submit" disabled={busy}>
              {busy ? 'Memproses…' : 'Masuk'}
            </button>
          </form>
        )}

        {/* ── Step 2: Active Capture ── */}
        {step === 'capture' && (
          <>
            {/* Phase progress dots */}
            {capturePhase && (
              <div className="selfenroll-phase-dots">
                {(['front', 'left', 'right'] as const).map((p, i) => (
                  <div key={p} className={`selfenroll-phase-dot ${
                    capturePhase === 'preview' || PHASE_ORDER.indexOf(capturePhase) > i
                      ? 'done'
                      : capturePhase === p ? 'active' : ''
                  }`} />
                ))}
              </div>
            )}

            {/* Camera + overlay */}
            <div className="kiosk-camera-wrapper">
              {cameraState === 'active' ? (
                <>
                  <video ref={videoRef} className="kiosk-video" autoPlay playsInline muted />
                  <canvas ref={canvasRef} className="kiosk-canvas" />
                  {capturePhase !== 'preview' && (
                    <canvas ref={overlayRef} className="kiosk-detection-canvas" />
                  )}
                </>
              ) : (
                <div className="kiosk-camera-placeholder">
                  <span className="kiosk-camera-placeholder-icon">
                    {cameraState === 'denied' ? '🚫' : cameraState === 'unavailable' ? '📵' : '📷'}
                  </span>
                  <p>{cameraState === 'denied' ? 'Kamera ditolak browser.' : cameraState === 'unavailable' ? 'Kamera tidak tersedia.' : 'Memuat kamera…'}</p>
                </div>
              )}

              {/* Static oval guide (saat belum ada fase / belum ada wajah) */}
              {cameraState === 'active' && capturePhase !== 'preview' && (
                <div className="kiosk-hud" aria-hidden="true">
                  <svg viewBox="0 0 560 420" className="kiosk-hud-svg">
                    {!hasFace && (
                      <ellipse cx="280" cy="210" rx="110" ry="135"
                        fill="none" stroke="rgba(107,216,203,0.3)" strokeWidth="1.5" strokeDasharray="6 5"/>
                    )}
                    <path d="M 80 130 L 80 90 L 120 90"  fill="none" stroke="rgba(107,216,203,0.7)" strokeWidth="3" strokeLinecap="round"/>
                    <path d="M 480 130 L 480 90 L 440 90" fill="none" stroke="rgba(107,216,203,0.7)" strokeWidth="3" strokeLinecap="round"/>
                    <path d="M 80 290 L 80 330 L 120 330" fill="none" stroke="rgba(107,216,203,0.7)" strokeWidth="3" strokeLinecap="round"/>
                    <path d="M 480 290 L 480 330 L 440 330" fill="none" stroke="rgba(107,216,203,0.7)" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                </div>
              )}

              {/* Phase instruction overlay */}
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

              {/* Waiting for camera */}
              {!capturePhase && cameraState === 'active' && (
                <div className="selfenroll-phase-overlay selfenroll-phase-overlay--dim">
                  <div className="selfenroll-phase-label">Mempersiapkan…</div>
                  <div className="selfenroll-phase-hint">Posisikan wajah Anda di dalam oval</div>
                </div>
              )}
            </div>

            {/* Preview thumbnails setelah 3 angle berhasil */}
            {capturePhase === 'preview' && previewUrls.length > 0 && (
              <>
                <div className="selfenroll-previews">
                  {previewUrls.map((url, i) => (
                    <div key={i} className="selfenroll-preview-thumb">
                      <img src={url} alt={`Sudut ${i + 1}`} />
                      <span>{['Depan', 'Kiri', 'Kanan'][i]}</span>
                    </div>
                  ))}
                </div>
                <div className="kiosk-actions">
                  <button className="kiosk-btn kiosk-btn-checkout" onClick={retake}>Ulangi</button>
                  <button className="kiosk-btn kiosk-btn-checkin" onClick={() => { stopCamera(); setStep('consent') }}>
                    Lanjut
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Step 3: Consent ── */}
        {step === 'consent' && !done && (
          <>
            <div className="selfenroll-previews selfenroll-previews--sm">
              {previewUrls.map((url, i) => (
                <div key={i} className="selfenroll-preview-thumb">
                  <img src={url} alt={`Sudut ${i + 1}`} />
                  <span>{['Depan', 'Kiri', 'Kanan'][i]}</span>
                </div>
              ))}
            </div>
            <div className="selfenroll-consent">
              <p className="selfenroll-consent-text">
                Sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi, data biometrik wajah
                Anda akan dikumpulkan dan diproses untuk keperluan absensi. Data disimpan secara aman
                dan hanya digunakan untuk verifikasi kehadiran. Anda dapat menarik persetujuan ini kapan saja.
              </p>
              <label className="selfenroll-consent-check">
                <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
                Saya menyetujui pengumpulan dan pemrosesan data biometrik wajah saya.
              </label>
            </div>
            <div className="kiosk-actions">
              <button className="kiosk-btn kiosk-btn-checkout" disabled={busy} onClick={() => { setStep('capture'); void startCamera() }}>
                Kembali
              </button>
              <button className="kiosk-btn kiosk-btn-checkin" disabled={busy || !consentChecked} onClick={handleSubmit}>
                {busy ? 'Mendaftar…' : 'Daftarkan Wajah'}
              </button>
            </div>
          </>
        )}

        {/* ── Success ── */}
        {done && (
          <div className="kiosk-camera-wrapper">
            <div className="kiosk-result-overlay success">
              <span className="kiosk-result-icon">✅</span>
              <div className="kiosk-result-name">{session?.name}</div>
              <div className="kiosk-result-status">Wajah berhasil didaftarkan (3 sudut)</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
