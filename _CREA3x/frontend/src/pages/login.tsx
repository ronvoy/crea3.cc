import React, { useState } from 'react'
import { Link as RouterLink, useNavigate, Navigate } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, Link as MuiLink, Box } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import { useI18n } from '../i18n'
import { useAuth } from '../store/auth'
import { keycloak } from '../keycloak'
import { passwordLogin, directAuthConfigured, DirectAuthError } from '../auth/direct'

export default function LoginPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const loadMe = useAuth((s) => s.loadMe)
  const user = useAuth((s) => s.user)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unverified, setUnverified] = useState(false)
  const [showFallback, setShowFallback] = useState(!directAuthConfigured())

  // Already signed in? Skip the login form and go to the app home.
  if (user) return <Navigate to="/app" replace />

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
      <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
        {error ? <Alert severity="error">{error}</Alert> : null}

        <TextField
          label={t('loginEmail')}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.org"
          autoFocus
          fullWidth
        />

        <Box>
          <TextField
            label={t('loginPassword')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            fullWidth
          />
          <Box sx={{ textAlign: 'right', mt: 0.75 }}>
            <MuiLink component={RouterLink} to="/forgot-password" variant="body2" underline="hover" color="text.secondary">
              {t('loginForgot')}
            </MuiLink>
          </Box>
        </Box>

        {unverified ? (
          <Alert severity="warning" action={
            <Button
              component={RouterLink}
              color="inherit"
              size="small"
              to={`/verify-email${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
            >
              {t('loginResend')}
            </Button>
          }>
            {t('loginVerifyResendHint')}
          </Alert>
        ) : null}

        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? t('loginSigningIn') : t('loginSubmit')}
        </Button>

        <Typography variant="body2" color="text.secondary">
          {t('loginNoAccount')}{' '}
          <MuiLink component={RouterLink} to="/register" underline="hover">
            {t('loginRegister')}
          </MuiLink>
        </Typography>

        {showFallback ? (
          <Alert severity="info">
            {t('loginFallbackHint')}{' '}
            <MuiLink component="button" type="button" onClick={hostedLogin} underline="hover">
              {t('loginFallbackLink')}
            </MuiLink>
          </Alert>
        ) : null}
      </Stack>
    </AuthLayout>
  )
}
