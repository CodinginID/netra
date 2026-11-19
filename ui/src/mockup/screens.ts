/* Daftar layar mockup, urut seperti bagian "Desain real semua halaman" di
   canvas Netra — Mockup Tampilan Revamp UI. Setiap layar adalah route asli
   aplikasi yang dirender dengan data contoh. */
import type { Role } from '@/types/auth'
import { TENANT_ID } from './fixtures/tenant'

export type Device = 'desktop' | 'phone' | 'tablet'

export interface Screen {
  id: string
  group: string
  title: string
  /** Route aplikasi yang dirender di dalam iframe. */
  path: string
  /** Parameter tambahan untuk URL iframe (halaman yang membaca window.location). */
  query?: string
  role: Role | null
  devices: Device[]
  /** Catatan desain dari canvas. */
  note: string
  deviceToken?: string
}

const TENANT: Pick<Screen, 'group' | 'role' | 'devices'> = { group: 'Admin tenant', role: 'tenant_admin', devices: ['desktop', 'phone'] }
const ADMIN: Pick<Screen, 'group' | 'role' | 'devices'> = { group: 'Super admin', role: 'super_admin', devices: ['desktop', 'phone'] }

export const SCREENS: Screen[] = [
  {
    id: 'login', group: 'Dasar', title: 'Login', path: '/login', role: null, devices: ['desktop', 'phone'],
    note: 'Warna dan UX lama dipertahankan; hanya animasi kartu ID yang diperbaiki (5 keadaan). Coba: email apa saja, password netra123 untuk berhasil, password lain untuk keadaan Gagal. Email berawalan "super" masuk sebagai super admin.',
  },
  { ...TENANT, id: 'tenant-home', title: 'Beranda', path: '/tenant/dashboard', note: 'Menjawab satu pertanyaan: berapa yang sudah hadir hari ini. Satu angka utama, 3 status, absen terbaru.' },
  { ...TENANT, id: 'tenant-status', title: 'Status harian', path: '/tenant/status', note: 'Roster satu hari termasuk yang belum absen. Kartu angka di atas sekaligus filter.' },
  { ...TENANT, id: 'tenant-attendance', title: 'Absensi', path: '/tenant/attendance', note: 'Riwayat lengkap untuk audit dan ekspor; filter dalam satu kartu di atas tabel.' },
  { ...TENANT, id: 'tenant-users', title: 'Pengguna', path: '/tenant/users', note: 'Status wajah jadi kolom sendiri; tombol Enrol hanya untuk yang belum terdaftar; aksi lain di menu ⋯. Di HP: kartu + bottom sheet.' },
  { ...TENANT, id: 'tenant-enroll', title: 'Enrol wajah', path: '/tenant/enrollment', note: 'Tiga langkah: pilih pengguna, rekam tiga sudut, persetujuan. Kamera jadi pusat layar; kamera di mockup berupa gambar diam.' },
  { ...TENANT, id: 'tenant-devices', title: 'Perangkat', path: '/tenant/devices', note: 'Kartu dengan status dan kapan terakhir aktif. Aksi token: lihat, reset, cabut, pulihkan.' },
  { ...TENANT, id: 'tenant-schedules', title: 'Jadwal', path: '/tenant/schedules', note: 'Jam kerja, hari kerja, dan toleransi dalam sekali lihat. Shift harian dan Sesi.' },
  { ...TENANT, id: 'tenant-integration', title: 'Integrasi', path: '/tenant/integration', note: 'API key, origin embed, dan panduan di satu halaman; masa berlaku key langsung terlihat.' },
  { ...TENANT, id: 'tenant-billing', title: 'Billing', path: '/tenant/billing', note: 'Paket aktif, pemakaian terhadap batas paket, lalu faktur.' },
  { ...TENANT, id: 'tenant-trash', title: 'Tempat sampah', path: '/tenant/trash', note: 'Tab per jenis data; tiap baris menampilkan sisa waktu sebelum dihapus permanen.' },
  { ...TENANT, id: 'tenant-settings', title: 'Pengaturan', path: '/tenant/settings', note: 'Pilihan bahasa, profil, dan tombol keluar.' },
  { ...ADMIN, id: 'admin-home', title: 'Dashboard', path: '/admin/dashboard', note: 'Sidebar gelap. Faktur lewat tenggat, trial hampir habis, dan demo baru dikumpulkan di kartu Perlu perhatian.' },
  { ...ADMIN, id: 'admin-tenants', title: 'Tenant', path: '/admin/tenants', note: 'Kelola + menu ⋯ per baris; Reset data diamankan dengan mengetik slug tenant.' },
  { ...ADMIN, id: 'admin-tenant-home', title: 'Kelola satu tenant', path: `/admin/tenants/${TENANT_ID}`, note: 'Tampilan tenant dari sisi super admin, dengan banner konteks tenant.' },
  { ...ADMIN, id: 'admin-billing', title: 'Billing · Ringkasan', path: '/admin/billing/summary', devices: ['desktop'], note: 'Lima halaman billing digabung di bawah satu menu Billing dengan submenu.' },
  { ...ADMIN, id: 'admin-subscriptions', title: 'Billing · Langganan', path: '/admin/billing/subscriptions', devices: ['desktop'], note: 'Pola tabel sama dengan Faktur.' },
  { ...ADMIN, id: 'admin-invoices', title: 'Billing · Faktur', path: '/admin/billing/invoices', devices: ['desktop'], note: 'Status faktur: draf, terbit, lunas, batal.' },
  { ...ADMIN, id: 'admin-usage', title: 'Billing · Pemakaian', path: '/admin/billing/usage', devices: ['desktop'], note: 'Pemakaian per tenant dengan tren 7 hari dan batas tier.' },
  { ...ADMIN, id: 'admin-plans', title: 'Billing · Paket', path: '/admin/billing/plans', devices: ['desktop'], note: 'Paket dan tier harga per jumlah pengguna.' },
  { ...ADMIN, id: 'admin-demo', title: 'Permintaan demo', path: '/admin/demo-requests', devices: ['desktop'], note: 'Kartu per permintaan dengan pesan utuh; Kirim WhatsApp dan Tandai dihubungi di kartu.' },
  { ...ADMIN, id: 'admin-settings', title: 'Pengaturan', path: '/admin/settings', note: 'Sama dengan Pengaturan tenant, dengan sidebar gelap.' },
  {
    id: 'kiosk', group: 'Kiosk dan enrol', title: 'Kiosk absen', path: '/attendance', role: null, devices: ['tablet', 'phone'],
    deviceToken: 'ntr_dev_contoh_8c1f0a',
    note: 'Tanpa tombol Masuk/Pulang: jenis scan ditentukan server dari jadwal. Offline tidak menjanjikan sinkron. Kamera di mockup berupa siluet; setiap scan dijawab Rina Wijaya, masuk tepat waktu.',
  },
  {
    id: 'embed-enroll', group: 'Kiosk dan enrol', title: 'Enrol embed', path: '/embed/enroll', query: '&token=mockup', role: null, devices: ['phone', 'desktop'],
    note: 'Kartu ringkas di dalam aplikasi HR klien: masuk, rekam wajah tiga sudut, persetujuan.',
  },
]

/** window.name iframe layar di build mandiri: `mockup-frame:<id>`. */
export const FRAME_NAME_PREFIX = 'mockup-frame:'

export function findScreen(id: string | undefined): Screen | undefined {
  return SCREENS.find((s) => s.id === id)
}

export const DEVICE_SIZE: Record<Device, { w: number; h: number; label: string }> = {
  desktop: { w: 1366, h: 860, label: 'Desktop' },
  phone: { w: 390, h: 844, label: 'HP' },
  tablet: { w: 1180, h: 820, label: 'Tablet' },
}
