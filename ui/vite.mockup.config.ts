/**
 * Build mockup mandiri: `npm run mockup:build` → dist-mockup/index.html.
 *
 * Hasilnya SATU berkas HTML (JS, CSS, gambar, dan font di-inline) yang bisa
 * dibuka lewat preview editor atau file:// tanpa server dan tanpa backend.
 * Isinya halaman asli aplikasi dengan data contoh (src/mockup/).
 */
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const APP_VERSION: string = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
).version

/** Ganti <script src> dan <link stylesheet> hasil build dengan isinya, lalu buang berkasnya. */
function inlineIntoHtml(): Plugin {
  return {
    name: 'netra:mockup-inline',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'))
      if (!html || html.type !== 'asset') return
      let source = String(html.source)
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          const tag = new RegExp(`<script[^>]*src="[^"]*${file.fileName}"[^>]*></script>`)
          const code = file.code.replace(/<\/script/gi, '<\\/script')
          source = source.replace(tag, () => `<script type="module">${code}</script>`)
          delete bundle[file.fileName]
        } else if (file.type === 'asset' && file.fileName.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${file.fileName}"[^>]*>`)
          source = source.replace(tag, () => `<style>${String(file.source)}</style>`)
          delete bundle[file.fileName]
        }
      }
      html.source = source
      html.fileName = 'index.html'
    },
  }
}

export default defineConfig({
  base: './',
  publicDir: false,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [react(), inlineIntoHtml()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-mockup',
    emptyOutDir: true,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: path.resolve(__dirname, 'mockup.html'),
      output: { inlineDynamicImports: true },
    },
  },
})
