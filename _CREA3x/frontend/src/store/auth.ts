import { create } from 'zustand'
import { api } from '../api/client'

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
    // No-op: the sign-in page posts to /api/auth/login directly.
  },

  async register() {
    // No-op: the register page posts to /api/auth/register directly.
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
    try {
      window.location.assign('/')
    } catch {
      /* ignore */
    }
  },
}))
