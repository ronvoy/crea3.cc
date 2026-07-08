import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { removeRecentDispute } from '../utils/recent'
import { Card, CardHeader, Button, Input, ErrorBox, Pill, Textarea, HelpTip } from '../components/ui'
import DisputeStatusBadge from '../components/dispute-status-badge'

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
  const method: 'rates' = 'rates' // single rating-based procedure
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(d => {
      // Default ("all") view shows only active disputes; abandoned ones are
      // hidden unless explicitly selected via the status filter.
      if (statusFilter === 'all' && d.status === 'abandoned') return false
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (q && !(`${d.title} ${d.id}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [items, query, statusFilter])

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

  async function deleteDispute(e: React.MouseEvent, disputeId: number) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(t('deleteDisputeConfirm'))) return
    setErr(null)
    try {
      await api(`/api/disputes/${disputeId}`, { method: 'DELETE' })
      removeRecentDispute(disputeId)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to delete dispute')
    }
  }

  async function archiveDispute(e: React.MouseEvent, disputeId: number) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(t('archiveDisputeConfirm'))) return
    setErr(null)
    try {
      await api(`/api/disputes/${disputeId}/archive`, { method: 'POST' })
      removeRecentDispute(disputeId)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to archive dispute')
    }
  }

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
              <div className="flex items-center gap-2">
                <Button onClick={create} disabled={!title.trim()}>Create</Button>
                <HelpTip text={t('helpCreateDispute')} />
              </div>
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
              <div key={inv.dispute_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
          {items.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchDisputesPlaceholder')}
                className="flex-1 min-w-[180px] rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="all">{t('filterAllStatuses')}</option>
                <option value="draft">draft</option>
                <option value="collecting">collecting</option>
                <option value="reconciling">reconciling</option>
                <option value="proposed">proposed</option>
                <option value="accepted">accepted</option>
                <option value="mediation">mediation</option>
                <option value="finalized">finalized</option>
                <option value="abandoned">abandoned</option>
              </select>
            </div>
          ) : null}
          {items.length === 0 ? (
            <div className="text-sm text-slate-600">No disputes yet.</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-600">{t('noMatchingDisputes')}</div>
          ) : (
            <div className="grid gap-2">
              {filtered.map(d => (
                <Link key={d.id} to={`/app/disputes/${d.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-50 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.title}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-slate-500 shrink-0">ID {d.id}</span>
                      <DisputeStatusBadge status={d.status} theme="light" showSteps />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => archiveDispute(e, d.id)}
                      className="text-sm px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
                      title={t('archiveDisputeTitle')}
                      aria-label={t('archiveDisputeTitle')}
                    >
                      📥
                    </button>
                    <HelpTip text={t('helpArchiveAction')} />
                    <button
                      onClick={(e) => deleteDispute(e, d.id)}
                      className="text-sm px-2 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 active:scale-95 transition-all"
                      title={t('deleteDisputeTitle')}
                      aria-label={t('deleteDisputeTitle')}
                    >
                      🗑
                    </button>
                    <HelpTip text={t('helpDeleteAction')} />
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
