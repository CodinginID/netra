import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/types/auth'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  role: Role | null
  username: string | null
  isAuthenticated: boolean
  setTokens: (access: string, refresh: string, role: Role) => void
  updateTokens: (access: string, refresh: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      role: null,
      username: null,
      isAuthenticated: false,

      setTokens: (access, refresh, role) => {
        let username: string | null = null
        try {
          const payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
          username = payload.sub ?? null
        } catch { /* invalid token shape */ }
        set({ accessToken: access, refreshToken: refresh, role, username, isAuthenticated: true })
      },

      // Update tokens after a silent refresh — keep role intact.
      updateTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          role: null,
          username: null,
          isAuthenticated: false,
        }),
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
    }
  )
)
