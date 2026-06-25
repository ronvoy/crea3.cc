import React, { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, Link as MuiLink } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import { useAuth } from '../store/auth'

const RESEND_SECONDS = 60

export default function VerifyEmailPage() {
  const nav = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { verifyEmail, resendVerification, login } = useAuth()

  // Email/password may arrive via router state (from register) or query string
  // (from the email link). Password is only present when coming from register.
  const state = (location.state ?? {}) as { email?: string; password?: string; devCode?: string }
  const initialEmail = state.email ?? params.get('email') ?? ''
  const password = state.password ?? ''

  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState(params.get('code') ?? state.devCode ?? '')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(
    state.devCode ? `Dev code: ${state.devCode}` : null,
  )
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(initialEmail ? RESEND_SECONDS : 0)

  // Countdown for the resend button.
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const canResend = useMemo(() => cooldown <= 0 && !!email, [cooldown, email])

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      await verifyEmail(email.trim(), code.trim())
      // Verified — if we have the password (came from register), sign straight in.
      if (password) {
        try {
          await login(email.trim(), password)
          nav('/app')
          return
        } catch {
          /* fall through to manual sign-in */
        }
      }
      nav('/login', { state: { verified: true } })
    } catch (err: any) {
      setError(err?.message ?? 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  async function onResend() {
    setError(null)
    setInfo(null)
    try {
      const res = await resendVerification(email.trim())
      setCooldown(RESEND_SECONDS)
      setInfo(res?.dev_code ? `New code sent. Dev code: ${res.dev_code}` : (res?.message ?? 'A new code was sent.'))
    } catch (err: any) {
      // Server enforces the 1-minute throttle too; reflect that here.
      setError(err?.message ?? 'Could not resend the code')
      setCooldown(RESEND_SECONDS)
    }
  }

  return (
    <AuthLayout title="Verify your email" subtitle="Enter the 6-digit code we emailed you">
      <Stack component="form" spacing={2.5} onSubmit={onVerify}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {info ? <Alert severity="info">{info}</Alert> : null}

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          fullWidth
        />
        <TextField
          label="Verification code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputProps={{ inputMode: 'numeric', maxLength: 6, style: { letterSpacing: '0.4em' } }}
          autoFocus
          fullWidth
        />

        <Button type="submit" variant="contained" size="large" disabled={busy || !email || code.length < 4}>
          {busy ? 'Verifying…' : 'Verify & continue'}
        </Button>

        <Button onClick={onResend} disabled={!canResend} variant="text">
          {canResend ? 'Resend code' : `Resend code in ${cooldown}s`}
        </Button>

        <Typography variant="body2" color="text.secondary">
          Entered the wrong address?{' '}
          <MuiLink component={RouterLink} to="/register" underline="hover">
            Start over
          </MuiLink>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
