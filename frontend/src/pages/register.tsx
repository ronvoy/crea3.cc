import React, { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Stack, TextField, Button, Alert, Typography, MenuItem, Link as MuiLink } from '@mui/material'
import AuthLayout from '../components/auth-layout'
import { useAuth } from '../store/auth'

export default function RegisterPage() {
  const nav = useNavigate()
  const { register, login, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'agent' | 'mediator'>('agent')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    try {
      const res = await register(email.trim(), username.trim(), password, role)
      // In dev the account is auto-verified, so sign in straight away and go to the dashboard.
      try {
        await login(email.trim(), password)
        nav('/app')
        return
      } catch {
        // Verification required (production): show the token / guidance.
        if (res?.verification_token) {
          setInfo(`Account created. Verify your email to continue. Dev token: ${res.verification_token}`)
        } else {
          setInfo('Account created. Please verify your email, then sign in.')
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Registration failed')
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Choose your role to get started">
      <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {info ? <Alert severity="success">{info}</Alert> : null}
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
