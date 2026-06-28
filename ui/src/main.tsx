import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/global.css'
import '@/styles/mobile.css'
import App from '@/App'
import { applyTheme, resolveInitialTheme } from '@/store/themeStore'

// Apply the persisted/preferred theme before first paint to avoid a flash (FOUC).
applyTheme(resolveInitialTheme())

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
)
