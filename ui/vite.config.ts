import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Netra — Face Attendance',
        short_name: 'Netra',
        description: 'Multi-tenant face-recognition attendance platform',
        theme_color: '#0d9488',
        background_color: '#f8f9ff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/?source=pwa',
        scope: '/',
        categories: ['business', 'productivity'],
        lang: 'id',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        screenshots: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/index.html',
        // /docs is a separate static site (VitePress) served by nginx — the
        // SPA service worker must never hijack navigations into it.
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//, /^\/docs(\/|$)/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5170',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:5170',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
