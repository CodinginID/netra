/* Titik masuk mockup. Isi satu iframe dikenali dari window.name
   `mockup-frame:<id>` (iframe srcdoc); selain itu = penampil. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installMockFetch } from './mockApi'
import { installSandbox } from './sandbox'
import { FRAME_NAME_PREFIX, findScreen, type Screen } from './screens'
import { MockupFrame } from './MockupFrame'
import { MockupGallery } from './MockupGallery'

function frameFromName(): Screen | undefined {
  if (!window.name.startsWith(FRAME_NAME_PREFIX)) return undefined
  const screen = findScreen(window.name.slice(FRAME_NAME_PREFIX.length))
  // srcdoc tidak punya query string; halaman yang membaca window.location.search
  // (enrol embed: ?token=) diberi parameter layar lewat URLSearchParams('').
  if (screen?.query) {
    const extra = screen.query.replace(/^[?&]/, '')
    const Native = window.URLSearchParams
    window.URLSearchParams = class extends Native {
      constructor(init?: ConstructorParameters<typeof Native>[0]) {
        super(init === '' ? extra : init)
      }
    }
  }
  return screen
}

/** `sourceHtml` = HTML halaman ini; setiap bingkai layar memuatnya lewat srcdoc. */
export function renderMockup(rootEl: HTMLElement, sourceHtml: string): void {
  const screen = frameFromName()

  if (screen) {
    installSandbox({ role: screen.role, deviceToken: screen.deviceToken })
    installMockFetch()
    createRoot(rootEl).render(<StrictMode><MockupFrame screen={screen} /></StrictMode>)
    return
  }
  createRoot(rootEl).render(<StrictMode><MockupGallery sourceHtml={sourceHtml} /></StrictMode>)
}
