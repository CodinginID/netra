import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/types/auth'
import { refreshApi } from '@/api/authApi'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  role: Role | null
  username: string | null
  isAuthenticated: boolean
  isRefreshing: boolean
  setTokens: (access: string, refresh: string, role: Role) => void
  updateTokens: (access: string, refresh: string) => void
  logout: () => void
  /** Silent refresh from the persisted refresh token — call once at app mount. */
  silentRefresh: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      role: null,
      username: null,
      isAuthenticated: false,
      isRefreshing: false,

      setTokens: (access, refresh, role) => {
        let username: string | null = null
        try {
          const payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
          username = payload.sub ?? null
        } catch { /* invalid token shape */ }
        set({ accessToken: access, refreshToken: refresh, role, username, isAuthenticated: true })
      },

      updateTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          role: null,
          username: null,
          isAuthenticated: false,
        }),

      silentRefresh: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return
        set({ isRefreshing: true })
        try {
          const tokens = await refreshApi(refreshToken)
          get().updateTokens(tokens.access_token, tokens.refresh_token)
          get().setTokens(tokens.access_token, tokens.refresh_token, tokens.role)
        } catch {
          get().logout()
        } finally {
          set({ isRefreshing: false })
        }
      },
    }),
    {
      name: 'netra-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        role: state.role,
        username: state.username,
        isAuthenticated: state.isAuthenticated,
      }),
      // silentRefresh is triggered by App.tsx via useAppReady() after the
      // store is fully rehydrated.  We intentionally don't fire it from a
      // persist callback here because we can't await it — the app would
      // render with an expired access token before the refresh completes,
      // triggering auto-logout.
    }
  )
)
