import React, { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, Link as MuiLink } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import { useAuth } from '../store/auth'

export default function LoginPage() {
  const nav = useNavigate()
  const { login, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

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
