import { useRef, useState, useEffect, useCallback } from 'react'
import { KeyRound, Lock, ShieldOff, WifiOff } from 'lucide-react'
import {
  postAutoAttendance,
  KioskError,
  getStoredDeviceToken,
  saveDeviceToken,
  type AttendanceResult,
} from '@/api/kioskApi'
import { useToast } from '@/components/Toast'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { useVoiceGuide } from '@/hooks/useVoiceGuide'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useI18n } from '@/store/i18nStore'
import {
  KioskCameraPlaceholder,
  KioskPills,
  KioskRejectCard,
  KioskSetupPanel,
  KioskSuccessCard,
  KioskTopBar,
  ringToneFor,
  useKioskClock,
  type KioskErrorCode,
} from './KioskParts'
import '@/styles/kiosk.css'

type CameraState = 'idle' | 'active' | 'denied' | 'unavailable'
type KioskStatus = 'idle' | 'processing' | 'success' | 'error'

const RESET_DELAY_MS = 5500
const SCAN_INTERVAL_MS = 2500
const UNKNOWN_VOICE_GAP_MS = 10_000
// Spoken feedback for failed punches, keyed by KioskError code.
const FAIL_VOICE_KEYS: Record<string, string> = {
  liveness_failed: 'kiosk.liveness_failed_voice',
  duplicate: 'kiosk.duplicate_voice',
}

interface ResultState {
  status: KioskStatus
  result?: AttendanceResult
  errorCode?: KioskErrorCode
  errorMsg?: string
}

