import React, { useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, Link as MuiLink, Box } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { useCooldown, cooldownFromError } from '../use-cooldown'

type ResendState = 'idle' | 'sending' | 'sent' | 'already' | 'error'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState(params.get('code') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [resend, setResend] = useState<ResendState>('idle')
  const [resendMsg, setResendMsg] = useState<string | null>(null)
  // sent=0 → the first verification email failed to send during registration.
  const firstSendFailed = params.get('sent') === '0'
  // A code was just sent at registration (unless that send failed), so the
  // resend button starts on the server's 60s cooldown, counting down visibly.
  const { left: waitLeft, start: startWait } = useCooldown(firstSendFailed ? 0 : 60)

  const firstSendWarning = firstSendFailed && resend === 'idle' ? (
    <Alert severity="warning">{t('verifyFirstSendFailed')}</Alert>
  ) : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api('/api/auth/verify-code', {
        method: 'POST',
        auth: false,
        body: { email: email.trim(), code: code.trim() },
      })
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? t('verifyFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function resendCode() {
    if (!email.trim()) {
      setResend('error')
      setResendMsg(t('loginResendNeedEmail'))
      return
    }
    setResend('sending')
    setResendMsg(null)
    try {
      const data = await api('/api/auth/resend-verification', {
        method: 'POST',
        auth: false,
        body: { email: email.trim() },
      })
      if (data?.status === 'already_verified') {
        setResend('already')
        setResendMsg(t('loginResendAlready'))
      } else if (data?.status === 'send_failed') {
        // SMTP rejected the send: say so instead of "check your inbox".
        setResend('error')
        setResendMsg(t('loginResendFailed'))
      } else {
        setResend('sent')
        setResendMsg(t('loginResendSent'))
        startWait(60)   // mirror the server's resend cooldown
      }
    } catch (e: any) {
      // Surface the real reason (e.g. the "please wait Ns" cooldown).
      setResend('error')
      setResendMsg(e?.detail || e?.message || t('loginResendError'))
      if (e?.status === 429) startWait(cooldownFromError(e))
    }
  }

  if (done) {
    return (
      <AuthLayout title={t('verifyEmailDoneTitle')} subtitle={t('verifyEmailDoneSubtitle')}>
        <Stack spacing={2.5}>
          <Alert severity="success">{t('verifyEmailDoneMsg')}</Alert>
          <Button variant="contained" size="large" onClick={() => navigate('/login')}>
            {t('verifyGoToSignIn')}
          </Button>
        </Stack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('verifyEmailTitle')} subtitle={t('verifyEmailSubtitle')}>
      <Stack component="form" spacing={2.5} onSubmit={submit}>
        {firstSendWarning}
        {error ? <Alert severity="error">{error}</Alert> : null}

        <TextField
          label={t('loginEmail')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          fullWidth
        />
        <Box>
          <TextField
            label={t('verifyCodeLabel')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputProps={{ inputMode: 'numeric', maxLength: 6, style: { letterSpacing: '0.4em' } }}
            autoFocus
            fullWidth
          />
          <Box sx={{ textAlign: 'right', mt: 0.75 }}>
            <Button size="small" onClick={resendCode} disabled={resend === 'sending' || waitLeft > 0}>
              {resend === 'sending'
                ? t('loginResendSending')
                : waitLeft > 0
                  ? t('resendWaitSeconds', { s: waitLeft })
                  : t('loginResend')}
            </Button>
          </Box>
        </Box>

        {resendMsg ? (
          <Alert severity={resend === 'sent' ? 'success' : resend === 'already' ? 'info' : 'warning'}>
            {resendMsg}
          </Alert>
        ) : null}

        <Button type="submit" variant="contained" size="large" disabled={busy || !email || code.length < 4}>
          {busy ? t('verifyBtnBusy') : t('verifyBtnSubmit')}
        </Button>

        <Alert severity="info">
          {t('verifyInfo')}
        </Alert>

        <Typography variant="body2" color="text.secondary">
          {t('verifyAlreadyQ')}{' '}
          <MuiLink component={RouterLink} to="/login" underline="hover">
            {t('verifySignIn')}
          </MuiLink>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
