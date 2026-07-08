import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app'
import './index.css'

import { A11yProvider } from './components/a11y-provider'
import { I18nProvider } from './i18n'
import { AppThemeProvider } from './theme'
import SettingsDock from './components/settings-dock'
import DevToolbar from './components/dev-toolbar'
import DevConsole from './components/dev-console'

import { useAuth } from './store/auth'
import { useAppConfig } from './app-config'
import { api, setAccessToken } from './api/client'
import { installNetLogger } from './dev/net-log'

// Refresh the Keycloak access token via the backend, using the stored
// refresh token. Keeps the session alive without any browser redirect.
async function refreshSession(): Promise<boolean> {
  const refresh_token = localStorage.getItem('refresh_token')
  if (!refresh_token) return false
  try {
    const tokens = await api('/api/auth/refresh', { method: 'POST', body: { refresh_token }, auth: false })
    setAccessToken(tokens.access_token)
    if (tokens.refresh_token) localStorage.setItem('refresh_token', tokens.refresh_token)
    return true
  } catch {
    return false
  }
}

async function boot() {
  // Capture network traffic for the dev console and load app config (env + theme/font).
  installNetLogger()
  await useAppConfig.getState().loadFromServer()

  // Restore session from a stored token (set by the backend login flow).
  if (localStorage.getItem('access_token')) {
    try {
      await useAuth.getState().loadMe()
    } catch {
      // token may be expired — try a refresh, then reload the profile.
      if (await refreshSession()) {
        try { await useAuth.getState().loadMe() } catch { /* ignore */ }
      }
    }
  }

  // Periodically refresh the access token (Keycloak access tokens are short-lived).
  setInterval(() => {
    if (localStorage.getItem('refresh_token')) refreshSession()
  }, 4 * 60_000)

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <A11yProvider>
        <AppThemeProvider>
          <I18nProvider>
            <BrowserRouter>
              <SettingsDock />
              <DevToolbar />
              <DevConsole />
              <App />
            </BrowserRouter>
          </I18nProvider>
        </AppThemeProvider>
      </A11yProvider>
    </React.StrictMode>,
  )
}

boot()
