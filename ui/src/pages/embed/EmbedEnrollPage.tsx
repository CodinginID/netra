import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Chromeless enrollment page meant to be loaded inside a client app's <iframe>.
 * Auth is the one-time embed token from the URL (?token=). It bootstraps context
 * from GET /embed/session, captures a face, POSTs to /embed/enroll, then reports
 * the result back to the parent app via postMessage.
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
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [phase, setPhase] = useState<Phase>('loading')
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)
  const [guardian, setGuardian] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
    } catch {
      setPhase('error')
      setErrorMsg('Kamera tidak dapat diakses. Pastikan izin kamera diberikan.')
    }
  }

  function capture(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return resolve(null)
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(null)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    })
  }

  async function submit() {
    const blob = await capture()
    if (!blob) {
      setPhase('error')
      setErrorMsg('Gagal mengambil gambar')
      return
    }
    setPhase('submitting')
    const form = new FormData()
    form.append('images', blob, 'face.jpg')
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
      stopCamera()
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
            <h2 style={styles.title}>Hadapkan wajah ke kamera</h2>
            <div style={styles.videoWrap}>
              <video ref={videoRef} style={styles.video} autoPlay playsInline muted />
            </div>
            <button
              style={{ ...styles.btn, ...(phase === 'submitting' ? styles.btnDisabled : {}) }}
              disabled={phase === 'submitting'}
              onClick={() => void submit()}
            >
              {phase === 'submitting' ? 'Memproses…' : 'Ambil & Daftarkan'}
            </button>
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
            <button style={styles.btn} onClick={() => setPhase(info ? 'consent' : 'invalid')}>Coba lagi</button>
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
  videoWrap: { borderRadius: 12, overflow: 'hidden', background: '#000', margin: '8px 0 16px' },
  video: { width: '100%', display: 'block', transform: 'scaleX(-1)' },
  btn: { width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', background: '#0d9488', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  bigIcon: { fontSize: 44, marginBottom: 8 },
}
