import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app'
import './index.css'

import { A11yProvider } from './components/a11y-provider'
import { AppThemeProvider } from './theme'
import { I18nProvider } from './i18n'
import SettingsDock from './components/settings-dock'
import CookieConsent from './components/cookie-consent'
import { AnimationProvider } from './components/animator'

import { useAuth } from './store/auth'
import { hasDirectSession, refreshTokens, clearDirectTokens, accessTokenExpiringSoon } from './auth/direct'

async function boot() {
  // Self-contained auth (no Keycloak): the app runs entirely on our own JWT
  // session stored in localStorage. Restore it across reloads if present.
  if (hasDirectSession()) {
    try {
      await refreshTokens()
      await useAuth.getState().loadMe()
    } catch {
      clearDirectTokens()
    }
  }

  // Keep the access token fresh from the refresh token.
  setInterval(async () => {
    try {
      if (hasDirectSession() && accessTokenExpiringSoon(60)) {
        await refreshTokens()
      }
    } catch {
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
              <AnimationProvider>
              <SettingsDock />
              <CookieConsent />
              <App />
              </AnimationProvider>
            </BrowserRouter>
          </I18nProvider>
        </AppThemeProvider>
      </A11yProvider>
    </React.StrictMode>,
  )
}

boot()
