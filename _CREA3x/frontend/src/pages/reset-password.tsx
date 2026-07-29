import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/auth-layout'
import { Button, Input, ErrorBox } from '../components/ui'
import { useI18n } from '../i18n'
import { api } from '../api/client'

export default function ResetPasswordPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // Reset is now code-based: the email carries a 6-digit code (no URL to be
  // spam-blocked). Email/code may be prefilled from the query string.
  const [email, setEmail] = useState(params.get('email') || '')
  const [code, setCode] = useState(params.get('code') || '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || code.trim().length < 4) {
      setError('Enter your email and the 6-digit code from the reset email.')
      return
    }
    if (password.length < 8) {
      setError(t('resetErrPassword'))
      return
    }
    if (password !== confirm) {
      setError(t('resetErrMismatch'))
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        auth: false,
        body: { email: email.trim(), code: code.trim(), password },
      })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 1800)
    } catch (err: any) {
      const status = err?.status
      if (status === 400) setError(err?.detail || t('resetErrToken'))
      else if (status === 422) setError(t('registerErrPasswordPolicy'))
      else setError(t('resetErrGeneric'))
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title={t('resetTitle')} subtitle="">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {t('resetSuccess')}
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('resetTitle')} subtitle={t('resetSubtitle')}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.org" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">6-digit reset code</label>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="123456" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('resetPasswordLabel')}</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('resetConfirmLabel')}</label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
        </div>

        <ErrorBox message={error} />

        <Button type="submit" className="w-full justify-center" disabled={busy}>
          {busy ? t('resetSubmitting') : t('resetSubmit')}
        </Button>

        <div className="text-sm text-slate-600">
          <Link className="underline underline-offset-4" to="/login">
            {t('forgotBackToLogin')}
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
