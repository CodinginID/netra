import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

/**
 * Returns `true` while the auth store is still in its initial (pre-persist)
 * state — i.e. before zustand finishes rehydrating from localStorage and
 * `silentRefresh()` resolves.
 *
 * During this window the app must NOT render `<AppRoutes>`, otherwise the
 * first paint will see `isAuthenticated: false` and redirect to `/login`
 * even though the user has a valid refresh token in their browser.
 */
export function useAuthReady(): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // `persist` middleware exposes `rehydrated` — it flips to true once the
    // stored state has been restored from localStorage.
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setReady(true)
    })
    return unsub
  }, [])

  return ready
}
