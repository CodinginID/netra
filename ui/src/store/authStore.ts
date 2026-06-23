import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/types/auth'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  role: Role | null
  username: string | null
  isAuthenticated: boolean
  selectedTenantId: string | null
  setTokens: (access: string, refresh: string, role: Role) => void
  setSelectedTenantId: (id: string | null) => void
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
      selectedTenantId: null,

      setTokens: (access, refresh, role) => {
        let username: string | null = null
        let selectedTenantId: string | null = null
        try {
          const payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
          username = payload.sub ?? null
          // Populate tenant context from JWT so API calls include X-Tenant-Id automatically
          selectedTenantId = payload.tenant_id ?? null
        } catch { /* invalid token shape */ }
        set({ accessToken: access, refreshToken: refresh, role, username, isAuthenticated: true, selectedTenantId })
      },

      setSelectedTenantId: (id) => set({ selectedTenantId: id }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          role: null,
          username: null,
          isAuthenticated: false,
          selectedTenantId: null,
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
        selectedTenantId: state.selectedTenantId,
      }),
    }
  )
)
