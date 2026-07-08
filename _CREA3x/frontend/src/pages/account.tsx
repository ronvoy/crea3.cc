import React, { useEffect, useState } from 'react'
import { Button, Card, CardHeader, ErrorBox, Input } from '../components/ui'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import { CountrySettings, NotificationSettings } from '../components/country'

export default function Account() {
  const { user, setUser, logout } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState(user?.email ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setEmail(user?.email ?? '')
  }, [user?.email])

  async function changeEmail() {
    setErr(null); setMsg(null)
    try {
      const updated = await api('/api/users/me', { method: 'PATCH', body: { email } })
      setUser(updated)
      setMsg('Email updated.')
    } catch (e: any) {
      setErr(e.message ?? 'Failed to update email')
    }
  }

  async function changePassword() {
    setErr(null); setMsg(null)
    if (!currentPassword || !newPassword) {
      setErr('Enter your current password and a new password.')
      return
    }
    try {
      await api('/api/users/me/password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      })
      setCurrentPassword('')
      setNewPassword('')
      setMsg('Password updated.')
    } catch (e: any) {
      setErr(e.message ?? 'Failed to update password')
    }
  }

  async function deleteData() {
    setErr(null); setMsg(null)
    if (!confirm('This will delete all disputes and dispute data created by your account. Continue?')) return
    try {
      await api('/api/users/me/data', { method: 'DELETE' })
      setMsg('Your data has been deleted.')
      nav('/app')
    } catch (e: any) {
      setErr(e.message ?? 'Failed to delete data')
    }
  }

  async function deleteAccount() {
    setErr(null); setMsg(null)
    if (!confirm('This will permanently delete your account and all related data. Continue?')) return
    try {
      await api('/api/users/me', { method: 'DELETE' })
      logout()
      nav('/')
    } catch (e: any) {
      setErr(e.message ?? 'Failed to delete account')
    }
  }

  const initial = (user?.username?.[0] ?? 'U').toUpperCase()

  return (
    <div className="grid gap-4">
      {/* Identity header */}
      <Card>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-600 text-xl font-semibold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-900">{user?.username ?? 'Your account'}</div>
            <div className="truncate text-sm text-slate-600">{user?.email ?? 'No email on file'}</div>
          </div>
          <div className="sm:ml-auto">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium capitalize text-slate-700">
              {user?.role ?? 'user'}
            </span>
          </div>
        </div>
      </Card>

      {(msg || err) ? (
        <div className="grid gap-2">
          <ErrorBox message={err} />
          {msg ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>
          ) : null}
        </div>
      ) : null}

      {/* Preferences */}
      <div className="grid gap-4 md:grid-cols-2">
        <CountrySettings />
        <NotificationSettings />
      </div>

      {/* Sign-in & security */}
      <Card>
        <CardHeader title="Sign-in & security" subtitle="Update the email and password you use to sign in." />
        <div className="space-y-5 p-5">
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">Email</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button onClick={changeEmail} className="sm:w-auto">Update email</Button>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">Current password</div>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">New password</div>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <Button onClick={changePassword}>Change password</Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Privacy & data */}
      <Card>
        <CardHeader title="Privacy & data" subtitle="Delete the dispute data you created, or remove your account entirely." />
        <div className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={deleteData}>Delete my dispute data</Button>
            <Button variant="danger" onClick={deleteAccount}>Delete account</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
