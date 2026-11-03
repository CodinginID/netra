/**
 * Release history shown in Settings → About, newest first.
 *
 * Add an entry here when shipping a user-visible change. `version` is set only
 * for real releases (package.json); earlier milestones carry just their date.
 */
export interface Release {
  version?: string
  date: string // ISO yyyy-mm-dd
  notes: { id: string[]; en: string[] }
}

export const RELEASES: Release[] = [
  {
    version: '0.1.0',
    date: '2026-11-03',
    notes: {
      id: [
        'Pengaturan tenant menampilkan informasi tenant dan daftar akun login',
        'Admin dapat mereset password admin dan supervisor yang lupa password',
        'Menu Pengaturan untuk tenant admin dan bagian Tentang aplikasi',
      ],
      en: [
        'Tenant settings show tenant information and the list of login accounts',
        'Admins can reset the password of an admin or supervisor who forgot it',
        'Settings menu for tenant admins and an About section',
      ],
    },
  },
  {
    date: '2026-08-06',
    notes: {
      id: [
        'Isolasi data antar tenant diperketat',
        'Hapus tenant permanen beserta seluruh datanya',
      ],
      en: ['Stricter data isolation between tenants', 'Permanent tenant deletion with all its data'],
    },
  },
  {
    date: '2026-07-24',
    notes: {
      id: ['Sinkronisasi daftar pengguna dari sistem klien lewat API integrasi'],
      en: ['User roster sync from client systems through the integration API'],
    },
  },
  {
    date: '2026-07-12',
    notes: {
      id: ['Halaman depan publik dan dokumentasi dwibahasa di /docs', 'Navigasi antar halaman lebih halus'],
      en: ['Public landing page and bilingual documentation at /docs', 'Smoother page navigation'],
    },
  },
  {
    date: '2026-07-11',
    notes: {
      id: [
        'Pendaftaran wajah tersemat (embed) dengan panduan 3 sudut',
        'Origin URL yang diizinkan untuk API key',
      ],
      en: ['Embedded face enrollment with guided 3-angle capture', 'Allowed origin URLs for API keys'],
    },
  },
  {
    date: '2026-07-01',
    notes: {
      id: ['Fitur integrasi dengan API key', 'Image Docker untuk produksi'],
      en: ['Integration feature with API keys', 'Production Docker images'],
    },
  },
  {
    date: '2026-06-28',
    notes: {
      id: ['Tampilan mobile (PWA)', 'Pilihan bahasa di Pengaturan'],
      en: ['Mobile layout (PWA)', 'Language option in Settings'],
    },
  },
  {
    date: '2026-06-14',
    notes: {
      id: ['Deteksi liveness, aturan jadwal, laporan, webhook, serta tampilan kiosk dan pendaftaran wajah'],
      en: ['Liveness check, schedule rules, reports, webhooks, kiosk and face enrollment screens'],
    },
  },
  {
    date: '2026-06-13',
    notes: {
      id: ['Fondasi aplikasi: multi-tenant, login, API, dan absensi wajah dasar'],
      en: ['App foundation: multi-tenancy, login, API, and basic face attendance'],
    },
  },
]
