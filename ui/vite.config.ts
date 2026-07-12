import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/**
 * Dev-only middleware that serves the VitePress build at /docs, mirroring
 * what nginx does in production — no second dev server needed. If the docs
 * were never built, it kicks off `npm ci && vitepress build` once in the
 * background and shows an auto-refreshing "building…" page meanwhile.
 * (For docs authoring with hot reload, `npm run docs:dev` still works.)
 */
function docsStatic(): Plugin {
  const docsDir = path.resolve(__dirname, 'docs-site')
  const docsDist = path.join(docsDir, '.vitepress', 'dist')
  let buildState: 'idle' | 'building' | 'failed' = 'idle'
  let buildLog = ''

  function ensureBuilt() {
    if (buildState === 'building' || fs.existsSync(path.join(docsDist, 'index.html'))) return
    buildState = 'building'
    const needsInstall = !fs.existsSync(path.join(docsDir, 'node_modules'))
    const cmd = (needsInstall ? 'npm ci && ' : '') + 'npm run docs:build'
    exec(cmd, { cwd: docsDir }, (err, _stdout, stderr) => {
      buildState = err ? 'failed' : 'idle'
      buildLog = err ? String(stderr).slice(-2000) : ''
    })
  }

  return {
    name: 'netra:serve-docs-static',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/docs', (req, res) => {
        const built = fs.existsSync(path.join(docsDist, 'index.html'))

        if (!built) {
          ensureBuilt()
          res.statusCode = buildState === 'failed' ? 500 : 503
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(
            buildState === 'failed'
              ? `<div style="font-family:sans-serif;padding:40px;max-width:70ch"><h2>Docs build failed</h2><pre style="white-space:pre-wrap">${buildLog.replace(/</g, '&lt;')}</pre><p>Fix the error, then run <code>npm run docs:build</code> from <code>ui/</code>.</p></div>`
              : '<meta http-equiv="refresh" content="3"><div style="font-family:sans-serif;padding:40px"><h2>Building docs…</h2><p>First run only — this page reloads automatically.</p></div>'
          )
          return
        }

        // Resolve the request path safely inside the dist directory.
        let urlPath: string
        try {
          urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
        } catch {
          res.statusCode = 400
          res.end('Bad request')
          return
        }
        if (urlPath === '' || urlPath.endsWith('/')) urlPath += 'index.html'
        let filePath = path.normalize(path.join(docsDist, urlPath))
        if (!filePath.startsWith(docsDist + path.sep)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html')
        }
        if (!fs.existsSync(filePath)) {
          const notFound = path.join(docsDist, '404.html')
          res.statusCode = 404
          if (fs.existsSync(notFound)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(fs.readFileSync(notFound))
          } else {
            res.end('Not found')
          }
          return
        }
        res.setHeader('Content-Type', MIME[path.extname(filePath)] ?? 'application/octet-stream')
        res.end(fs.readFileSync(filePath))
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    docsStatic(),
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
