import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { Card, CardHeader, Button, Input, Select, ErrorBox, Pill, Textarea } from '../components/ui'

type Dispute = { id: number; title: string; method: 'bids'|'rates'; status: string }

type Invitation = {
  agent_id: number
  dispute_id: number
  dispute_title: string
  invited_as: string
  invite_status: string
  entitlement_share: number
  invited_at: string
  invited_by_email?: string | null
  invited_by_username?: string | null
}

export default function Dashboard() {
  const { t } = useI18n()
  const { user } = useAuth()

  const [items, setItems] = useState<Dispute[]>([])
  const [invites, setInvites] = useState<Invitation[]>([])
  const [inviteComments, setInviteComments] = useState<Record<number, string>>({})

  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [method, setMethod] = useState<'bids'|'rates'>('bids')

  const nav = useNavigate()

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [d, i] = await Promise.all([
        api('/api/disputes'),
        api('/api/invitations').catch(() => [] as Invitation[]),
      ])
      setItems(d)
      setInvites(i)
    } catch (e: any) {
      setErr(e?.message ?? t('errorLoadDisputes'))
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
      setErr(e?.message ?? t('errorCreateDispute'))
    }
  }

  async function respondInvite(disputeId: number, accept: boolean) {
    setErr(null)
    try {
      await api(`/api/invitations/${disputeId}/respond`, {
        method: 'POST',
        body: { accept, comment: inviteComments[disputeId] || null }
      })
      await load()
      if (accept) nav(`/app/disputes/${disputeId}`)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to respond to invitation')
    }
  }

  const hasInvites = invites.length > 0

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title={t('dashboardTitle')}
          subtitle={t('dashboardSubtitle')}
          right={<Button variant="ghost" onClick={load} disabled={loading}>{loading ? t('refreshing') : t('refresh')}</Button>}
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
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('dashboardCreatePlaceholder')} />
              <Select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                <option value="bids">Bids</option>
                <option value="rates">Rates</option>
              </Select>
              <Button onClick={create} disabled={!title.trim()}>Create</Button>
            </div>
          </div>
        </div>
      </Card>

      {/* INVITES BANNER */}
      {hasInvites ? (
        <Card>
          <CardHeader
            title="Inviti in attesa"
            subtitle="Accetta o rifiuta le dispute a cui sei stato invitato (puoi lasciare un commento)."
          />
          <div className="p-4 grid gap-3">
            {invites.map(inv => (
              <div key={inv.dispute_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold">{inv.dispute_title}</div>
                    <div className="text-xs text-slate-600">
                      Dispute #{inv.dispute_id} · ruolo: {inv.invited_as} · quota: {inv.entitlement_share}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Invitante: {inv.invited_by_username || '—'} {inv.invited_by_email ? `(${inv.invited_by_email})` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => respondInvite(inv.dispute_id, true)}>Accetta</Button>
                    <Button variant="ghost" onClick={() => respondInvite(inv.dispute_id, false)}>Rifiuta</Button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs text-slate-600 mb-1">Commento (opzionale)</div>
                  <Textarea
                    rows={3}
                    value={inviteComments[inv.dispute_id] || ''}
                    onChange={(e) => setInviteComments(prev => ({ ...prev, [inv.dispute_id]: e.target.value }))}
                    placeholder="Scrivi un commento per la controparte…"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t('dashboardManageCardTitle')} subtitle={t('dashboardManageCardSubtitle')} />
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
