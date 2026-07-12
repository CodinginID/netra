import DefaultTheme from 'vitepress/theme'
import type { EnhanceAppContext } from 'vitepress'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ router }: EnhanceAppContext) {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Gentle fade-in of the doc content on every SPA navigation.
    router.onAfterRouteChanged = () => {
      const el = document.querySelector<HTMLElement>('.VPDoc')
      if (!el) return
      el.classList.remove('netra-page-enter')
      void el.offsetWidth // restart the animation
      el.classList.add('netra-page-enter')
    }
  },
}
