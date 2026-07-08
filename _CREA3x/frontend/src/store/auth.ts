import { create } from 'zustand'
import { api } from '../api/client'
import { keycloak } from '../keycloak'

type Role = 'admin' | 'agent' | 'user' | 'mediator'

type AuthUser = { id: number; email: string; username: string; role: Role; email_verified?: boolean; country?: string | null; timezone?: string | null; locale?: string | null; notify_email_invitations?: boolean; notify_email_meetings?: boolean; notify_email_milestones?: boolean }

type AuthState = {
  user: AuthUser | null
  loading: boolean
  error: string | null
  // Kept for compatibility: these now delegate to Keycloak
  login: () => Promise<void>
  register: () => Promise<void>
  loadMe: () => Promise<void>
  setUser: (u: AuthUser | null) => void
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,

  async login() {
    // Login page already redirects, but keep for safety.
    await keycloak.login({ redirectUri: window.location.origin + '/app' })
  },

  async register() {
    await keycloak.register({ redirectUri: window.location.origin + '/app' })
  },

  setUser(u) {
    set({ user: u })
  },

  async loadMe() {
    set({ loading: true, error: null })
    try {
      const me = await api('/api/users/me', { method: 'GET' })
      set({ user: me, loading: false })
    } catch (e: any) {
      set({ user: null, loading: false, error: e.message ?? 'Failed to load user' })
    }
  },

  logout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null })
    // Best-effort Keycloak logout (if we have a session)
    try {
      keycloak.logout({ redirectUri: window.location.origin + '/' })
    } catch {
      // ignore
    }
  },
}))
