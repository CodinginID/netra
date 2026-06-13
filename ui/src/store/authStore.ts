import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/types/auth'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  role: Role | null
  isAuthenticated: boolean
  setTokens: (access: string, refresh: string, role: Role) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      role: null,
      isAuthenticated: false,

      setTokens: (access, refresh, role) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          role,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          role: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'netra-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        role: state.role,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
