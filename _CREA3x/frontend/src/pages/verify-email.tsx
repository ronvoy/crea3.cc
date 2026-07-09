import React, { useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, Link as MuiLink } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import { api } from '../api/client'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState(params.get('code') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

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
      setError(err?.message ?? 'Verification failed. Please check the code and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Email verified" subtitle="Your account is now active">
        <Stack spacing={2.5}>
          <Alert severity="success">Your email has been verified — you can now sign in.</Alert>
          <Button variant="contained" size="large" component={RouterLink} to="/login">
            Go to sign in
          </Button>
        </Stack>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Verify your email" subtitle="Enter the 6-digit code we emailed you">
      <Stack component="form" spacing={2.5} onSubmit={submit}>
        {error ? <Alert severity="error">{error}</Alert> : null}

        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          fullWidth
        />
        <TextField
          label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputProps={{ inputMode: 'numeric', maxLength: 6, style: { letterSpacing: '0.4em' } }}
          autoFocus
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" disabled={busy || !email || code.length < 4}>
          {busy ? 'Verifying…' : 'Verify & continue'}
        </Button>

        <Alert severity="info">
          Prefer a link? Open the verification email we sent and click the link instead — either method activates
          your account.
        </Alert>

        <Typography variant="body2" color="text.secondary">
          Already verified?{' '}
          <MuiLink component={RouterLink} to="/login" underline="hover">
            Sign in
          </MuiLink>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
