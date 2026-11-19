/* Titik masuk mockup. Dev: `npm run dev` lalu buka /mockup (Vite menyajikan
   mockup.html). Mandiri: `npm run mockup:build` → dist-mockup/index.html, satu
   berkas HTML yang bisa dibuka lewat preview editor (iframe sandbox), file://,
   atau http. */
import './storageShim'
import '@/styles/global.css'
import '@/styles/mobile.css'
import { applyTheme, resolveInitialTheme } from '@/store/themeStore'
import { renderMockup } from './entry'

// Salinan HTML ini sendiri, diambil sebelum React mengisi #root: setiap bingkai
// layar memuatnya lewat srcdoc, jadi tidak perlu URL yang bisa dibuka ulang.
const sourceHtml = `<!doctype html>\n${document.documentElement.outerHTML}`

applyTheme(resolveInitialTheme())

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')
renderMockup(rootEl, sourceHtml)
