import React from 'react'
import { Card, CardHeader } from '../components/ui'
import { API_BASE } from '../api/client'

export default function SettingsPage() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Settings" subtitle="Environment and preferences." />
        <div className="p-4 text-sm text-slate-700 space-y-2">
          <div><b>API base</b>: {API_BASE}</div>
          <div className="text-slate-600">
            To change backend URL, set <code>VITE_API_BASE</code> in <code>frontend/.env</code>.
          </div>
        </div>
      </Card>
    </div>
  )
}
