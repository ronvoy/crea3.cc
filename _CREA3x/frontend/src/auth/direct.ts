// Embedded login against the app's OWN auth (self-contained, no Keycloak).
// Posts credentials to /api/auth/login and stores the returned JWTs. The public
// interface (passwordLogin / refreshTokens / DirectAuthError codes) is unchanged
// so the login page keeps working as-is.

import { setAccessToken, API_BASE } from '../api/client'

const REFRESH_KEY = 'refresh_token'

function apiUrl(path: string): string {
  const base = (API_BASE || '').replace(/\/+$/, '')
  return `${base}${path}`
}

// Self-contained auth is always available (no external IdP to configure).
export function directAuthConfigured(): boolean {
  return true
}

export class DirectAuthError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function storeTokens(data: any) {
  if (data?.access_token) setAccessToken(data.access_token)
  try {
    if (data?.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token)
  } catch {
    /* ignore */
  }
}

export function clearDirectTokens() {
  setAccessToken(null)
  try {
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    /* ignore */
  }
}

async function postJson(path: string, body: Record<string, unknown>): Promise<any> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new DirectAuthError('unavailable', 'The sign-in service is unreachable.')
  }

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const detail = (data?.detail || '').toString()
    if (res.status === 403) throw new DirectAuthError('email_unverified', detail || 'Email not verified')
    if (res.status === 401) throw new DirectAuthError('invalid_credentials', detail || 'Invalid credentials')
    throw new DirectAuthError('error', detail || `Sign-in failed (${res.status})`)
  }
  return data
}

export async function passwordLogin(username: string, password: string): Promise<void> {
  // `username` is the email-or-username field from the login form.
  const data = await postJson('/api/auth/login', { email: username, password })
  storeTokens(data)
}

export async function refreshTokens(): Promise<boolean> {
  let refresh: string | null = null
  try {
    refresh = localStorage.getItem(REFRESH_KEY)
  } catch {
    /* ignore */
  }
  if (!refresh) return false
  try {
    const data = await postJson('/api/auth/refresh', { refresh_token: refresh })
    storeTokens(data)
    return true
  } catch {
    return false
  }
}

export function hasDirectSession(): boolean {
  try {
    return Boolean(localStorage.getItem(REFRESH_KEY))
  } catch {
    return false
  }
}

// Decode a JWT's exp (seconds) without verifying the signature.
export function accessTokenExpiringSoon(thresholdSec = 60): boolean {
  const tok = (() => {
    try {
      return localStorage.getItem('access_token')
    } catch {
      return null
    }
  })()
  if (!tok) return true
  try {
    const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload?.exp) return false
    return payload.exp * 1000 - Date.now() < thresholdSec * 1000
  } catch {
    return false
  }
}
