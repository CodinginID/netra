import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { useGuidedCapture, type CapturePhaseConfig } from '@/hooks/useGuidedCapture'
import { useI18n } from '@/store/i18nStore'
import { AngleChips, EnrollCamera, EnrollPreviews, EnrollResult } from '@/pages/kiosk/EnrollParts'
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
  const { t, locale } = useI18n()
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  // Rebuilt only when the language changes, so the capture hook's sequence stays stable.
  const PHASE_CONFIG = useMemo<Record<'front' | 'left' | 'right', CapturePhaseConfig>>(() => ({
    front: { label: t('embed.phase_front'), hint: t('embed.phase_front_hint'), duration: 3 },
    left: { label: t('embed.phase_left'), hint: t('embed.phase_hold_hint'), arrow: '←', duration: 4 },
    right: { label: t('embed.phase_right'), hint: t('embed.phase_hold_hint'), arrow: '→', duration: 4 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [locale])
  const angleLabels = { front: t('selfenroll.front'), left: t('selfenroll.left'), right: t('selfenroll.right') }
  const PREVIEW_LABELS = [angleLabels.front, angleLabels.left, angleLabels.right]
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
      setErrorMsg(t('embed.token_missing'))
      return
    }
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/embed/session`, {
          headers: { 'X-Embed-Token': token },
        })
        if (!res.ok) {
          setPhase('invalid')
          setErrorMsg(res.status === 401 ? t('embed.session_invalid') : t('embed.session_load_failed', { status: res.status }))
          return
        }
        const json = await res.json()
        setInfo(json.data as SessionInfo)
        setPhase('consent')
      } catch {
        setPhase('invalid')
        setErrorMsg(t('embed.network_error'))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setErrorMsg(t('embed.camera_error'))
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
      setErrorMsg(t('embed.capture_failed'))
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
        const msg = json.detail ?? json.error ?? t('embed.enroll_failed', { status: res.status })
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
      setErrorMsg(t('embed.network_error'))
      notifyParent(info?.return_origin, { type: 'enroll:error', message: 'network' })
    }
  }

  function retryFromError() {
    retake()
    setPhase(info ? 'consent' : 'invalid')
  }

  const live = phase === 'camera' || phase === 'submitting'
  const showCard = phase === 'consent' || live
  const isPreview = capturePhase === 'preview'

  return (
    <div className="se-embed">
      <section className="se-embed-card" aria-label={t('embed.title')}>
        <header className="se-embed-head">
          <span className="se-embed-title">{t('embed.title')}</span>
          <span className="se-embed-by">{t('embed.by_netra')}</span>
        </header>

        {phase === 'loading' && (
          <p className="se-muted se-center"><Loader2 size={16} className="se-spin" aria-hidden="true" /> {t('embed.loading')}</p>
        )}

        {phase === 'invalid' && (
          <EnrollResult tone="bad" icon={<AlertTriangle size={30} />} title={t('embed.unavailable_title')} text={errorMsg} />
        )}

        {showCard && info && (
          <>
            {info.full_name && <p className="se-muted">{t('embed.for_name')} <strong>{info.full_name}</strong></p>}
            <EnrollCamera
              compact
              videoRef={videoRef}
              overlayRef={overlayRef}
              showVideo={live}
              guiding={live && cameraReady && !isPreview}
              hasFace={hasFace}
              instruction={phaseConfig
                ? <>{phaseConfig.arrow && <span className="se-arrow" aria-hidden="true">{phaseConfig.arrow}</span>}{phaseConfig.label}</>
                : live && cameraReady && !capturePhase ? t('embed.preparing') : undefined}
              hint={phaseConfig ? phaseConfig.hint : live && cameraReady && !capturePhase ? t('embed.position_face') : undefined}
              countdown={phaseConfig ? countdown : undefined}
              progressPct={phaseConfig ? progressPct : undefined}
            />
            <AngleChips labels={angleLabels} phaseIdx={phaseIdx} allDone={isPreview} />
          </>
        )}

        {phase === 'consent' && info && (
          <>
            <label className="se-check">
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
              <span>{t('embed.consent')}</span>
            </label>
            {info.is_minor && (
              <label className="se-field">
                <span>{t('embed.guardian_label')}</span>
                <input className="se-input" value={guardian} onChange={(e) => setGuardian(e.target.value)}
                  placeholder={t('embed.guardian_placeholder')} />
              </label>
            )}
            <button type="button" className="se-btn se-btn--primary se-btn--block"
              disabled={!canProceed(consentChecked, info, guardian)} onClick={() => void startCamera()}>
              {t('embed.start')}
            </button>
          </>
        )}

        {live && (
          isPreview && previewUrls.length > 0 ? (
            <>
              <EnrollPreviews urls={previewUrls} labels={PREVIEW_LABELS} />
              <p className="se-caption">{t('embed.preview_hint')}</p>
              <div className="se-actions">
                <button type="button" className="se-btn" disabled={phase === 'submitting'} onClick={retake}>{t('selfenroll.retake')}</button>
                <button type="button" className="se-btn se-btn--primary" disabled={phase === 'submitting'} onClick={() => void submit()}>
                  {phase === 'submitting' && <Loader2 size={16} className="se-spin" aria-hidden="true" />}
                  {phase === 'submitting' ? t('selfenroll.processing') : t('selfenroll.continue')}
                </button>
              </div>
            </>
          ) : (
            <p className="se-caption">{t('selfenroll.auto_capture_hint')}</p>
          )
        )}

        {phase === 'success' && (
          <EnrollResult tone="ok" icon={<Check size={34} strokeWidth={3} />} title={t('selfenroll.done_title')} text={t('embed.success_text')} />
        )}

        {phase === 'error' && (
          <EnrollResult tone="bad" icon={<AlertTriangle size={30} />} title={t('embed.error_title')} text={errorMsg}>
            <button type="button" className="se-btn se-btn--primary se-btn--block" onClick={retryFromError}>{t('kiosk.retry')}</button>
          </EnrollResult>
        )}

        <canvas ref={canvasRef} className="se-hidden" />
      </section>
    </div>
  )
}

function canProceed(consent: boolean, info: SessionInfo, guardian: string): boolean {
  if (!consent) return false
  if (info.is_minor && !guardian.trim()) return false
  return true
}