export function KioskPage() {
  const { t, locale } = useI18n()
  const { show } = useToast()
  const { time, date } = useKioskClock()

  // Device token
  const [showSetup, setShowSetup] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [savedToken, setSavedToken] = useState('')
  const [revokedRemotely, setRevokedRemotely] = useState(false)

  // WebSocket: subscribe to device channel for remote commands
  const { on: wsOn } = useWebSocket(null, { deviceToken: savedToken || null })
  useEffect(() => {
    if (!savedToken) return
    return wsOn('device.revoked', () => {
      setRevokedRemotely(true)
      if (autoScanIntervalRef.current) {
        clearInterval(autoScanIntervalRef.current)
        autoScanIntervalRef.current = null
      }
      stopCamera()
      setCameraState('unavailable')
    })
    // wsOn is stable; savedToken triggers re-register when token changes
  }, [savedToken, wsOn])

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')

  // Result / processing
  const [resultState, setResultState] = useState<ResultState>({ status: 'idle' })
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Phase 6: scan countdown + offline detection
  const [scanProgress, setScanProgress] = useState(0)
  const [isOffline, setIsOffline] = useState(false)

  // Phase 6: idle lock screen + voice mute
  const [locked, setLocked] = useState(false)
  // Seeded on mount, not during render — Date.now() is impure and would make
  // the render output depend on when React happened to call it.
  const lastActivityRef = useRef(0)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const { speak, setEnabled: setVoiceEnabled } = useVoiceGuide()
  useEffect(() => { setVoiceEnabled(!voiceMuted) }, [voiceMuted, setVoiceEnabled])
  useEffect(() => {
    lastActivityRef.current = Date.now()
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 5 * 60 * 1000) setLocked(true)
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  // Auto-scan (touchless mode)
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldownUntilRef = useRef<number>(0)
  const lastUnknownVoiceRef = useRef<number>(0)
  const resultStateRef = useRef(resultState)
  const cameraStateRef = useRef(cameraState)
  const savedTokenRef = useRef(savedToken)
  useEffect(() => { resultStateRef.current = resultState }, [resultState])
  useEffect(() => { cameraStateRef.current = cameraState }, [cameraState])
  useEffect(() => { savedTokenRef.current = savedToken }, [savedToken])

  // Geolocation: keep the latest fix in a ref and send it with each punch.
  // Best-effort — if the user denies permission, attendance still works (no loc).
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (pos) => { coordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude } },
      () => { /* denied / unavailable — proceed without location */ },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Real-time face detection overlay
  const detectionActive = cameraState === 'active' && resultState.status === 'idle'
  const { hasFace, detectorReady } = useFaceDetection(videoRef, overlayCanvasRef, detectionActive)

  // Refs so autoScan can read the latest values without stale closures
  const hasFaceRef = useRef(hasFace)
  const detectorReadyRef = useRef(detectorReady)
  useEffect(() => { hasFaceRef.current = hasFace }, [hasFace])
  useEffect(() => { detectorReadyRef.current = detectorReady }, [detectorReady])

  // Load token from localStorage on mount and start camera
  useEffect(() => {
    const stored = getStoredDeviceToken()
    setSavedToken(stored)
    setTokenInput(stored)
    startCamera()

    return () => {
      stopCamera()
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      setCameraState('active')
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      const name = (err as Error).name
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraState('denied')
      } else {
        setCameraState('unavailable')
      }
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  // Attach the stream once the <video> is actually mounted. Setting srcObject
  // inside startCamera() can run before the element renders (the element only
  // appears when cameraState === 'active'), so do it here deterministically.
  // This is also what lets the kiosk work immediately after pasting a token,
  // without a full page reload.
  useEffect(() => {
    if (cameraState === 'active' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play().catch(() => {})
    }
  }, [cameraState])

  function handleSaveToken() {
    const trimmed = tokenInput.trim()
    saveDeviceToken(trimmed)
    setSavedToken(trimmed)
    setShowSetup(false)
    if (trimmed) {
      show(t('kiosk.token_saved'), 'success')
    } else {
      show(t('kiosk.token_deleted'), 'info')
    }
  }

  function captureFrame(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return resolve(null)

      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)

      // Mirror the draw to match the mirrored CSS preview
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
      ctx.restore()

      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.92
      )
    })
  }

  function scheduleReset() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      setResultState({ status: 'idle' })
    }, RESET_DELAY_MS)
  }

  const autoScan = useCallback(async () => {
    const tok = savedTokenRef.current
    if (!tok) return
    if (Date.now() < cooldownUntilRef.current) return
    if (resultStateRef.current.status !== 'idle') return
    if (cameraStateRef.current !== 'active') return
    // Skip API call when detector is loaded and confirms no face in frame
    if (detectorReadyRef.current && !hasFaceRef.current) return

    setResultState({ status: 'processing' })
    const blob = await captureFrame()
    if (!blob) { setResultState({ status: 'idle' }); return }

    try {
      const result = await postAutoAttendance(tok, blob, coordsRef.current)
      setIsOffline(false)
      const action = result.attendance.type === 'check_in' ? t('kiosk.check_in') : t('kiosk.check_out')
      show(t('kiosk.checkin_success', { label: action, name: result.full_name }), 'success')
      lastActivityRef.current = Date.now()
      const name = result.full_name.split(' ')[0]
      speak(result.attendance.type === 'check_in' ? t('kiosk.check_in_voice', { name }) : t('kiosk.check_out_voice', { name }))
      setResultState({ status: 'success', result })
      cooldownUntilRef.current = Date.now() + 8000
      scheduleReset()
    } catch (err) {
      const isNetworkErr =
        (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) || !navigator.onLine
      if (isNetworkErr) {
        setIsOffline(true)
        setResultState({ status: 'idle' })
        cooldownUntilRef.current = Date.now() + 3000
        return
      }
      if (err instanceof KioskError && err.code === 'not_recognized') {
        // No face matched — keep scanning; voice is throttled so a person
        // standing in front of the camera doesn't hear it every scan.
        setIsOffline(false)
        if (Date.now() - lastUnknownVoiceRef.current > UNKNOWN_VOICE_GAP_MS) {
          lastUnknownVoiceRef.current = Date.now()
          speak(t('kiosk.not_recognized_voice'))
        }
        setResultState({ status: 'idle' })
      } else {
        setIsOffline(false)
        const code = err instanceof KioskError ? err.code : 'server_error'
        const msg = err instanceof KioskError ? err.message : (err instanceof Error ? err.message : t('kiosk.server_error'))
        if (code !== 'not_recognized') show(msg, 'error')
        speak(t(FAIL_VOICE_KEYS[code] ?? 'kiosk.fail_voice'))
        setResultState({ status: 'error', errorCode: code, errorMsg: msg })
        cooldownUntilRef.current = Date.now() + 3000
        scheduleReset()
      }
    }
  // show and speak are stable; locale re-creates t so messages follow the language setting
  }, [show, speak, locale]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start/stop auto-scan interval when camera or token becomes available
  useEffect(() => {
    if (cameraState === 'active' && savedToken) {
      autoScanIntervalRef.current = setInterval(() => { void autoScan() }, SCAN_INTERVAL_MS)
    } else {
      if (autoScanIntervalRef.current) { clearInterval(autoScanIntervalRef.current); autoScanIntervalRef.current = null }
    }
    return () => { if (autoScanIntervalRef.current) { clearInterval(autoScanIntervalRef.current); autoScanIntervalRef.current = null } }
  }, [cameraState, savedToken, autoScan])

  // Countdown progress toward the next idle scan (0-100%)
  const idleForCountdown =
    cameraState === 'active' && !!savedToken && resultState.status === 'idle' && !revokedRemotely
  useEffect(() => {
    if (!idleForCountdown) {
      setScanProgress(0)
      return
    }
    const stepPct = (250 / SCAN_INTERVAL_MS) * 100
    const id = setInterval(() => {
      setScanProgress((prev) => (prev + stepPct >= 100 ? 0 : prev + stepPct))
    }, 250)
    return () => clearInterval(id)
  }, [idleForCountdown])


  const isProcessing = resultState.status === 'processing'
  const showResult = resultState.status === 'success' || resultState.status === 'error'
  const tone = ringToneFor(resultState.result, resultState.status, hasFace)
  const toggleVoice = () => setVoiceMuted((v) => !v)

  return (
    <div className={`kiosk-page kiosk-tone-${tone}`}>
      <div className="kiosk-stage" aria-label={t('kiosk.camera_area')}>
        {cameraState === 'active' ? (
          <>
            <video ref={videoRef} className="kiosk-video" autoPlay playsInline muted />
            <canvas ref={canvasRef} className="kiosk-canvas" />
            <canvas ref={overlayCanvasRef} className="kiosk-detection-canvas" />
          </>
        ) : (
          <KioskCameraPlaceholder t={t} state={cameraState} />
        )}
        <div className="kiosk-vignette" aria-hidden="true" />
        {cameraState === 'active' && <div className={`kiosk-ring kiosk-ring--${tone}`} aria-hidden="true" />}
      </div>

      <KioskTopBar time={time} date={date} onSetup={() => setShowSetup((v) => !v)} t={t} />

      {showSetup && (
        <KioskSetupPanel
          t={t}
          tokenInput={tokenInput}
          setTokenInput={setTokenInput}
          savedToken={savedToken}
          onSave={handleSaveToken}
          voiceMuted={voiceMuted}
          toggleVoice={toggleVoice}
        />
      )}

      <div className="kiosk-banners">
        {revokedRemotely && (
          <div className="kiosk-banner kiosk-banner--bad" role="alert" aria-live="assertive">
            <ShieldOff size={18} aria-hidden="true" />
            <span>{t('kiosk.revoked_msg')}</span>
          </div>
        )}
        {!savedToken && !showSetup && !revokedRemotely && (
          <div className="kiosk-banner kiosk-banner--bad" role="status">
            <KeyRound size={18} aria-hidden="true" />
            <span>{t('kiosk.no_token_msg')}</span>
          </div>
        )}
        {isOffline && (
          <div className="kiosk-banner kiosk-banner--warn" role="alert" aria-live="assertive">
            <WifiOff size={18} aria-hidden="true" />
            <span>{t('kiosk.offline_msg')}</span>
            <button type="button" onClick={() => { setIsOffline(false); void autoScan() }}>{t('kiosk.retry')}</button>
          </div>
        )}
      </div>

      {cameraState === 'active' && !showResult && (
        <div className="kiosk-prompt" aria-live="polite">
          <div className="kiosk-prompt-title">
            {isProcessing ? t('kiosk.recognizing')
              : hasFace ? t('kiosk.face_detected')
              : savedToken ? t('kiosk.aim_face')
              : t('kiosk.setup_token_first')}
          </div>
          <div className="kiosk-prompt-sub">{isOffline ? t('kiosk.offline_sub') : t('kiosk.auto_hint')}</div>
          {idleForCountdown && (
            <div className="kiosk-countdown">
              <div className="kiosk-countdown-bar">
                <div className="kiosk-countdown-fill" style={{ width: `${scanProgress}%` }} />
              </div>
              <span className="kiosk-countdown-label">
                {t('kiosk.scan_in', { seconds: Math.ceil((SCAN_INTERVAL_MS * (1 - scanProgress / 100)) / 1000) })}
              </span>
            </div>
          )}
        </div>
      )}

      {resultState.status === 'success' && resultState.result && <KioskSuccessCard t={t} result={resultState.result} />}
      {resultState.status === 'error' && <KioskRejectCard t={t} code={resultState.errorCode} msg={resultState.errorMsg} />}

      <KioskPills
        t={t}
        autoScan={cameraState === 'active' && !!savedToken && !revokedRemotely}
        tokenOk={!!savedToken && !revokedRemotely}
        offline={isOffline}
        voiceMuted={voiceMuted}
        toggleVoice={toggleVoice}
      />

      {locked && (
        <button
          type="button"
          className="kiosk-lock-screen"
          onClick={() => { setLocked(false); lastActivityRef.current = Date.now() }}
        >
          <Lock size={44} strokeWidth={1.6} aria-hidden="true" />
          <span className="kiosk-lock-text">{t('kiosk.tap_to_start')}</span>
        </button>
      )}
    </div>
  )
}
