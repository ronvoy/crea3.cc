import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/auth-layout'
import { Button, Input, ErrorBox } from '../components/ui'
import { useI18n } from '../i18n'
import { api } from '../api/client'
import { keycloak } from '../keycloak'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
type ResendState = 'idle' | 'sending' | 'sent' | 'already' | 'error' | 'need_email'

export default function RegisterPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState(params.get('email') || '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [resend, setResend] = useState<ResendState>('idle')

  function hostedRegister() {
    keycloak.register({ redirectUri: window.location.origin + '/app' })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !email.trim() || !password || !confirm) {
      setError(t('registerErrRequired'))
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('registerErrEmail'))
      return
    }
    if (password.length < 8) {
      setError(t('registerErrPassword'))
      return
    }
    if (password !== confirm) {
      setError(t('registerErrMismatch'))
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: { username: username.trim(), email: email.trim(), password },
      })
      setDone(true)
    } catch (err: any) {
      const status = err?.status
      if (status === 409) setError(t('registerErrExists'))
      else if (status === 422) setError(t('registerErrPasswordPolicy'))
      else if (status === 503) {
        setError(t('registerUnavailable'))
        setShowFallback(true)
      } else setError(t('registerErrGeneric'))
      setBusy(false)
    }
  }

  async function resendVerification() {
    if (!EMAIL_RE.test(email.trim())) {
      setResend('need_email')
      return
    }
    setResend('sending')
    try {
      const data = await api('/api/auth/resend-verification', {
        method: 'POST',
        auth: false,
        body: { email: email.trim() },
      })
      setResend(data?.status === 'already_verified' ? 'already' : 'sent')
    } catch {
      setResend('error')
    }
  }

  const resendMsg: Record<ResendState, string | null> = {
    idle: null,
    sending: t('loginResendSending'),
    sent: t('loginResendSent'),
    already: t('loginResendAlready'),
    error: t('loginResendError'),
    need_email: t('loginResendNeedEmail'),
  }

  if (done) {
    return (
      <AuthLayout title={t('registerSuccessTitle')} subtitle="">
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {t('registerSuccessBody')}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`)}>
              Enter verification code
            </Button>
            <Button variant="outline" onClick={() => navigate('/login')}>{t('registerGoToLogin')}</Button>
            <Button variant="ghost" onClick={resendVerification} disabled={resend === 'sending'}>
              {resend === 'sending' ? t('loginResendSending') : t('loginResend')}
            </Button>
          </div>
          {resend !== 'idle' && resend !== 'sending' ? (
            <div className="text-xs text-slate-500">{resendMsg[resend]}</div>
          ) : null}
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('registerTitle')} subtitle={t('registerSubtitle')}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('registerUsername')}</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('registerEmail')}</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.org" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('registerPassword')}</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('registerConfirm')}</label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
        </div>

        <ErrorBox message={error} />

        <Button type="submit" className="w-full justify-center" disabled={busy}>
          {busy ? t('registerSubmitting') : t('registerSubmit')}
        </Button>

        <div className="text-sm text-slate-600">
          {t('registerHaveAccount')}{' '}
          <Link className="underline underline-offset-4" to="/login">
            {t('registerSignIn')}
          </Link>
        </div>

        {/* Resend verification — for people who already registered */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <div>{t('registerResendPrompt')}</div>
          <button
            type="button"
            onClick={resendVerification}
            disabled={resend === 'sending'}
            className="mt-2 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {resend === 'sending' ? t('loginResendSending') : t('loginResend')}
          </button>
          {resend !== 'idle' && resend !== 'sending' ? (
            <div className="mt-2 text-xs text-slate-500">{resendMsg[resend]}</div>
          ) : null}
        </div>

        {showFallback ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            {t('registerFallbackHint')}{' '}
            <button type="button" onClick={hostedRegister} className="underline underline-offset-4">
              {t('registerFallbackLink')}
            </button>
          </div>
        ) : null}
      </form>
    </AuthLayout>
  )
}
