import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stack, CircularProgress, Typography, Alert, Button } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import { useAuth } from '../store/auth'
import { setAccessToken } from '../api/client'

// Landing page for the Google OAuth redirect. The backend appends the Keycloak
// tokens in the URL fragment (#access_token=...&refresh_token=...). We store
// them, load the profile, then continue to the dashboard.
export default function AuthCallbackPage() {
  const nav = useNavigate()
  const { loadMe } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    // Scrub the tokens from the address bar.
    window.history.replaceState(null, '', window.location.pathname)

    if (!accessToken) {
      setError('Sign-in did not return a session. Please try again.')
      return
    }

    setAccessToken(accessToken)
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken)

    loadMe()
      .then(() => nav('/app', { replace: true }))
      .catch(() => setError('Signed in, but loading your profile failed. Please try again.'))
  }, [loadMe, nav])

  return (
    <AuthLayout title="Signing you in" subtitle="Completing Google sign-in…">
      {error ? (
        <Stack spacing={2}>
          <Alert severity="error">{error}</Alert>
          <Button variant="contained" onClick={() => nav('/login', { replace: true })}>
            Back to sign in
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            One moment…
          </Typography>
        </Stack>
      )}
    </AuthLayout>
  )
}
