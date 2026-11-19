import { useRef, useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Camera, CameraOff, RotateCcw } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { fetchUsers, enrollFaceMulti, grantConsent, type UserItem } from '@/api/enrollmentApi'
import { withTenantScope } from '@/api/adminApi'
import { useTenantScope } from '@/hooks/useApiQueries'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { useVoiceGuide } from '@/hooks/useVoiceGuide'
import { AngleTiles, EnrolAvatar, FaceIcon, PhoneBar, StepBar, UserPicker, VoiceSwitch } from './EnrollmentParts'
import '@/styles/layout.css'
import '@/styles/enrollment.css'

type CameraState  = 'idle' | 'active' | 'denied' | 'unavailable'
type CapturePhase = 'front' | 'left' | 'right' | 'preview'
type SubmitState  = 'idle' | 'loading' | 'success' | 'error'

const PHASES: Exclude<CapturePhase,'preview'>[] = ['front','left','right']

export function EnrollmentPage() {
  const { t } = useI18n()
  const { show } = useToast()
  const accessToken = useAuthStore((s) => s.accessToken)
  const tenantScope = useTenantScope()
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
    withTenantScope(tenantScope, () => fetchUsers(accessToken))
      .then(setUsers).catch(() => setUsersError(true)).finally(() => setUsersLoading(false))
  }

  useEffect(() => { loadUsers() }, [accessToken, tenantScope])

  // Users page hands over { userId } when "Enrol wajah" is chosen for someone.
  const location = useLocation()
  const presetUserId = (location.state as { userId?: string } | null)?.userId
  const [appliedPreset, setAppliedPreset] = useState<string | undefined>()
  if (presetUserId && presetUserId !== appliedPreset && users.some((u) => u.id === presetUserId)) {
    setAppliedPreset(presetUserId)
    setSelectedUserId(presetUserId)
  }
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

  const phaseConfig = {
    front: { label: t('enrollment.angle_front'), voice: t('enrollment.voice_front'), icon: 'front', duration: 3 },
    left:  { label: t('enrollment.angle_left'),  voice: t('enrollment.voice_left'),  icon: 'left',  duration: 4 },
    right: { label: t('enrollment.angle_right'), voice: t('enrollment.voice_right'), icon: 'right', duration: 4 },
  } as const

  const runCaptureSequence = useCallback(async () => {
    const blobs: Blob[] = []; const urls: string[] = []

    for (const phase of PHASES) {
      const { voice, duration } = phaseConfig[phase]
      setCapturePhase(phase)
      if (voiceEnabled) announcePhase(phase)

      await new Promise<void>((resolve) => {
        let rem = duration; setCountdown(rem)
        const id = setInterval(() => {
          rem--; setCountdown(rem)
          if (voiceEnabled && rem > 0) announceCountdown(rem)
          if (rem <= 0) { clearInterval(id); resolve() }
        }, 1000)
        void voice
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

  async function handleSubmit() {
    if (!uid || capturedBlobs.length === 0 || !accessToken) return
    setSubmitState('loading'); setErrorMessage('')
    try {
      // Both calls are pinned to the tenant shown in the URL so an enrollment
      // can never land in a different tenant than the operator is looking at.
      await withTenantScope(tenantScope, () => grantConsent(accessToken, uid))
      await withTenantScope(tenantScope, () => enrollFaceMulti(accessToken, uid, capturedBlobs))
      show(t('enrollment.toast_success', { count: capturedBlobs.length }), 'success')
      changeUser()
    } catch (err) {
      setSubmitState('error')
      setErrorMessage(err instanceof Error ? err.message : t('enrollment.toast_error'))
    } finally {
      setSubmitState((s) => s === 'loading' ? 'idle' : s)
    }
  }


  const currentPhase  = capturePhase && capturePhase !== 'preview' ? phaseConfig[capturePhase] : null
  const canSubmit     = !!uid && capturedBlobs.length > 0 && consentGranted && submitState !== 'loading'
  const previewLabels = [t('enrollment.preview_front'), t('enrollment.preview_left'), t('enrollment.preview_right')]
  const selectedUser  = users.find((u) => u.id === selectedUserId)
  const displayName   = selectedUser ? (selectedUser.full_name || selectedUser.username || t('enrollment.no_name')) : manualUserId.trim()
  const displaySub    = selectedUser ? (selectedUser.external_id || selectedUser.username || '') : ''
  const phaseIdx      = currentPhase ? PHASES.indexOf(capturePhase as Exclude<CapturePhase,'preview'>) : -1
  const doneCount     = capturePhase === 'preview' ? 3 : Math.max(phaseIdx, 0)
  const angleLabels   = { front: t('enrollment.angle_front'), left: t('enrollment.angle_left'), right: t('enrollment.angle_right') }

  const userCard = (
    <div className="enrol-card enrol-user-card">
      <EnrolAvatar name={displayName} />
      <div className="enrol-who-text">
        <div className="enrol-who-name">{displayName}</div>
        {displaySub && <div className="enrol-who-sub">{displaySub}</div>}
      </div>
      <button type="button" className="enrol-link" onClick={changeUser} disabled={submitState === 'loading'}>
        {t('enrollment.change_short')}
      </button>
    </div>
  )

  let primary: { label: string; onClick?: () => void; disabled?: boolean }
  if (cameraState !== 'active') {
    primary = { label: t('enrollment.enable_camera'), onClick: () => void startCamera() }
  } else if (currentPhase) {
    primary = { label: t('enrollment.capturing', { angle: currentPhase.label, count: countdown }), disabled: true }
  } else {
    primary = { label: t('enrollment.getting_ready'), disabled: true }
  }

  return (
    <div className={`enrol-page enrol-page--step${activeStep}`}>
      <div className="enrol-head">
        <h2 className="enrol-title">{t('enrollment.title')}</h2>
        <p className="enrol-subtitle">{t('enrollment.subtitle')}</p>
      </div>
      <StepBar active={activeStep} />
      {activeStep > 1 && <PhoneBar active={activeStep} name={displayName} onClose={changeUser} />}

      {activeStep === 1 && (
        <div className="enrol-card enrol-pick">
          <h3 className="enrol-card-title">{t('enrollment.step1')}</h3>
          {usersLoading && <p className="enrol-muted">{t('enrollment.loading_users')}</p>}
          {!usersLoading && usersError && (
            <div className="enrol-alert">
              <span>{t('enrollment.users_error')}</span>
              <button className="btn btn-ghost btn-sm" onClick={loadUsers}>{t('enrollment.try_again')}</button>
            </div>
          )}
          {!usersLoading && !usersError && users.length > 0 && (
            <UserPicker users={users} value={selectedUserId} onPick={setSelectedUserId} />
          )}
          {!usersLoading && !usersError && users.length === 0 && (
            <div className="field">
              <label htmlFor="manual-user-id">{t('enrollment.manual_user_id')}</label>
              <input id="manual-user-id" type="text" className="field-input"
                value={manualUserId} onChange={(e) => setManualUserId(e.target.value)}
                placeholder={t('enrollment.manual_user_id_placeholder')}/>
            </div>
          )}
        </div>
      )}

      {activeStep === 2 && (
        <div className="enrol-grid">
          <div className="enrol-stage">
            {cameraState === 'active' ? (
              <div className="enrol-cam">
                <video ref={videoRef} className="enrol-cam-video" autoPlay playsInline muted/>
                <canvas ref={canvasRef} className="enrol-cam-canvas"/>
                <canvas ref={overlayRef} className="enrol-cam-detect"/>
                {!hasFace && (
                  <svg className="enrol-cam-oval" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    <ellipse cx="50" cy="47" rx="26" ry="35" fill="none" strokeWidth="0.7" strokeDasharray="3 2.5"/>
                  </svg>
                )}
                <div className="enrol-cam-instruction" aria-live="polite">
                  <span>{currentPhase ? currentPhase.voice : t('enrollment.position_face')}</span>
                </div>
                {currentPhase && (
                  <div className="enrol-cam-hint" aria-hidden="true">
                    <FaceIcon dir={currentPhase.icon} size={40}/>
                    <span className="enrol-cam-count">{countdown}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="enrol-cam enrol-cam--off">
                {cameraState === 'idle' ? <Camera size={36} aria-hidden="true" /> : <CameraOff size={36} aria-hidden="true" />}
                <p>{cameraState === 'denied' ? t('enrollment.camera_denied') : cameraState === 'unavailable' ? t('enrollment.camera_unavailable') : t('enrollment.camera_inactive')}</p>
              </div>
            )}
          </div>

          <div className="enrol-side">
            {userCard}
            <div className="enrol-card enrol-angles-card">
              <div className="enrol-card-title">{t('enrollment.angles_done', { done: doneCount })}</div>
              <AngleTiles labels={angleLabels} doneCount={doneCount} activeIdx={phaseIdx} countdown={countdown} />
            </div>
            <VoiceSwitch checked={voiceEnabled} onChange={setVoiceEnabled} />
            <div className="enrol-actions">
              <button type="button" className="btn btn-ghost" onClick={changeUser}>{t('enrollment.change_user')}</button>
              <button type="button" className="btn btn-primary enrol-actions-main" onClick={primary.onClick} disabled={primary.disabled}>
                {primary.label}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeStep === 3 && (
        <div className="enrol-grid">
          <div className="enrol-stage">
            <div className="enrol-previews">
              {capturedUrls.map((url, i) => (
                <figure key={i} className="enrol-preview">
                  <img src={url} alt={t('enrollment.preview_alt', { index: i + 1 })}/>
                  <figcaption>{previewLabels[i]}</figcaption>
                </figure>
              ))}
            </div>
          </div>

          <div className="enrol-side">
            {userCard}
            <div className="enrol-card">
              <div className="enrol-card-title">{t('enrollment.consent_title')}</div>
              <label className="enrol-consent">
                <input type="checkbox" checked={consentGranted} onChange={(e) => setConsentGranted(e.target.checked)}/>
                <span>{t('enrollment.consent_checkbox')}</span>
              </label>
              {!consentGranted && <p className="enrol-muted enrol-hint">{t('enrollment.consent_hint')}</p>}
            </div>
            {submitState === 'error' && errorMessage && (
              <div className="enrol-alert enrol-alert--error" role="alert">{errorMessage}</div>
            )}
            <div className="enrol-actions">
              <button type="button" className="btn btn-ghost" onClick={retake} disabled={submitState === 'loading'}>
                <RotateCcw size={15} /> {t('enrollment.retake_short')}
              </button>
              <button type="button" className="btn btn-primary enrol-actions-main" onClick={handleSubmit} disabled={!canSubmit}>
                {submitState === 'loading' ? <><span className="enrol-spinner" aria-hidden="true"/>{t('enrollment.submit_loading')}</> : t('enrollment.submit_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
