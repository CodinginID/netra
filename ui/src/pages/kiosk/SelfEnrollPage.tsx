import { useRef, useState, useEffect, useCallback, type FormEvent } from 'react'
import { CameraOff, Check, Loader2 } from 'lucide-react'
import { loginApi } from '@/api/authApi'
import { grantConsent, selfEnrollMultiAngle } from '@/api/enrollmentApi'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { useI18n } from '@/store/i18nStore'
import { AngleChips, EnrollBrand, EnrollCamera, EnrollPreviews, EnrollResult, EnrollSteps } from './EnrollParts'
import '@/styles/selfenroll.css'

type Step = 'login' | 'capture' | 'consent'
type CapturePhase = 'front' | 'left' | 'right' | 'preview'
type CameraState = 'idle' | 'active' | 'denied' | 'unavailable'

interface Session { token: string; userId: string; name: string }

const PHASE_ORDER: CapturePhase[] = ['front', 'left', 'right', 'preview']

const PHASE_CONFIG: Record<Exclude<CapturePhase, 'preview'>, { labelKey: string; hintKey: string; arrow?: string; duration: number }> = {
  front: { labelKey: 'selfenroll.look_straight',  hintKey: 'selfenroll.look_straight_hint',   duration: 3 },
  left:  { labelKey: 'selfenroll.turn_left',      hintKey: 'selfenroll.turn_left_hint',       arrow: '←', duration: 4 },
  right: { labelKey: 'selfenroll.turn_right',     hintKey: 'selfenroll.turn_right_hint',      arrow: '→', duration: 4 },
}

function decodeSubject(token: string): string {
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  return payload.sub
}

