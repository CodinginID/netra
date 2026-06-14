import { useRef, useState, useEffect, type ChangeEvent } from 'react'
import {
  postAttendance,
  KioskError,
  getStoredDeviceToken,
  saveDeviceToken,
  type AttendanceAction,
  type AttendanceResult,
} from '@/api/kioskApi'
import '@/styles/kiosk.css'

type CameraState = 'idle' | 'active' | 'denied' | 'unavailable'
type KioskStatus = 'idle' | 'processing' | 'success' | 'error'

const RESET_DELAY_MS = 4000

interface ResultState {
  status: KioskStatus
  result?: AttendanceResult
  errorCode?: 'not_recognized' | 'liveness_failed' | 'server_error'
  errorMsg?: string
}

const STATUS_LABELS: Record<string, string> = {
  on_time: 'Tepat Waktu',
  late: 'Terlambat',
  early_leave: 'Pulang Awal',
}

export function KioskPage() {
  // Device token
  const [showSetup, setShowSetup] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [savedToken, setSavedToken] = useState('')

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')

  // Result / processing
  const [resultState, setResultState] = useState<ResultState>({ status: 'idle' })
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function handleSaveToken() {
    const trimmed = tokenInput.trim()
    saveDeviceToken(trimmed)
    setSavedToken(trimmed)
    setShowSetup(false)
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

  async function handleAction(action: AttendanceAction) {
    if (!savedToken) {
      setShowSetup(true)
      return
    }
    if (resultState.status === 'processing') return

    setResultState({ status: 'processing' })

    const blob = cameraState === 'active' ? await captureFrame() : null

    // If no camera, require a file — fall through to error
    if (!blob) {
      setResultState({
        status: 'error',
        errorCode: 'server_error',
        errorMsg: 'Tidak dapat mengambil gambar dari kamera.',
      })
      scheduleReset()
      return
    }

    try {
      const result = await postAttendance(savedToken, action, blob)
      setResultState({ status: 'success', result })
      scheduleReset()
    } catch (err) {
      if (err instanceof KioskError) {
        setResultState({
          status: 'error',
          errorCode: err.code,
          errorMsg: err.message,
        })
      } else {
        setResultState({
          status: 'error',
          errorCode: 'server_error',
          errorMsg: err instanceof Error ? err.message : 'Terjadi kesalahan.',
        })
      }
      scheduleReset()
    }
  }

  function handleFileAttendance(e: ChangeEvent<HTMLInputElement>, action: AttendanceAction) {
    const file = e.target.files?.[0]
    if (!file || !savedToken) return
    // Reset the input so same file can be re-selected
    e.target.value = ''

    if (resultState.status === 'processing') return
    setResultState({ status: 'processing' })

    postAttendance(savedToken, action, file)
      .then((result) => {
        setResultState({ status: 'success', result })
        scheduleReset()
      })
      .catch((err) => {
        if (err instanceof KioskError) {
          setResultState({ status: 'error', errorCode: err.code, errorMsg: err.message })
        } else {
          setResultState({
            status: 'error',
            errorCode: 'server_error',
            errorMsg: err instanceof Error ? err.message : 'Terjadi kesalahan.',
          })
        }
        scheduleReset()
      })
  }

  const isProcessing = resultState.status === 'processing'
  const showResult =
    resultState.status === 'success' || resultState.status === 'error'
  const actionsDisabled = isProcessing || !savedToken

  return (
    <div className="kiosk-page">
      <div className="kiosk-header">
        <span className="kiosk-brand">👁 netra</span>
        <button className="kiosk-setup-btn" onClick={() => setShowSetup((v) => !v)}>
          ⚙ Setup
        </button>
      </div>

      {/* Device token setup panel */}
      {showSetup && (
        <div className="kiosk-setup-panel">
          <h3>Konfigurasi Device Token</h3>
          <p>
            Masukkan token perangkat kiosk yang diberikan oleh administrator tenant.
            Token disimpan di localStorage perangkat ini.
          </p>
          <div className="kiosk-token-row">
            <input
              type="text"
              className="kiosk-token-input"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste device token di sini…"
              spellCheck={false}
            />
            <button className="kiosk-token-save-btn" onClick={handleSaveToken}>
              Simpan
            </button>
          </div>
          <p className={`kiosk-token-status ${savedToken ? 'ok' : 'missing'}`}>
            {savedToken ? `Token aktif: ${savedToken.slice(0, 12)}…` : 'Belum ada token tersimpan'}
          </p>
        </div>
      )}

      {!savedToken && !showSetup && (
        <div className="kiosk-no-token-warning">
          Device token belum dikonfigurasi. Tekan ⚙ Setup untuk mengatur.
        </div>
      )}

      <div className="kiosk-camera-area">
        {/* Camera / placeholder */}
        <div className="kiosk-camera-wrapper">
          {cameraState === 'active' ? (
            <>
              <video ref={videoRef} className="kiosk-video" autoPlay playsInline muted />
              <canvas ref={canvasRef} className="kiosk-canvas" />
            </>
          ) : (
            <div className="kiosk-camera-placeholder">
              <span className="kiosk-camera-placeholder-icon">
                {cameraState === 'denied' ? '🚫' : cameraState === 'unavailable' ? '📵' : '📷'}
              </span>
              <p>
                {cameraState === 'denied'
                  ? 'Akses kamera ditolak oleh browser.'
                  : cameraState === 'unavailable'
                  ? 'Kamera tidak tersedia di perangkat ini.'
                  : 'Memuat kamera…'}
              </p>
              {(cameraState === 'denied' || cameraState === 'unavailable') && (
                <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  Gunakan tombol upload gambar di bawah.
                </p>
              )}
            </div>
          )}

          {/* Processing overlay */}
          {isProcessing && (
            <div className="kiosk-processing">
              <span className="kiosk-processing-icon">⏳</span>
              <p>Memproses…</p>
            </div>
          )}

          {/* Result overlay */}
          {showResult && (
            <div
              className={`kiosk-result-overlay ${resultState.status === 'success' ? 'success' : 'error'}`}
            >
              {resultState.status === 'success' && resultState.result ? (
                <>
                  <span className="kiosk-result-icon">
                    {resultState.result.action === 'checkin' ? '✅' : '👋'}
                  </span>
                  <div className="kiosk-result-name">{resultState.result.full_name}</div>
                  <div className="kiosk-result-status">
                    {resultState.result.action === 'checkin' ? 'Check In' : 'Check Out'} —{' '}
                    {STATUS_LABELS[resultState.result.status] ?? resultState.result.status}
                  </div>
                </>
              ) : (
                <>
                  <span className="kiosk-result-icon">
                    {resultState.errorCode === 'not_recognized'
                      ? '❓'
                      : resultState.errorCode === 'liveness_failed'
                      ? '⚠️'
                      : '❌'}
                  </span>
                  <div className="kiosk-result-error-msg">{resultState.errorMsg}</div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="kiosk-actions">
          <button
            className="kiosk-btn kiosk-btn-checkin"
            disabled={actionsDisabled}
            onClick={() => handleAction('checkin')}
          >
            Check In
          </button>
          <button
            className="kiosk-btn kiosk-btn-checkout"
            disabled={actionsDisabled}
            onClick={() => handleAction('checkout')}
          >
            Check Out
          </button>
        </div>

        {/* File fallback (shown when camera unavailable/denied) */}
        {(cameraState === 'denied' || cameraState === 'unavailable') && savedToken && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <label
              style={{
                flex: 1,
                background: '#16a34a',
                color: '#fff',
                padding: '0.75rem',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.95rem',
              }}
            >
              Upload Check In
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFileAttendance(e, 'checkin')}
              />
            </label>
            <label
              style={{
                flex: 1,
                background: '#dc2626',
                color: '#fff',
                padding: '0.75rem',
                borderRadius: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.95rem',
              }}
            >
              Upload Check Out
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFileAttendance(e, 'checkout')}
              />
            </label>
          </div>
        )}

        {/* Status bar */}
        <div className="kiosk-status-bar">
          <span>
            <span
              className={`kiosk-status-dot ${cameraState === 'active' ? 'green' : 'red'}`}
            />
            {cameraState === 'active'
              ? 'Kamera aktif'
              : cameraState === 'denied'
              ? 'Kamera ditolak'
              : cameraState === 'unavailable'
              ? 'Kamera tidak tersedia'
              : 'Kamera tidak aktif'}
          </span>
          <span>
            <span
              className={`kiosk-status-dot ${savedToken ? 'green' : 'red'}`}
            />
            {savedToken ? 'Token terkonfigurasi' : 'Token belum ada'}
          </span>
        </div>
      </div>
    </div>
  )
}
