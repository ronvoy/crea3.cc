import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app'
import './index.css'

import { A11yProvider } from './components/a11y-provider'
import { I18nProvider } from './i18n'
import { AppThemeProvider } from './theme'
import SettingsDock from './components/settings-dock'

import { keycloak } from './keycloak'
import { useAuth } from './store/auth'

async function boot() {
  // Initialize Keycloak without forcing a redirect on initial load
  // so public pages remain accessible.
  let authenticated = false
  try {
    authenticated = await keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    checkLoginIframe: false,
    })
  } catch {
    // Keycloak unreachable: render UI anyway (public pages), but login will not work.
    authenticated = false
  }

  // If already logged in (SSO), persist token so our API client can use it.
  if (authenticated && keycloak.token) {
    localStorage.setItem('access_token', keycloak.token)
    await useAuth.getState().loadMe()
  }

  // Refresh token periodically.
  setInterval(async () => {
    try {
      const refreshed = await keycloak.updateToken(60)
      if (refreshed && keycloak.token) {
        localStorage.setItem('access_token', keycloak.token)
      }
    } catch {
      // Token refresh failed; clear stored token and let ProtectedRoute redirect to /login.
      localStorage.removeItem('access_token')
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
