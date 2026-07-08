import React, { useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, Link as MuiLink } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import GoogleSignInButton from '../components/google-signin-button'
import { useAuth } from '../store/auth'

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured on the server.',
  google_state: 'Google sign-in expired or was tampered with. Please try again.',
  google_token: 'Could not complete Google sign-in (token exchange failed).',
  google_userinfo: 'Could not read your Google profile. Please try again.',
  google_no_email: 'Your Google account did not return an email address.',
  google_provision: 'Could not set up your account. Please try again.',
  google_login: 'Signed in with Google, but issuing your session failed.',
  google_network: 'Network error while contacting Google. Please try again.',
}

export default function LoginPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { login, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const oauthError = params.get('error')
  const [error, setError] = useState<string | null>(
    oauthError ? (GOOGLE_ERRORS[oauthError] ?? 'Google sign-in failed. Please try again.') : null,
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await login(email.trim(), password)
      nav('/app')
    } catch (err: any) {
      setError(err?.message ?? 'Login failed')
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use your CREA3 account to continue">
      <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <TextField
          label="Email or username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          autoFocus
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" disabled={loading || !email || !password}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
        <GoogleSignInButton />
        <Typography variant="body2" color="text.secondary">
          <MuiLink component={RouterLink} to="/forgot-password" underline="hover">
            Forgot password?
          </MuiLink>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          New here?{' '}
          <MuiLink component={RouterLink} to="/register" underline="hover">
            Create an account
          </MuiLink>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
