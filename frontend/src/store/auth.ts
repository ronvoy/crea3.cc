import { create } from 'zustand'
import { api, setAccessToken } from '../api/client'

type Role = 'admin' | 'agent' | 'user' | 'mediator'

type AuthUser = { id: number; email: string; username: string; role: Role; email_verified?: boolean }

const REFRESH_KEY = 'refresh_token'

type AuthState = {
  user: AuthUser | null
  loading: boolean
  error: string | null
  // Backend-driven auth (no Keycloak browser redirect).
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    username: string,
    password: string,
    role: 'agent' | 'mediator',
  ) => Promise<{ verification_token?: string; email?: string; verification_required?: boolean; dev_code?: string }>
  verifyEmail: (email: string, code: string) => Promise<{ ok: boolean; message?: string }>
  resendVerification: (email: string) => Promise<{ ok: boolean; message?: string; dev_code?: string }>
  forgotPassword: (email: string) => Promise<{ ok: boolean; message?: string; dev_code?: string }>
  resetPassword: (email: string, code: string, newPassword: string) => Promise<{ ok: boolean; message?: string }>
  loadMe: () => Promise<void>
  setUser: (u: AuthUser | null) => void
  logout: () => void
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  error: null,

  async login(email, password) {
    set({ loading: true, error: null })
    try {
      const tokens = await api('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      })
      setAccessToken(tokens.access_token)
      if (tokens.refresh_token) localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
      await get().loadMe()
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Login failed' })
      throw e
    }
  },

  async register(email, username, password, role) {
    set({ loading: true, error: null })
    try {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: { email, username, password, role },
        auth: false,
      })
      set({ loading: false })
      return res
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Registration failed' })
      throw e
    }
  },

  async verifyEmail(email, code) {
    return api('/api/auth/verify-email', { method: 'POST', body: { email, code }, auth: false })
  },

  async resendVerification(email) {
    return api('/api/auth/resend-verification', { method: 'POST', body: { email }, auth: false })
  },

  async forgotPassword(email) {
    return api('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false })
  },

  async resetPassword(email, code, newPassword) {
    return api('/api/auth/reset-password', { method: 'POST', body: { email, code, new_password: newPassword }, auth: false })
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
      set({ user: null, loading: false, error: e?.message ?? 'Failed to load user' })
    }
  },

  logout() {
    setAccessToken(null)
    localStorage.removeItem(REFRESH_KEY)
    set({ user: null })
  },
}))
