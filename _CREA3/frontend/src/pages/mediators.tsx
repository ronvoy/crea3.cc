import React, { useEffect, useState } from 'react'
import { Card, CardHeader, ErrorBox, Pill } from '../components/ui'
import { api } from '../api/client'

type Mediator = { id: number; email: string; username: string; role: string }

export default function MediatorsPage() {
  const [items, setItems] = useState<Mediator[]>([])
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setErr(null)
    try {
      const data = await api('/api/users/mediators')
      setItems(data)
    } catch (e: any) {
      setErr(e.message ?? 'Failed to load mediators')
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Mediators" subtitle="These users can be added as read-only mediators in any dispute." />
        <div className="p-4">
          <ErrorBox message={err} />
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Role</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td className="p-4 text-slate-600" colSpan={3}>No mediators found (seeded on backend startup).</td></tr>
                ) : items.map(m => (
                  <tr key={m.id} className="border-t border-slate-200">
                    <td className="p-3 font-medium">{m.username}</td>
                    <td className="p-3 text-slate-700">{m.email}</td>
                    <td className="p-3"><Pill>{m.role}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-slate-600">
            Tip: Invite a mediator by email in the Agents step and set role = <b>mediator</b>.
          </div>
        </div>
      </Card>
    </div>
  )
}
