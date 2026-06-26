import { GraduationCap, X } from 'lucide-react'

interface OnboardingBannerProps {
  onOpenWizard: () => void
  onDismiss: () => void
}

export function OnboardingBanner({ onOpenWizard, onDismiss }: OnboardingBannerProps) {
  return (
    <div
      style={{
        background: 'var(--gradient-brand)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        boxShadow: '0 4px 14px rgba(13, 148, 136, 0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.2)',
            flexShrink: 0,
          }}
        >
          <GraduationCap size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
            Selesaikan setup awal
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
            Buat jadwal, daftarkan perangkat, dan tambahkan pengguna agar absensi bisa berjalan.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          className="btn btn-primary"
          onClick={onOpenWizard}
          style={{
            fontSize: 13,
            background: '#fff',
            color: 'var(--color-brand)',
            border: 'none',
            fontWeight: 700,
          }}
        >
          Mulai Setup
        </button>
        <button
          onClick={onDismiss}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 8,
            border: 'none',
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            cursor: 'pointer',
          }}
          aria-label="Tutup banner"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
