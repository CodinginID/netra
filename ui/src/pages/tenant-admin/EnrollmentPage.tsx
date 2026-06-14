import { useRef, useState, useEffect, type ChangeEvent } from 'react'
import { useAuthStore } from '@/store/authStore'
import { fetchUsers, enrollFace, type UserItem } from '@/api/enrollmentApi'
import '@/styles/layout.css'
import '@/styles/enrollment.css'

type CameraState = 'idle' | 'active' | 'denied' | 'unavailable'
type SubmitState = 'idle' | 'loading' | 'success' | 'error'

export function EnrollmentPage() {
  const accessToken = useAuthStore((s) => s.accessToken)

  // User selection
  const [users, setUsers] = useState<UserItem[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [manualUserId, setManualUserId] = useState('')

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')

  // Captured image
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null)

  // Submit
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [resultMessage, setResultMessage] = useState('')

  // Load users list on mount
  useEffect(() => {
    if (!accessToken) return
    setUsersLoading(true)
    fetchUsers(accessToken)
      .then((list) => setUsers(list))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false))
  }, [accessToken])

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraState('idle')
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
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

  function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        setCapturedBlob(blob)
        setCapturedDataUrl(canvas.toDataURL('image/jpeg'))
        stopCamera()
        setSubmitState('idle')
        setResultMessage('')
      },
      'image/jpeg',
      0.92
    )
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCapturedBlob(file)
    const reader = new FileReader()
    reader.onload = () => setCapturedDataUrl(reader.result as string)
    reader.readAsDataURL(file)
    setSubmitState('idle')
    setResultMessage('')
  }

  function retake() {
    setCapturedBlob(null)
    setCapturedDataUrl(null)
    setSubmitState('idle')
    setResultMessage('')
  }

  function resolvedUserId(): string {
    return users.length > 0 ? selectedUserId : manualUserId.trim()
  }

  async function handleSubmit() {
    const uid = resolvedUserId()
    if (!uid) {
      setSubmitState('error')
      setResultMessage('Pilih atau masukkan user terlebih dahulu.')
      return
    }
    if (!capturedBlob) {
      setSubmitState('error')
      setResultMessage('Ambil foto wajah terlebih dahulu.')
      return
    }
    if (!accessToken) {
      setSubmitState('error')
      setResultMessage('Sesi tidak valid. Silakan login kembali.')
      return
    }

    setSubmitState('loading')
    setResultMessage('')
    try {
      await enrollFace(accessToken, uid, capturedBlob)
      setSubmitState('success')
      setResultMessage('Enrollment berhasil! Wajah pengguna telah terdaftar.')
      setCapturedBlob(null)
      setCapturedDataUrl(null)
      if (users.length > 0) setSelectedUserId('')
      else setManualUserId('')
    } catch (err) {
      setSubmitState('error')
      setResultMessage(err instanceof Error ? err.message : 'Enrollment gagal.')
    }
  }

  const canSubmit =
    !!resolvedUserId() && !!capturedBlob && submitState !== 'loading'

  return (
    <div>
      <div className="page-header">
        <h2>Enrollment Wajah</h2>
        <p>Daftarkan foto wajah pengguna untuk absensi otomatis</p>
      </div>

      <div className="enrollment-layout">
        {/* Step 1: Select user */}
        <div className="enrollment-section">
          <h3>1. Pilih Pengguna</h3>

          {usersLoading && (
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Memuat daftar pengguna…</p>
          )}

          {!usersLoading && users.length > 0 ? (
            <div className="form-group">
              <label htmlFor="user-select">Pengguna</label>
              <select
                id="user-select"
                className="user-id-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">-- Pilih pengguna --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name ? `${u.full_name} (${u.username})` : u.username} — {u.id}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            !usersLoading && (
              <div className="form-group">
                <label htmlFor="manual-user-id">User ID</label>
                <input
                  id="manual-user-id"
                  type="text"
                  className="user-id-input"
                  value={manualUserId}
                  onChange={(e) => setManualUserId(e.target.value)}
                  placeholder="Masukkan user_id secara manual"
                />
              </div>
            )
          )}
        </div>

        {/* Step 2: Capture face */}
        <div className="enrollment-section">
          <h3>2. Ambil Foto Wajah</h3>

          {capturedDataUrl ? (
            <div className="captured-preview">
              <img src={capturedDataUrl} alt="Captured face" />
              <div>
                <p className="captured-label">Foto siap di-submit.</p>
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                  <button className="btn-secondary" onClick={retake}>
                    Ambil Ulang
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {cameraState === 'active' ? (
                <div className="camera-wrapper">
                  <video
                    ref={videoRef}
                    className="camera-video"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="camera-canvas" />
                </div>
              ) : (
                <div className="camera-placeholder">
                  <span className="camera-placeholder-icon">
                    {cameraState === 'denied'
                      ? '🚫'
                      : cameraState === 'unavailable'
                      ? '📵'
                      : '📷'}
                  </span>
                  <p>
                    {cameraState === 'denied'
                      ? 'Akses kamera ditolak. Gunakan upload file di bawah.'
                      : cameraState === 'unavailable'
                      ? 'Kamera tidak tersedia. Gunakan upload file di bawah.'
                      : 'Kamera belum aktif.'}
                  </p>
                </div>
              )}

              <div className="camera-actions">
                {cameraState !== 'active' && (
                  <button className="btn-capture" onClick={startCamera}>
                    Aktifkan Kamera
                  </button>
                )}
                {cameraState === 'active' && (
                  <>
                    <button className="btn-capture" onClick={captureFrame}>
                      Ambil Foto
                    </button>
                    <button className="btn-secondary" onClick={stopCamera}>
                      Hentikan Kamera
                    </button>
                  </>
                )}
              </div>

              <div className="file-upload-row">
                <label className="file-upload-label">
                  Atau upload file gambar:
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
            </>
          )}
        </div>

        {/* Step 3: Submit */}
        <div className="enrollment-section">
          <h3>3. Submit Enrollment</h3>

          {(submitState === 'success' || submitState === 'error') && (
            <div
              className={`enrollment-result ${submitState === 'success' ? 'success' : 'error'}`}
              style={{ marginBottom: '1rem' }}
            >
              {resultMessage}
            </div>
          )}

          <div className="enrollment-submit-row">
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitState === 'loading' ? 'Menyimpan…' : 'Submit Enrollment'}
            </button>
            {!resolvedUserId() && (
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                Pilih pengguna terlebih dahulu
              </span>
            )}
            {resolvedUserId() && !capturedBlob && (
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                Foto belum diambil
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
