import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { changePasswordApi } from '@/api/authApi'
import { useToast } from '@/components/Toast'
import { useModalA11y } from '@/hooks/useModalA11y'

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const token = useAuthStore((s) => s.accessToken)
  const { show } = useToast()
  const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen: true, onClose })

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) { setError('Password baru minimal 8 karakter'); return }
    if (newPassword !== confirm) { setError('Konfirmasi password tidak cocok'); return }
    if (!token) { setError('Sesi tidak valid, silakan login ulang'); return }
    setError(null)
    setSubmitting(true)
    try {
      await changePasswordApi(token, oldPassword, newPassword)
      show('Password berhasil diubah', 'success')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div className="modal-card" ref={modalRef} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Ubah Password</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="cp-old">Password Saat Ini</label>
            <input id="cp-old" className="field-input" type={showPw ? 'text' : 'password'}
              value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required autoFocus
              autoComplete="current-password" />
          </div>
          <div className="field">
            <label htmlFor="cp-new">Password Baru</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input id="cp-new" className="field-input" type={showPw ? 'text' : 'password'}
                style={{ paddingRight: 40 }} placeholder="Minimal 8 karakter"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required
                autoComplete="new-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex' }}
                aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cp-confirm">Konfirmasi Password Baru</label>
            <input id="cp-confirm" className="field-input" type={showPw ? 'text' : 'password'}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              autoComplete="new-password" />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
