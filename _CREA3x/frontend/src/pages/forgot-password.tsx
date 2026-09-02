import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/auth-layout'
import { Button, Input, ErrorBox } from '../components/ui'
import { useI18n } from '../i18n'
import { useCooldown, cooldownFromError } from '../use-cooldown'
import { api } from '../api/client'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const { left: waitLeft, start: startWait } = useCooldown(0)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('forgotErrEmail'))
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/forgot-password', { method: 'POST', auth: false, body: { email: email.trim() } })
      setSent(true)
    } catch (err: any) {
      if (err?.status === 503) setError(t('forgotUnavailable'))
      else if (err?.status === 429) {
        // Server resend cooldown — show a live countdown instead of an error.
        startWait(cooldownFromError(err))
        setError(null)
      } else setError(t('forgotErrGeneric'))
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout title={t('forgotSentTitle')} subtitle="">
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {t('fpResetSent')}
          </div>
          <Button
            className="w-full justify-center"
            onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`)}
          >
            {t('fpEnterCode')}
          </Button>
          <div className="text-sm text-slate-600">
            <Link className="underline underline-offset-4" to="/login">
              {t('forgotBackToLogin')}
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('forgotTitle')} subtitle={t('forgotSubtitle')}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('forgotEmail')}</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.org" autoFocus />
        </div>

        <ErrorBox message={error} />

        <Button type="submit" className="w-full justify-center" disabled={busy || waitLeft > 0}>
          {busy ? t('forgotSending') : waitLeft > 0 ? t('resendWaitSeconds', { s: waitLeft }) : t('forgotSubmit')}
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
