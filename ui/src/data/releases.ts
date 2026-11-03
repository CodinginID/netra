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
    date: '2026-10-06',
    notes: {
      id: ['Setiap absensi dinilai terhadap jadwal default bila tidak ada jadwal khusus'],
      en: ['Every punch is judged against a default schedule when no specific one applies'],
    },
  },
  {
    date: '2026-09-26',
    notes: {
      id: [
        'Jam kerja dan sesi bisa diatur per hari dalam seminggu',
        'Halaman Jadwal Kerja ditata ulang per minggu',
        'Token perangkat bisa dilihat lagi; aksi perangkat dipindah ke menu',
      ],
      en: [
        'Working hours and sessions can be set per day of the week',
        'Work Schedule page redesigned around the week',
        'Device tokens can be viewed again; device actions moved into a menu',
      ],
    },
  },
  {
    date: '2026-08-19',
    notes: {
      id: [
        'Billing berdasarkan pemakaian terukur, dengan ringkasan dan pemakaian per tenant',
        'Permintaan demo dari halaman depan',
      ],
      en: [
        'Billing from measured usage, with a summary and per-tenant usage',
        'Demo requests from the landing page',
      ],
    },
  },
  {
    date: '2026-08-11',
    notes: {
      id: ['Hapus permanen per item dari tong sampah'],
      en: ['Permanent delete per item from the trash'],
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
