import React, { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, MenuItem, Link as MuiLink } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import GoogleSignInButton from '../components/google-signin-button'
import { useAuth } from '../store/auth'

export default function RegisterPage() {
  const nav = useNavigate()
  const { register, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'agent' | 'mediator'>('agent')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await register(email.trim(), username.trim(), password, role)
      // Account created — a verification code was emailed. Go to the verify page.
      // The password is passed in-memory (router state) so we can auto-sign-in
      // straight to the dashboard once the email is verified.
      nav('/verify-email', {
        state: { email: res?.email ?? email.trim(), password, devCode: res?.dev_code ?? '' },
      })
    } catch (err: any) {
      setError(err?.message ?? 'Registration failed')
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Choose your role to get started">
      <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus fullWidth />
        <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" fullWidth />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" fullWidth />
        <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'agent' | 'mediator')} fullWidth helperText="You can join disputes as an Agent or oversee them as a Mediator.">
          <MenuItem value="agent">Agent</MenuItem>
          <MenuItem value="mediator">Mediator</MenuItem>
        </TextField>
        <Button type="submit" variant="contained" size="large" disabled={loading || !email || !username || !password}>
          {loading ? 'Creating…' : 'Create account'}
        </Button>
        <GoogleSignInButton label="Sign up with Google" />
        <Typography variant="body2" color="text.secondary">
          Already have an account?{' '}
          <MuiLink component={RouterLink} to="/login" underline="hover">
            Sign in
          </MuiLink>
        </Typography>
      </Stack>
    </AuthLayout>
  )
}
