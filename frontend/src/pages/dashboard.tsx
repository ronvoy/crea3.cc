import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import { Card, CardHeader, Button, Input, Select, ErrorBox, Pill } from '../components/ui'

type Dispute = { id: number; title: string; method: 'bids'|'rates'; status: string }

export default function Dashboard() {
  const { user } = useAuth()
  const [items, setItems] = useState<Dispute[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [method, setMethod] = useState<'bids'|'rates'>('bids')

  const nav = useNavigate()

  async function load() {
    setLoading(true); setErr(null)
    try {
      const data = await api('/api/disputes')
      setItems(data)
    } catch (e: any) {
      setErr(e.message ?? 'Failed to load disputes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function create() {
    setErr(null)
    try {
      const d = await api('/api/disputes', { method: 'POST', body: { title, method } })
      setTitle('')
      await load()
      nav(`/app/disputes/${d.id}`)
    } catch (e: any) {
      setErr(e.message ?? 'Failed to create dispute')
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="Personal Home"
          subtitle="User Dashboard & Central Hub"
          right={<Button variant="ghost" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</Button>}
        />
        <div className="p-4 grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-sm text-slate-600">Signed in as <b>{user?.username}</b></div>
            <div className="text-sm text-slate-600">Role: <Pill>{user?.role}</Pill></div>
            <ErrorBox message={err} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold">Create New Dispute</div>
            <div className="text-xs text-slate-600">Only dispute owners/admins generate proposals and finalize reports.</div>
            <div className="grid grid-cols-1 gap-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Inheritance division" />
              <Select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                <option value="bids">Bids</option>
                <option value="rates">Rates</option>
              </Select>
              <Button onClick={create} disabled={!title.trim()}>Create</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Manage Existing Disputes" subtitle="Open a dispute to add agents, goods, preferences, and proposals." />
        <div className="p-4">
          {items.length === 0 ? (
            <div className="text-sm text-slate-600">No disputes yet.</div>
          ) : (
            <div className="grid gap-2">
              {items.map(d => (
                <Link key={d.id} to={`/app/disputes/${d.id}`} className="rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-slate-600">ID {d.id} · method {d.method}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill>{d.status}</Pill>
                    <span className="text-slate-400">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
