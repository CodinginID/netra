import { defineConfig } from 'vitepress'

// User-guide documentation for Netra, served by nginx at /docs/.
// Root locale is English; the Indonesian mirror lives under /docs/id/.
export default defineConfig({
  title: 'Netra Docs',
  description: 'User guide for Netra — touchless face-recognition attendance',
  base: '/docs/',
  lastUpdated: false,
  themeConfig: {
    search: { provider: 'local' },
    socialLinks: [],
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/' },
          { text: 'App', link: 'https://netra.flowbiz.id' },
        ],
        sidebar: [
          {
            text: 'Getting Started',
            items: [
              { text: 'What is Netra', link: '/' },
              { text: 'Sign in & user roles', link: '/guide/sign-in-roles' },
            ],
          },
          {
            text: 'Admin Guide',
            items: [
              { text: 'Manage users', link: '/guide/manage-users' },
              { text: 'Face enrollment', link: '/guide/enrollment' },
              { text: 'Devices & kiosk', link: '/guide/devices-kiosk' },
              { text: 'Work schedules', link: '/guide/schedules' },
              { text: 'Attendance & reports', link: '/guide/attendance-reports' },
              { text: 'Daily status', link: '/guide/daily-status' },
            ],
          },
          {
            text: 'More',
            items: [
              { text: 'Integration', link: '/guide/integration' },
              { text: 'Trash & recovery', link: '/guide/trash-recovery' },
            ],
          },
        ],
      },
    },
    id: {
      label: 'Bahasa Indonesia',
      lang: 'id',
      link: '/id/',
      themeConfig: {
        nav: [
          { text: 'Panduan', link: '/id/' },
          { text: 'Aplikasi', link: 'https://netra.flowbiz.id' },
        ],
        sidebar: [
          {
            text: 'Mulai',
            items: [
              { text: 'Apa itu Netra', link: '/id/' },
              { text: 'Masuk & peran pengguna', link: '/id/guide/sign-in-roles' },
            ],
          },
          {
            text: 'Panduan Admin',
            items: [
              { text: 'Kelola pengguna', link: '/id/guide/manage-users' },
              { text: 'Enrollment wajah', link: '/id/guide/enrollment' },
              { text: 'Perangkat & kiosk', link: '/id/guide/devices-kiosk' },
              { text: 'Jadwal kerja', link: '/id/guide/schedules' },
              { text: 'Absensi & laporan', link: '/id/guide/attendance-reports' },
              { text: 'Status harian', link: '/id/guide/daily-status' },
            ],
          },
          {
            text: 'Lainnya',
            items: [
              { text: 'Integrasi', link: '/id/guide/integration' },
              { text: 'Sampah & pemulihan', link: '/id/guide/trash-recovery' },
            ],
          },
        ],
        docFooter: { prev: 'Sebelumnya', next: 'Berikutnya' },
        outline: { label: 'Di halaman ini' },
        returnToTopLabel: 'Kembali ke atas',
        darkModeSwitchLabel: 'Tampilan',
        sidebarMenuLabel: 'Menu',
      },
    },
  },
})
