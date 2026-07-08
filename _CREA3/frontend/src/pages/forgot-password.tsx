import React, { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, Link as MuiLink } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import { useAuth } from '../store/auth'

const RESEND_SECONDS = 60

export default function ForgotPasswordPage() {
  const nav = useNavigate()
  const { forgotPassword, resetPassword } = useAuth()

  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const canResend = useMemo(() => cooldown <= 0 && !!email, [cooldown, email])

  async function sendCode() {
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      const res = await forgotPassword(email.trim())
      setStep('reset')
      setCooldown(RESEND_SECONDS)
      setInfo(res?.dev_code ? `Code sent. Dev code: ${res.dev_code}` : 'If the account exists, a reset code was sent.')
    } catch (err: any) {
      setError(err?.message ?? 'Could not send the reset code')
      setCooldown(RESEND_SECONDS)
    } finally {
      setBusy(false)
    }
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      await resetPassword(email.trim(), code.trim(), password)
      nav('/login', { state: { reset: true } })
    } catch (err: any) {
      setError(err?.message ?? 'Could not reset the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={step === 'request' ? 'We will email you a verification code' : 'Enter the code and your new password'}
    >
      {step === 'request' ? (
        <Stack
          component="form"
          spacing={2.5}
          onSubmit={(e) => {
            e.preventDefault()
            void sendCode()
          }}
        >
          {error ? <Alert severity="error">{error}</Alert> : null}
          {info ? <Alert severity="info">{info}</Alert> : null}
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send reset code'}
          </Button>
          <Typography variant="body2" color="text.secondary">
            Remembered it?{' '}
            <MuiLink component={RouterLink} to="/login" underline="hover">
              Back to sign in
            </MuiLink>
          </Typography>
        </Stack>
      ) : (
        <Stack component="form" spacing={2.5} onSubmit={onReset}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {info ? <Alert severity="info">{info}</Alert> : null}
          <TextField
            label="Verification code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputProps={{ inputMode: 'numeric', maxLength: 6, style: { letterSpacing: '0.4em' } }}
            autoFocus
            fullWidth
          />
          <TextField
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            fullWidth
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            error={!!confirm && confirm !== password}
            helperText={!!confirm && confirm !== password ? 'Passwords do not match' : ' '}
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" disabled={busy || code.length < 4 || !password || password !== confirm}>
            {busy ? 'Updating…' : 'Reset password'}
          </Button>
          <Button component={RouterLink} to="/login" variant="outlined">
            Back to sign in
          </Button>
          <Button onClick={() => void sendCode()} disabled={!canResend} variant="text">
            {canResend ? 'Resend code' : `Resend code in ${cooldown}s`}
          </Button>
        </Stack>
      )}
    </AuthLayout>
  )
}
