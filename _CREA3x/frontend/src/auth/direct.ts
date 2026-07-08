// Embedded login against Keycloak using the OAuth2 Resource Owner Password
// Credentials (direct access grant) flow. This keeps Keycloak as the identity
// provider while rendering the sign-in form inside the platform instead of
// redirecting to Keycloak's hosted login page.
//
// Requirements on the Keycloak client:
//   - public client (no client secret) — the existing keycloak-js client is one
//   - "Direct access grants" enabled
// If direct grants are disabled, passwordLogin throws { code: 'direct_grant_disabled' }
// and the UI offers the hosted-login fallback.

import { setAccessToken } from '../api/client'

const RAW_URL = (import.meta.env.VITE_KEYCLOAK_URL || '').toString().replace(/\/+$/, '')
const REALM = (import.meta.env.VITE_KEYCLOAK_REALM || '').toString()
const CLIENT_ID = (import.meta.env.VITE_KEYCLOAK_CLIENT_ID || '').toString()
const REFRESH_KEY = 'refresh_token'

function tokenEndpoint(): string {
  return `${RAW_URL}/realms/${encodeURIComponent(REALM)}/protocol/openid-connect/token`
}

export function directAuthConfigured(): boolean {
  return Boolean(RAW_URL && REALM && CLIENT_ID)
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

async function tokenRequest(form: Record<string, string>): Promise<any> {
  let res: Response
  try {
    res = await fetch(tokenEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...form }).toString(),
    })
  } catch {
    // Network failure / server unreachable.
    throw new DirectAuthError('unavailable', 'The sign-in service is unreachable.')
  }

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON error */
  }

  if (!res.ok) {
    const err = (data?.error || '').toString()
    const desc = (data?.error_description || '').toString()
    if (err === 'invalid_grant') {
      // Wrong credentials, or account not fully set up (e.g. email not verified).
      if (/verif|not fully/i.test(desc)) throw new DirectAuthError('email_unverified', desc)
      throw new DirectAuthError('invalid_credentials', desc || 'Invalid credentials')
    }
    if (err === 'unauthorized_client' || /direct access grants/i.test(desc)) {
      throw new DirectAuthError('direct_grant_disabled', desc || 'Direct access grants are disabled')
    }
    throw new DirectAuthError('error', desc || `Sign-in failed (${res.status})`)
  }
  return data
}

export async function passwordLogin(username: string, password: string): Promise<void> {
  const data = await tokenRequest({ grant_type: 'password', username, password, scope: 'openid' })
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
  const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })
  storeTokens(data)
  return true
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
