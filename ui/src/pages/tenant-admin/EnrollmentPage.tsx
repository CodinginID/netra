import { useRef, useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/Toast'
import { fetchUsers, enrollFaceMulti, grantConsent, type UserItem } from '@/api/enrollmentApi'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { useVoiceGuide } from '@/hooks/useVoiceGuide'
import '@/styles/layout.css'
import '@/styles/enrollment.css'

type CameraState  = 'idle' | 'active' | 'denied' | 'unavailable'
type CapturePhase = 'front' | 'left' | 'right' | 'preview'
type SubmitState  = 'idle' | 'loading' | 'success' | 'error'

const PHASE_CFG: Record<Exclude<CapturePhase,'preview'>, { label: string; voice: string; icon: string; duration: number }> = {
  front: { label: 'Lurus',  voice: 'Lihat lurus ke kamera',    icon: 'front', duration: 3 },
  left:  { label: 'Kiri',   voice: 'Putar kepala ke kiri',     icon: 'left',  duration: 4 },
  right: { label: 'Kanan',  voice: 'Putar kepala ke kanan',    icon: 'right', duration: 4 },
}
const PHASES: Exclude<CapturePhase,'preview'>[] = ['front','left','right']
const CIRC = 2 * Math.PI * 22 // SVG circle circumference r=22

// ── Face direction SVG icons ──────────────────────────────────────────────────
function FaceIcon({ dir, size = 36 }: { dir: string; size?: number }) {
  const s = size
  if (dir === 'front') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="22" rx="11" ry="14" stroke="currentColor" strokeWidth="1.8"/>
      <circle cx="15.5" cy="20" r="2" fill="currentColor"/>
      <circle cx="24.5" cy="20" r="2" fill="currentColor"/>
      <path d="M16 27 Q20 30 24 27" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  if (dir === 'left') return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <ellipse cx="22" cy="22" rx="10" ry="14" stroke="currentColor" strokeWidth="1.8"/>
      <circle cx="18" cy="20" r="2" fill="currentColor"/>
      <circle cx="25" cy="21" r="1.5" fill="currentColor" opacity="0.4"/>
      <path d="M13 22 L9 20 M13 22 L10 25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
      <ellipse cx="18" cy="22" rx="10" ry="14" stroke="currentColor" strokeWidth="1.8"/>
      <circle cx="22" cy="20" r="2" fill="currentColor"/>
      <circle cx="15" cy="21" r="1.5" fill="currentColor" opacity="0.4"/>
      <path d="M27 22 L31 20 M27 22 L30 25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ── Angle card component ──────────────────────────────────────────────────────
function AngleCard({
  label, icon, isActive, isDone, progress,
}: {
  label: string; icon: string
  isActive: boolean; isDone: boolean; progress: number
}) {
  const offset = CIRC * (1 - progress)
  return (
    <div className={`angle-card ${isActive ? 'angle-card--active' : isDone ? 'angle-card--done' : 'angle-card--idle'}`}>
      <div className="angle-card-ring">
        {isActive && (
          <svg className="angle-ring-svg" viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="22" fill="none" stroke="rgba(124,58,237,0.15)" strokeWidth="3"/>
            <circle cx="25" cy="25" r="22" fill="none" stroke="url(#ring-grad)" strokeWidth="3"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              strokeLinecap="round" transform="rotate(-90 25 25)"
              style={{ transition: 'stroke-dashoffset 0.9s linear' }}/>
            <defs>
              <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7c3aed"/>
                <stop offset="100%" stopColor="#06b6d4"/>
              </linearGradient>
            </defs>
          </svg>
        )}
        <div className="angle-card-icon">
          {isDone
            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <FaceIcon dir={icon} size={32} />
          }
        </div>
      </div>
      <span className="angle-card-label">{label}</span>
      {isActive && <span className="angle-card-badge">Aktif</span>}
    </div>
  )
}

// ── Step bar ──────────────────────────────────────────────────────────────────
function StepBar({ active }: { active: 1 | 2 | 3 }) {
  const STEPS = [
    { label: 'Pilih Pengguna',        icon: '01' },
    { label: 'Rekam Wajah',           icon: '02' },
    { label: 'Persetujuan & Submit',  icon: '03' },
  ]
  return (
    <div className="step-bar">
      {STEPS.map(({ label, icon }, i) => {
        const idx = (i + 1) as 1 | 2 | 3
        const done = active > idx; const cur = active === idx
        return (
          <div key={idx} className="step-item">
            <div className="step-body">
              <div className={`step-node ${done ? 'step-node--done' : cur ? 'step-node--active' : 'step-node--inactive'}`}>
                {done ? '✓' : icon}
              </div>
              <span className={`step-label ${cur ? 'step-label--active' : done ? 'step-label--done' : 'step-label--inactive'}`}>{label}</span>
            </div>
            {idx < 3 && <div className={`step-connector ${done ? 'step-connector--done' : 'step-connector--inactive'}`}/>}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function EnrollmentPage() {
  const { show } = useToast()
  const accessToken = useAuthStore((s) => s.accessToken)
  const { announcePhase, announceCountdown, announceDone } = useVoiceGuide()

  const [users, setUsers]                   = useState<UserItem[]>([])
  const [usersLoading, setUsersLoading]     = useState(false)
  const [usersError, setUsersError]         = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [manualUserId, setManualUserId]     = useState('')

  const videoRef   = useRef<HTMLVideoElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef  = useRef<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')

  const [capturePhase, setCapturePhase] = useState<CapturePhase | null>(null)
  const [countdown, setCountdown]       = useState(0)
  const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([])
  const [capturedUrls, setCapturedUrls]   = useState<string[]>([])
  const [voiceEnabled, setVoiceEnabled]   = useState(true)

  const [consentGranted, setConsentGranted] = useState(false)
  const [submitState, setSubmitState]       = useState<SubmitState>('idle')
  const [errorMessage, setErrorMessage]     = useState('')

  const uid        = users.length > 0 ? selectedUserId : manualUserId.trim()
  const activeStep: 1 | 2 | 3 = !uid ? 1 : capturePhase !== 'preview' ? 2 : 3

  const detectionActive = cameraState === 'active' && !!capturePhase && capturePhase !== 'preview'
  const { hasFace } = useFaceDetection(videoRef, overlayRef, detectionActive)

  function loadUsers() {
    if (!accessToken) return
    setUsersLoading(true); setUsersError(false)
    fetchUsers(accessToken).then(setUsers).catch(() => setUsersError(true)).finally(() => setUsersLoading(false))
  }

  useEffect(() => { loadUsers() }, [accessToken])
  useEffect(() => () => { stopCamera(); capturedUrls.forEach(URL.revokeObjectURL) }, [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null; setCameraState('idle')
  }

  useEffect(() => {
    if (cameraState === 'active' && videoRef.current && streamRef.current)
      videoRef.current.srcObject = streamRef.current
  }, [cameraState])

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraState('unavailable'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } } })
      streamRef.current = stream; setCameraState('active')
    } catch (err) {
      const name = (err as Error).name
      setCameraState(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'unavailable')
    }
  }

  function captureFrame(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = videoRef.current; const canvas = canvasRef.current
      if (!video || !canvas) return resolve(null)
      canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92)
    })
  }

  const runCaptureSequence = useCallback(async () => {
    const blobs: Blob[] = []; const urls: string[] = []

    for (const phase of PHASES) {
      const { voice, duration } = PHASE_CFG[phase]
      setCapturePhase(phase)
      if (voiceEnabled) announcePhase(phase)

      await new Promise<void>((resolve) => {
        let rem = duration; setCountdown(rem)
        const id = setInterval(() => {
          rem--; setCountdown(rem)
          if (voiceEnabled && rem > 0) announceCountdown(rem)
          if (rem <= 0) { clearInterval(id); resolve() }
        }, 1000)
        void voice // silence unused warning
      })

      const blob = await captureFrame()
      if (blob) { blobs.push(blob); urls.push(URL.createObjectURL(blob)) }
    }

    if (voiceEnabled) announceDone()
    setCapturedBlobs(blobs); setCapturedUrls(urls); setCapturePhase('preview')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled])

  useEffect(() => {
    if (activeStep !== 2 || cameraState !== 'active' || capturePhase !== null) return
    const t = setTimeout(() => { void runCaptureSequence() }, 1500)
    return () => clearTimeout(t)
  }, [activeStep, cameraState, capturePhase, runCaptureSequence])

  function retake() {
    capturedUrls.forEach(URL.revokeObjectURL)
    setCapturedBlobs([]); setCapturedUrls([]); setCapturePhase(null)
    setSubmitState('idle'); setErrorMessage('')
  }

  function changeUser() {
    stopCamera(); retake()
    setSelectedUserId(''); setManualUserId(''); setConsentGranted(false)
  }

  function resolvedUserName() {
    if (users.length > 0) {
      const u = users.find((u) => u.id === selectedUserId)
      return u ? (u.full_name ? `${u.full_name} (${u.username})` : u.username) : ''
    }
    return manualUserId.trim()
  }

  async function handleSubmit() {
    if (!uid || capturedBlobs.length === 0 || !accessToken) return
    setSubmitState('loading'); setErrorMessage('')
    try {
      await grantConsent(accessToken, uid)
      await enrollFaceMulti(accessToken, uid, capturedBlobs)
      show(`Enrollment berhasil — ${capturedBlobs.length} sudut wajah terdaftar.`, 'success')
      changeUser()
    } catch (err) {
      setSubmitState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Enrollment gagal.')
    } finally {
      setSubmitState((s) => s === 'loading' ? 'idle' : s)
    }
  }

  const phaseConfig   = capturePhase && capturePhase !== 'preview' ? PHASE_CFG[capturePhase] : null
  const phaseProgress = phaseConfig ? (1 - countdown / phaseConfig.duration) : 0
  const canSubmit     = !!uid && capturedBlobs.length > 0 && consentGranted && submitState !== 'loading'
  const userName      = resolvedUserName()

  return (
    <div>
      <div className="page-header">
        <h2>Enrollment Wajah</h2>
        <p>Rekam wajah pengguna dari 3 sudut untuk identifikasi yang akurat</p>
      </div>

      <StepBar active={activeStep} />

      <div className="enrollment-layout">

        {/* ── Step 1: Pilih Pengguna ── */}
        {activeStep === 1 && (
          <div className="enrollment-section">
            <h3>Pilih Pengguna</h3>
            {usersLoading && <p style={{ color:'var(--color-text-secondary)', fontSize:'0.875rem' }}>Memuat daftar pengguna…</p>}
            {!usersLoading && usersError && (
              <div className="users-error">
                <span>Gagal memuat daftar pengguna.</span>
                <button className="btn btn-ghost btn-sm" onClick={loadUsers}>Coba lagi</button>
              </div>
            )}
            {!usersLoading && !usersError && users.length > 0 && (
              <div className="form-group">
                <label htmlFor="user-select">Pengguna</label>
                <select id="user-select" className="user-id-select" value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}>
                  <option value="">-- Pilih pengguna --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name ? `${u.full_name} (${u.username})` : u.username}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!usersLoading && !usersError && users.length === 0 && (
              <div className="form-group">
                <label htmlFor="manual-user-id">User ID</label>
                <input id="manual-user-id" type="text" className="user-id-input"
                  value={manualUserId} onChange={(e) => setManualUserId(e.target.value)}
                  placeholder="Masukkan user_id secara manual"/>
              </div>
            )}
            {uid && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.5rem' }}>
                <button className="btn btn-primary" onClick={startCamera}>
                  Mulai Rekam Wajah →
                </button>
                <label className="voice-toggle">
                  <input type="checkbox" checked={voiceEnabled} onChange={(e) => setVoiceEnabled(e.target.checked)}/>
                  <span>🔊 Panduan suara</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Rekam Wajah ── */}
        {activeStep === 2 && (
          <div className="enrollment-section">
            <h3>
              Rekam Wajah
              {userName && (
                <span className="user-confirm-banner" style={{ fontSize:'0.78rem', marginBottom:0 }}>
                  <span className="dot"/>{userName}
                </span>
              )}
            </h3>

            {/* 3 Angle cards */}
            <div className="angle-cards">
              {PHASES.map((p, i) => {
                const phaseIdx = capturePhase && capturePhase !== 'preview'
                  ? PHASES.indexOf(capturePhase as Exclude<CapturePhase,'preview'>) : -1
                const isDone   = capturePhase === 'preview' || phaseIdx > i
                const isActive = phaseIdx === i
                return (
                  <AngleCard key={p} label={PHASE_CFG[p].label} icon={PHASE_CFG[p].icon}
                    isActive={isActive} isDone={isDone} progress={isActive ? phaseProgress : 0}/>
                )
              })}
            </div>

            {/* Camera */}
            {capturePhase !== 'preview' && (
              <>
                {cameraState === 'active' ? (
                  <div className="camera-wrapper">
                    <video ref={videoRef} className="camera-video" autoPlay playsInline muted/>
                    <canvas ref={canvasRef} className="camera-canvas"/>
                    <canvas ref={overlayRef} className="camera-detection-canvas"/>

                    {/* Oval guide when no face detected */}
                    {!hasFace && (
                      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
                        style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
                        <ellipse cx="50" cy="47" rx="26" ry="35"
                          fill="none" stroke="rgba(124,58,237,0.35)" strokeWidth="0.7" strokeDasharray="3 2.5"/>
                      </svg>
                    )}

                    {/* Instruction overlay */}
                    {phaseConfig && (
                      <div className="cam-instruction">
                        <div className="cam-instruction-icon">
                          <FaceIcon dir={phaseConfig.icon} size={40}/>
                        </div>
                        <div className="cam-instruction-text">{phaseConfig.voice}</div>
                        <div className="cam-instruction-countdown">{countdown}</div>
                      </div>
                    )}
                    {!capturePhase && (
                      <div className="cam-instruction cam-instruction--dim">
                        <div className="cam-instruction-text">Posisikan wajah di dalam oval…</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="camera-placeholder">
                    <span className="camera-placeholder-icon">
                      {cameraState === 'denied' ? '🚫' : cameraState === 'unavailable' ? '📵' : '📷'}
                    </span>
                    <p>{cameraState === 'denied' ? 'Kamera ditolak browser.' : cameraState === 'unavailable' ? 'Kamera tidak tersedia.' : 'Kamera belum aktif.'}</p>
                    {cameraState === 'idle' && (
                      <button className="btn btn-primary btn-sm" onClick={startCamera}>Aktifkan Kamera</button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Preview thumbnails */}
            {capturePhase === 'preview' && capturedUrls.length > 0 && (
              <div className="enroll-previews">
                {capturedUrls.map((url, i) => (
                  <div key={i} className="enroll-preview-thumb">
                    <img src={url} alt={`Sudut ${i + 1}`}/>
                    <span>{['Depan','Kiri','Kanan'][i]}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="step-nav-row" style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={changeUser}>← Ganti Pengguna</button>
              {capturePhase === 'preview' && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { retake(); void startCamera() }}>
                  Ulangi Rekam
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Consent & Submit ── */}
        {activeStep === 3 && (
          <div className="enrollment-section">
            <h3>Persetujuan &amp; Submit</h3>
            {userName && (
              <div className="user-confirm-banner"><span className="dot"/>{userName}</div>
            )}
            {capturedUrls.length > 0 && (
              <div className="enroll-previews enroll-previews--sm" style={{ marginBottom:'1rem' }}>
                {capturedUrls.map((url, i) => (
                  <div key={i} className="enroll-preview-thumb">
                    <img src={url} alt={`Sudut ${i + 1}`}/>
                    <span>{['Depan','Kiri','Kanan'][i]}</span>
                  </div>
                ))}
              </div>
            )}
            <label className="consent-row">
              <input type="checkbox" checked={consentGranted} onChange={(e) => setConsentGranted(e.target.checked)}/>
              Saya menyetujui penggunaan data biometrik wajah pengguna ini untuk keperluan absensi
              otomatis sesuai UU Perlindungan Data Pribadi (UU PDP).
            </label>
            {submitState === 'error' && errorMessage && (
              <div className="enrollment-result error">{errorMessage}</div>
            )}
            <div className="enrollment-submit-row">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
                {submitState === 'loading' ? <><span className="spinner"/>Menyimpan…</> : 'Submit Enrollment'}
              </button>
              {!consentGranted && <span className="enrollment-hint">Centang persetujuan terlebih dahulu</span>}
            </div>
            <div className="step-nav-row">
              <button className="btn btn-ghost btn-sm" onClick={retake} disabled={submitState === 'loading'}>
                ← Ulangi Rekam
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
