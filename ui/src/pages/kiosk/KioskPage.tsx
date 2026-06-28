import { useRef, useState, useEffect, useCallback, type ChangeEvent } from 'react'
import { Eye, ScanLine, Settings } from 'lucide-react'
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
import '@/styles/kiosk.css'

type CameraState = 'idle' | 'active' | 'denied' | 'unavailable'
type KioskStatus = 'idle' | 'processing' | 'success' | 'error'

const RESET_DELAY_MS = 5500
const SCAN_INTERVAL_MS = 2500

interface ResultState {
  status: KioskStatus
  result?: AttendanceResult
  errorCode?: 'not_recognized' | 'liveness_failed' | 'duplicate' | 'server_error'
  errorMsg?: string
}

function useClock() {
  const fmt = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const [time, setTime] = useState(fmt)
  const [date, setDate] = useState(() => new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date()
      setTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setDate(now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    }, 1000)
    return () => clearInterval(id)
  }, [])
  return { time, date }
}

export function KioskPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const { time, date } = useClock()

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const lastActivityRef = useRef(Date.now())
  const [voiceMuted, setVoiceMuted] = useState(false)
  const { speak, setEnabled: setVoiceEnabled } = useVoiceGuide()
  useEffect(() => { setVoiceEnabled(!voiceMuted) }, [voiceMuted, setVoiceEnabled])
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 5 * 60 * 1000) setLocked(true)
    }, 30_000)
    return () => clearInterval(id)
  }, [])

  // Auto-scan (touchless mode)
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldownUntilRef = useRef<number>(0)
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
        // No face matched — silently reset and keep scanning
        setIsOffline(false)
        setResultState({ status: 'idle' })
      } else {
        setIsOffline(false)
        const code = err instanceof KioskError ? err.code : 'server_error'
        const msg = err instanceof KioskError ? err.message : (err instanceof Error ? err.message : t('kiosk.server_error'))
        if (code !== 'not_recognized') show(msg, 'error')
        setResultState({ status: 'error', errorCode: code, errorMsg: msg })
        cooldownUntilRef.current = Date.now() + 3000
        scheduleReset()
      }
    }
  }, [show, speak]) // show and speak are stable from useCallback

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

  function handleFileAttendance(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !savedToken) return
    e.target.value = ''
    if (resultState.status === 'processing') return
    setResultState({ status: 'processing' })

    postAutoAttendance(savedToken, file, coordsRef.current)
      .then((result) => {
        const label = result.attendance.type === 'check_in' ? t('kiosk.check_in') : t('kiosk.check_out')
        show(t('kiosk.checkin_success', { label, name: result.full_name }), 'success')
        setResultState({ status: 'success', result })
        scheduleReset()
      })
      .catch((err) => {
        const msg = err instanceof KioskError ? err.message : (err instanceof Error ? err.message : t('kiosk.error_occurred'))
        const code = err instanceof KioskError ? err.code : 'server_error'
        show(msg, 'error')
        setResultState({ status: 'error', errorCode: code, errorMsg: msg })
        scheduleReset()
      })
  }

  const isProcessing = resultState.status === 'processing'
  const showResult =
    resultState.status === 'success' || resultState.status === 'error'

  return (
    <div className="kiosk-page">
      <div className="kiosk-header">
        <div className="kiosk-brand">
          <Eye size={22} strokeWidth={2.5} className="kiosk-brand-icon" />
          <span>netra</span>
        </div>
        <div className="kiosk-clock">
          <div className="kiosk-clock-time">{time}</div>
          <div className="kiosk-clock-date">{date}</div>
        </div>
        <button className="kiosk-setup-btn" onClick={() => setShowSetup((v) => !v)} aria-label={t('kiosk.setup')} title={t('kiosk.setup')}>
          <Settings size={15} />
        </button>
      </div>

      {/* Device token setup panel */}
      {showSetup && (
        <div className="kiosk-setup-panel">
          <h3>{t('kiosk.setup_title')}</h3>
          <p>
            {t('kiosk.setup_desc')}
          </p>
          <div className="kiosk-token-row">
            <input
              type="text"
              className="kiosk-token-input"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={t('kiosk.token_placeholder')}
              spellCheck={false}
              aria-label={t('kiosk.setup')}
            />
            <button className="kiosk-token-save-btn" onClick={handleSaveToken}>
              {t('kiosk.save_token')}
            </button>
          </div>
          <p className={`kiosk-token-status ${savedToken ? 'ok' : 'missing'}`}>
            {savedToken ? `${t('kiosk.token_active')}: ${savedToken.slice(0, 12)}…` : t('kiosk.no_token_stored')}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setVoiceMuted((v) => !v)} aria-label={voiceMuted ? t('kiosk.enable_voice') : t('kiosk.disable_voice')}>{voiceMuted ? `🔇 ${t('kiosk.voice_off')}` : `🔊 ${t('kiosk.voice_on')}`}</button>
          </div>
        </div>
      )}

      {revokedRemotely && (
        <div className="kiosk-no-token-warning" role="alert" aria-live="assertive">
          {t('kiosk.revoked_msg')}
        </div>
      )}

      {!savedToken && !showSetup && !revokedRemotely && (
        <div className="kiosk-no-token-warning">
          {t('kiosk.no_token_msg')}
        </div>
      )}

      {isOffline && (
        <div className="kiosk-offline-banner" role="alert" aria-live="assertive">
          {'\u26a0'} {t('kiosk.offline_msg')}
          <button onClick={() => { setIsOffline(false); void autoScan() }}>{t('kiosk.retry')}</button>
        </div>
      )}

      {locked && (
        <div className="kiosk-lock-screen" onClick={() => { setLocked(false); lastActivityRef.current = Date.now() }}>
          <div className="kiosk-lock-content"><div className="kiosk-lock-icon">{'🔒'}</div><div className="kiosk-lock-text">{t('kiosk.tap_to_start')}</div></div>
        </div>
      )}

      <div className="kiosk-camera-area" aria-label={t('kiosk.camera_area')}>
        {/* Camera / placeholder */}
        <div className="kiosk-camera-wrapper">
          {cameraState === 'active' ? (
            <>
              <video ref={videoRef} className="kiosk-video" autoPlay playsInline muted />
              <canvas ref={canvasRef} className="kiosk-canvas" />
              <canvas ref={overlayCanvasRef} className="kiosk-detection-canvas" />
            </>
          ) : (
            <div className="kiosk-camera-placeholder">
              <span className="kiosk-camera-placeholder-icon">
                {cameraState === 'denied' ? '🚫' : cameraState === 'unavailable' ? '📵' : '📷'}
              </span>
              <p>
                {cameraState === 'denied'
                  ? t('kiosk.camera_denied')
                  : cameraState === 'unavailable'
                  ? t('kiosk.camera_unavailable')
                  : t('kiosk.camera_loading')}
              </p>
              {(cameraState === 'denied' || cameraState === 'unavailable') && (
                <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {t('kiosk.use_upload_hint')}
                </p>
              )}
            </div>
          )}

          {/* HUD face guide — oval + scan line saat belum ada wajah, brackets saja saat ada wajah */}
          {cameraState === 'active' && !isProcessing && !showResult && (
            <div className="kiosk-hud" aria-hidden="true">
              <svg viewBox="0 0 560 420" className="kiosk-hud-svg">
                {!hasFace && (
                  <defs>
                    <clipPath id="oval-clip">
                      <ellipse cx="280" cy="210" rx="108" ry="133" />
                    </clipPath>
                  </defs>
                )}
                {/* Corner brackets — selalu tampil */}
                <path className="kiosk-hud-bracket" d="M 80 130 L 80 90 L 120 90"  fill="none" stroke="rgba(107,216,203,0.8)" strokeWidth="3" strokeLinecap="round"/>
                <path className="kiosk-hud-bracket" d="M 480 130 L 480 90 L 440 90" fill="none" stroke="rgba(107,216,203,0.8)" strokeWidth="3" strokeLinecap="round"/>
                <path className="kiosk-hud-bracket" d="M 80 290 L 80 330 L 120 330" fill="none" stroke="rgba(107,216,203,0.8)" strokeWidth="3" strokeLinecap="round"/>
                <path className="kiosk-hud-bracket" d="M 480 290 L 480 330 L 440 330" fill="none" stroke="rgba(107,216,203,0.8)" strokeWidth="3" strokeLinecap="round"/>
                {/* Oval + scan line — hanya saat belum ada wajah */}
                {!hasFace && (
                  <>
                    <ellipse cx="280" cy="210" rx="110" ry="135" fill="none" stroke="rgba(107,216,203,0.35)" strokeWidth="1.5" strokeDasharray="6 5"/>
                    <line className="kiosk-scan-line" x1="172" y1="77" x2="388" y2="77" stroke="rgba(107,216,203,0.75)" strokeWidth="2" clipPath="url(#oval-clip)" />
                  </>
                )}
                {/* Teks status bawah */}
                <text x="280" y="405" textAnchor="middle" fill="rgba(107,216,203,0.55)" fontSize="11" fontFamily="system-ui" fontWeight="600" letterSpacing="1.5">
                  {hasFace ? t('kiosk.face_detected') : savedToken ? t('kiosk.aim_face') : t('kiosk.setup_token_first')}
                </text>
              </svg>
            </div>
          )}

          {/* Processing overlay */}
          {isProcessing && (
            <div className="kiosk-processing">
              <ScanLine size={36} color="#0d9488" strokeWidth={1.5} className="kiosk-scan-icon" />
              <p>{t('kiosk.recognizing')}</p>
            </div>
          )}

          {/* Result overlay */}
          {showResult && (
            <div
              className={`kiosk-result-overlay ${resultState.status === 'success' ? 'success' : 'error'}`}
              role="alert"
              aria-live="assertive"
            >
              {resultState.status === 'success' && resultState.result ? (
                <>
                  <div className="kiosk-result-type-badge">
                    {resultState.result.attendance.type === 'check_in' ? '✓ CHECK IN' : '✓ CHECK OUT'}
                  </div>
                  <div className="kiosk-result-name">{resultState.result.full_name}</div>
                  <div className="kiosk-result-time">
                    {new Date(resultState.result.attendance.occurred_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="kiosk-result-status">
                    {resultState.result.attendance.status === 'on_time' ? t('kiosk.on_time')
                      : resultState.result.attendance.status === 'late' ? t('kiosk.late')
                      : resultState.result.attendance.status === 'early_leave' ? t('kiosk.early_leave')
                      : resultState.result.attendance.status}
                  </div>
                </>
              ) : (
                <>
                  <span className="kiosk-result-icon">
                    {resultState.errorCode === 'not_recognized' ? '❓'
                      : resultState.errorCode === 'liveness_failed' ? '⚠️'
                      : resultState.errorCode === 'duplicate' ? '🔁'
                      : '❌'}
                  </span>
                  <div className="kiosk-result-error-msg">{resultState.errorMsg}</div>
                </>
              )}
            </div>
          )}

        </div>


        {/* File fallback — only shown when camera is unavailable */}
        {(cameraState === 'denied' || cameraState === 'unavailable') && savedToken && (
          <label className="kiosk-btn kiosk-btn-checkin" style={{ cursor: 'pointer', textAlign: 'center' }}>
            {t('kiosk.upload_photo')}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileAttendance}
            />
          </label>
        )}

        {/* Status bar */}
        <div className="kiosk-status-bar">
          <span>
            <span className={`kiosk-status-dot ${cameraState === 'active' ? 'green' : 'red'}`} />
            {cameraState === 'active' ? t('kiosk.camera_active') : cameraState === 'denied' ? t('kiosk.camera_denied_status') : cameraState === 'unavailable' ? t('kiosk.camera_unavailable_status') : t('kiosk.camera_inactive')}
          </span>
          <span>
            <span className={`kiosk-status-dot ${cameraState === 'active' && savedToken ? 'green' : 'amber'}`} />
            {cameraState === 'active' && savedToken ? t('kiosk.auto_scan') : t('kiosk.manual_mode')}
          </span>
          <span>
            <span className={`kiosk-status-dot ${savedToken ? 'green' : 'red'}`} />
            {savedToken ? t('kiosk.token_active_status') : t('kiosk.no_token_status')}
          </span>
        </div>

        {/* Countdown to next auto-scan — idle only */}
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
    </div>
  )
}
