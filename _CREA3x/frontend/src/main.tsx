import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app'
import './index.css'

import { A11yProvider } from './components/a11y-provider'
import { AppThemeProvider } from './theme'
import { I18nProvider } from './i18n'
import SettingsDock from './components/settings-dock'

import { keycloak } from './keycloak'
import { useAuth } from './store/auth'
import { setAccessToken } from './api/client'
import { hasDirectSession, refreshTokens, clearDirectTokens, accessTokenExpiringSoon } from './auth/direct'

async function boot() {
  // Initialize Keycloak without forcing a redirect on initial load
  // so public pages remain accessible.
  let authenticated = false
  try {
    authenticated = await keycloak.init({
    onLoad: 'check-sso',
    // Same-origin proxy makes silent (hidden-iframe) SSO reliable, so the app
    // boots without a full-page redirect to Keycloak on every load.
    silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
    pkceMethod: 'S256',
    checkLoginIframe: false,
    })
  } catch {
    // Keycloak unreachable: render UI anyway (public pages), but login will not work.
    authenticated = false
  }

  // If already logged in (SSO), persist token so our API client can use it.
  if (authenticated && keycloak.token) {
    setAccessToken(keycloak.token)
    await useAuth.getState().loadMe()
  } else if (hasDirectSession()) {
    // Embedded (direct-grant) session: restore it across page reloads.
    try {
      await refreshTokens()
      await useAuth.getState().loadMe()
    } catch {
      clearDirectTokens()
    }
  }

  // Refresh token periodically (Keycloak SSO session or embedded direct-grant session).
  setInterval(async () => {
    try {
      if (keycloak.authenticated) {
        const refreshed = await keycloak.updateToken(60)
        if (refreshed && keycloak.token) {
          setAccessToken(keycloak.token)
        }
      } else if (hasDirectSession() && accessTokenExpiringSoon(60)) {
        await refreshTokens()
      }
    } catch {
      // Refresh failed; clear stored tokens and let ProtectedRoute redirect to /login.
      clearDirectTokens()
      useAuth.getState().setUser(null)
    }
  }, 30_000)

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <A11yProvider>
        <AppThemeProvider>
          <I18nProvider>
            <BrowserRouter>
              <SettingsDock />
              <App />
            </BrowserRouter>
          </I18nProvider>
        </AppThemeProvider>
      </A11yProvider>
    </React.StrictMode>,
  )
}

boot()
