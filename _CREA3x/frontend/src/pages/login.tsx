import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/auth-layout'
import { Button, Input, ErrorBox } from '../components/ui'
import { useI18n } from '../i18n'
import { useAuth } from '../store/auth'
import { keycloak } from '../keycloak'
import { passwordLogin, directAuthConfigured, DirectAuthError } from '../auth/direct'

export default function LoginPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const loadMe = useAuth((s) => s.loadMe)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unverified, setUnverified] = useState(false)
  const [showFallback, setShowFallback] = useState(!directAuthConfigured())

  function hostedLogin() {
    keycloak.login({ redirectUri: window.location.origin + '/app' })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setUnverified(false)
    if (!email.trim() || !password) return
    setBusy(true)
    try {
      await passwordLogin(email.trim(), password)
      await loadMe()
      navigate('/app', { replace: true })
    } catch (err) {
      const code = err instanceof DirectAuthError ? err.code : 'error'
      if (code === 'email_unverified') {
        setError(t('loginErrorVerify'))
        setUnverified(true)
      } else if (code === 'invalid_credentials') {
        setError(t('loginErrInvalid'))
      } else if (code === 'unavailable') {
        setError(t('loginErrUnavailable'))
      } else if (code === 'direct_grant_disabled') {
        setError(t('loginErrorGeneric'))
        setShowFallback(true)
      } else {
        setError(t('loginErrorGeneric'))
      }
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={t('loginTitle')} subtitle={t('loginSubtitle')}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('loginEmail')}</label>
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.org"
            autoFocus
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('loginPassword')}</label>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <div className="mt-1.5 text-right">
            <Link to="/forgot-password" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-700">
              {t('loginForgot')}
            </Link>
          </div>
        </div>

        <ErrorBox message={error} />

        {/* Not verified yet — resend now lives on the registration page */}
        {unverified ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div>{t('loginVerifyResendHint')}</div>
            <Link
              to={`/register?verify=1${email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ''}`}
              className="mt-2 inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              {t('loginResend')}
            </Link>
          </div>
        ) : null}

        <Button type="submit" className="w-full justify-center" disabled={busy}>
          {busy ? t('loginSigningIn') : t('loginSubmit')}
        </Button>

        <div className="text-sm text-slate-600">
          {t('loginNoAccount')}{' '}
          <Link className="underline underline-offset-4" to="/register">
            {t('loginRegister')}
          </Link>
        </div>

        {showFallback ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {t('loginFallbackHint')}{' '}
            <button type="button" onClick={hostedLogin} className="underline underline-offset-4">
              {t('loginFallbackLink')}
            </button>
          </div>
        ) : null}
      </form>
    </AuthLayout>
  )
}
