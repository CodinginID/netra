import { useState } from 'react'
import {
  CalendarDays,
  Monitor,
  Users,
  CheckCircle2,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/Toast'
import { useI18n } from '@/store/i18nStore'
import { completeOnboarding } from '@/api/adminApi'

interface OnboardingWizardProps {
  onClose: () => void
  onComplete: () => void
}

type StepKey = 'welcome' | 'schedule' | 'device' | 'users' | 'test'

interface StepDef {
  key: StepKey
  icon: typeof CalendarDays
  title: string
  description: string
  instructionTitle: string
  steps: string[]
  cta?: string
  ctaLink?: string
}

const STEPS: StepDef[] = [
  {
    key: 'welcome',
    icon: GraduationCap,
    title: 'Selamat Datang di Netra!',
    description:
      'Netra adalah sistem absensi berbasis pengenalan wajah yang membantu Anda mengelola kehadiran karyawan secara akurat dan real-time.',
    instructionTitle: 'Untuk memulai, pastikan Anda sudah:',
    steps: [
      'Membuat jadwal shift atau sesi kerja',
      'Mendaftarkan perangkat kiosk untuk absensi',
      'Menambahkan pengguna dan melakukan enrollment wajah',
      'Menguji absensi di halaman Kehadiran',
    ],
  },
  {
    key: 'schedule',
    icon: CalendarDays,
    title: 'Buat Jadwal Kehadiran',
    description:
      'Jadwal menentukan kapan karyawan dianggap hadir tepat waktu, terlambat, atau pulang cepat.',
    instructionTitle: 'Buat jadwal di halaman Jadwal:',
    steps: [
      'Buka menu Jadwal di sidebar kiri',
      'Klik "Tambah Jadwal" di kanan atas',
      'Pilih tipe Shift (default: 08:00–17:00, toleransi 15 menit)',
      'Atau pilih tipe Sesi untuk jadwal fleksibel',
      'Centang "Jadwal Default" agar otomatis diterapkan',
    ],
    cta: 'Buka Jadwal',
    ctaLink: '/tenant/schedules',
  },
  {
    key: 'device',
    icon: Monitor,
    title: 'Daftarkan Perangkat Kiosk',
    description:
      'Setiap perangkat yang digunakan untuk absensi harus didaftarkan terlebih dahulu. Setelah didaftarkan, Anda akan mendapatkan token yang digunakan di perangkat kiosk.',
    instructionTitle: 'Daftarkan perangkat di halaman Perangkat:',
    steps: [
      'Buka menu Perangkat di sidebar kiri',
      'Klik "Daftarkan Perangkat" di kanan atas',
      'onboarding.device_step_name',
      'Salin token yang ditampilkan — token hanya muncul sekali',
      'Gunakan token tersebut pada konfigurasi kiosk',
    ],
    cta: 'Buka Perangkat',
    ctaLink: '/tenant/devices',
  },
  {
    key: 'users',
    icon: Users,
    title: 'Tambah Pengguna & Enrollment Wajah',
    description:
      'Tambahkan pengguna ke sistem dan lakukan enrollment wajah agar mereka bisa absen menggunakan pengenalan wajah.',
    instructionTitle: 'Tambah pengguna di halaman Pengguna:',
    steps: [
      'Buka menu Pengguna di sidebar kiri',
      'Klik "Tambah Pengguna" di kanan atas',
      'Isi nama lengkap, username, dan password',
      'Setelah dibuat, buka halaman Enrollment untuk mendaftarkan wajah',
      'Pastikan foto wajah jelas dan pencahayaan cukup',
    ],
    cta: 'Buka Pengguna',
    ctaLink: '/tenant/users',
  },
  {
    key: 'test',
    icon: CheckCircle2,
    title: 'Uji Absensi',
    description:
      'Setelah semua siap, uji proses absensi untuk memastikan semuanya berfungsi dengan baik.',
    instructionTitle: 'Uji absensi di halaman Kehadiran:',
    steps: [
      'Buka menu Kehadiran di sidebar kiri',
      'Pastikan perangkat kiosk sudah aktif',
      'Minta salah satu pengguna untuk mencoba absen',
      'onboarding.test_step_check',
      'Jika ada masalah, periksa kembali jadwal dan enrollment',
    ],
    cta: 'Buka Kehadiran',
    ctaLink: '/tenant/attendance',
  },
]

export function OnboardingWizard({ onClose, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0)
  const [completing, setCompleting] = useState(false)
  const { t } = useI18n()
  const token = useAuthStore((s) => s.accessToken)
  const toast = useToast()
  const current = STEPS[step]

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    }
  }

  function handlePrev() {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  async function handleComplete() {
    if (!token) return
    setCompleting(true)
    try {
      await completeOnboarding(token)
      toast.show('Setup selesai! Selamat menggunakan Netra.', 'success')
      onComplete()
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Gagal menyimpan setup', 'error')
    } finally {
      setCompleting(false)
    }
  }

  function handleCtaClick(link: string) {
    onClose()
    window.location.hash = link
  }

  function handleBackdropKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 600, width: '90%', zIndex: 9999 }}
      >
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= step ? 'var(--color-brand)' : 'var(--color-border)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Step counter */}
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>
          Langkah {step + 1} dari {STEPS.length}
        </div>

        {/* Icon + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--color-brand-light)',
              flexShrink: 0,
            }}
          >
            <current.icon size={20} color="var(--color-brand)" />
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
            {current.title}
          </h3>
        </div>

        {/* Description */}
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
          {current.description}
        </p>

        {/* Instruction card */}
        <div
          style={{
            background: 'var(--color-bg)',
            borderRadius: 10,
            padding: 16,
            marginBottom: 20,
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>
            {current.instructionTitle}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: 'var(--color-text-secondary)' }}>
            {current.steps.map((s, i) => (
              <li key={i}>{s.includes('.') ? t(s) : s}</li>
            ))}
          </ol>
          {current.cta && current.ctaLink && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 14, fontSize: 13 }}
              onClick={() => handleCtaClick(current.ctaLink!)}
            >
              {current.cta}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ fontSize: 13 }}
          >
            Lewati
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="btn btn-ghost" onClick={handlePrev} style={{ fontSize: 13 }}>
                <ChevronLeft size={16} />
                Sebelumnya
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={handleNext} style={{ fontSize: 13 }}>
                Selanjutnya
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleComplete}
                disabled={completing}
                style={{ fontSize: 13 }}
              >
                {completing ? 'Menyimpan...' : 'Selesai'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