export function SelfEnrollPage() {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('login')
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Login form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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
      const tokens = await loginApi({ email: email.trim().toLowerCase(), password })
      const userId = decodeSubject(tokens.access_token)
      setSession({ token: tokens.access_token, userId, name: email.trim() })
      setStep('capture')
      void startCamera()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('selfenroll.login_failed'))
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
      setError(err instanceof Error ? err.message : t('selfenroll.enrollment_failed'))
    } finally {
      setBusy(false)
    }
  }

  function resetAll() {
    previewUrls.forEach(URL.revokeObjectURL)
    stopCamera()
    setStep('login'); setSession(null)
    setEmail(''); setPassword('')
    setCapturedBlobs([]); setPreviewUrls([])
    setCapturePhase(null); setConsentChecked(false)
    setDone(false); setError('')
  }

  // ── derived
  const phaseIdx = capturePhase && capturePhase !== 'preview' ? PHASE_ORDER.indexOf(capturePhase) : -1
  const phaseConfig = capturePhase && capturePhase !== 'preview' ? PHASE_CONFIG[capturePhase] : null
  const progressPct = phaseConfig ? (1 - countdown / phaseConfig.duration) * 100 : 0
  const stepIdx = done ? 2 : step === 'login' ? 0 : step === 'capture' ? 1 : 2
  const angleLabels = { front: t('selfenroll.front'), left: t('selfenroll.left'), right: t('selfenroll.right') }
  const previewLabels = [angleLabels.front, angleLabels.left, angleLabels.right]
  const heading = step === 'login' ? t('selfenroll.login_heading')
    : step === 'capture' ? (capturePhase === 'preview' ? t('selfenroll.check_heading') : t('selfenroll.capture_heading'))
    : t('selfenroll.consent_heading')

  return (
    <div className="se-page">
      <main className="se-shell">
        <EnrollBrand title={t('selfenroll.title')} />
        <EnrollSteps
          labels={[t('selfenroll.step_login'), t('selfenroll.step_capture'), t('selfenroll.step_consent')]}
          current={stepIdx}
        />

        {!done && <h1 className="se-heading">{heading}</h1>}

        {error && <div className="se-error" role="alert" aria-live="assertive">{error}</div>}

        {/* ── Step 1: Login ── */}
        {step === 'login' && (
          <form className="se-card se-form" onSubmit={handleLogin} aria-label={t('selfenroll.login_heading')}>
            <p className="se-muted">{t('selfenroll.hint')}</p>
            <label className="se-field">
              <span>{t('login.email')}</span>
              <input className="se-input" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="se-field">
              <span>{t('login.password')}</span>
              <input className="se-input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <button className="se-btn se-btn--primary" type="submit" disabled={busy}>
              {busy && <Loader2 size={16} className="se-spin" aria-hidden="true" />}
              {busy ? t('selfenroll.processing') : t('selfenroll.login')}
            </button>
          </form>
        )}

        {/* ── Step 2: Active capture ── */}
        {step === 'capture' && (
          <>
            <EnrollCamera
              videoRef={videoRef}
              overlayRef={overlayRef}
              showVideo={cameraState === 'active'}
              guiding={cameraState === 'active' && capturePhase !== 'preview'}
              hasFace={hasFace}
              instruction={phaseConfig
                ? <>{phaseConfig.arrow && <span className="se-arrow" aria-hidden="true">{phaseConfig.arrow}</span>}{t(phaseConfig.labelKey)}</>
                : cameraState === 'active' && !capturePhase ? t('selfenroll.preparing') : undefined}
              hint={phaseConfig ? t(phaseConfig.hintKey) : cameraState === 'active' && !capturePhase ? t('selfenroll.position_face') : undefined}
              countdown={phaseConfig ? countdown : undefined}
              progressPct={phaseConfig ? progressPct : undefined}
              placeholder={
                <>
                  <CameraOff size={34} strokeWidth={1.6} aria-hidden="true" />
                  <p>{cameraState === 'denied' ? t('selfenroll.camera_denied') : cameraState === 'unavailable' ? t('selfenroll.camera_unavailable') : t('selfenroll.camera_loading')}</p>
                </>
              }
            />
            <canvas ref={canvasRef} className="se-hidden" />
            <AngleChips labels={angleLabels} phaseIdx={phaseIdx} allDone={capturePhase === 'preview'} />

            {capturePhase === 'preview' && previewUrls.length > 0 ? (
              <>
                <EnrollPreviews urls={previewUrls} labels={previewLabels} />
                <div className="se-actions">
                  <button type="button" className="se-btn" onClick={retake}>{t('selfenroll.retake')}</button>
                  <button type="button" className="se-btn se-btn--primary" onClick={() => { stopCamera(); setStep('consent') }}>
                    {t('selfenroll.continue')}
                  </button>
                </div>
              </>
            ) : (
              <p className="se-caption">{t('selfenroll.auto_capture_hint')}</p>
            )}
          </>
        )}

        {/* ── Step 3: Consent ── */}
        {step === 'consent' && !done && (
          <>
            <EnrollPreviews urls={previewUrls} labels={previewLabels} />
            <div className="se-card se-consent">
              <p className="se-muted">{t('selfenroll.consent_text')}</p>
              <label className="se-check">
                <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
                <span>{t('selfenroll.consent_check')}</span>
              </label>
            </div>
            <div className="se-actions">
              <button type="button" className="se-btn" disabled={busy} onClick={() => { setStep('capture'); void startCamera() }}>
                {t('selfenroll.back')}
              </button>
              <button type="button" className="se-btn se-btn--primary" disabled={busy || !consentChecked} onClick={handleSubmit}>
                {busy && <Loader2 size={16} className="se-spin" aria-hidden="true" />}
                {busy ? t('selfenroll.registering') : t('selfenroll.register')}
              </button>
            </div>
          </>
        )}

        {/* ── Success ── */}
        {done && (
          <>
            <EnrollResult
              tone="ok"
              icon={<Check size={38} strokeWidth={3} />}
              title={t('selfenroll.done_title')}
              text={t('selfenroll.done_text', { count: capturedBlobs.length })}
            />
            <button type="button" className="se-btn se-btn--primary se-btn--block" onClick={() => {
              if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
              resetAll()
            }}>
              {t('selfenroll.finish')}
            </button>
          </>
        )}
      </main>
    </div>
  )
}
