import React, { useEffect, useState } from 'react'
import { Button, Card, CardHeader, ErrorBox, Input } from '../components/ui'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import { useNavigate } from 'react-router-dom'

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

  async function changePassword() {
    setErr(null); setMsg(null)
    if (!currentPassword || !newPassword) {
      setErr('Please enter your current password and a new password.')
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

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Account details" subtitle="Manage your profile and privacy." />
        <div className="p-4 space-y-4">
          <ErrorBox message={err} />
          {msg ? <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-2xl p-3">{msg}</div> : null}

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-600 mb-1">Username</div>
              <Input value={user?.username ?? ''} disabled />
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Role</div>
              <Input value={user?.role ?? 'user'} disabled />
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-600 mb-1">Email</div>
            <div className="flex gap-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button onClick={changeEmail}>Change email</Button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <div className="text-sm font-semibold text-slate-900">Security</div>
            <div className="text-xs text-slate-600 mt-1">Update your password.</div>

            <div className="mt-3 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-600 mb-1">Current password</div>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">New password</div>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
            </div>

            <div className="mt-3">
              <Button onClick={changePassword}>Change password</Button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <div className="text-sm font-semibold text-slate-900">Data controls</div>
            <div className="text-xs text-slate-600 mt-1">
              You can delete dispute data you created, or delete your whole account.
            </div>

            <div className="mt-3 flex flex-col md:flex-row gap-2">
              <Button variant="outline" onClick={deleteData}>Delete my data</Button>
              <Button variant="danger" onClick={deleteAccount}>Delete account</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
