import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import { useData } from 'vitepress'
import type { EnhanceAppContext } from 'vitepress'
import './custom.css'

/** Button at the bottom of the sidebar that leaves the docs and returns to
 *  the landing page (same origin, so a plain "/" works on any host). */
function HomeLink() {
  const { lang } = useData()
  const label = lang.value.startsWith('id') ? 'Kembali ke Beranda' : 'Back to Home'
  return h('a', { class: 'netra-home-link', href: '/', 'aria-label': label }, [
    h('span', { 'aria-hidden': 'true' }, '←'),
    h('span', label),
  ])
}

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'sidebar-nav-after': () => h(HomeLink),
    }),
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
