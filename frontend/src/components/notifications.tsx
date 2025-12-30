import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Button } from './ui'

type Invite = {
  id: number
  dispute_id: number
  dispute_title: string
  role_in_dispute: string
  invite_status: string
}

export default function NotificationsBell() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [open, setOpen] = useState(false)
  const nav = useNavigate()

  async function load() {
    try {
      const data = await api('/api/notifications', { method: 'GET' })
      setInvites(data)
    } catch {
      setInvites([])
    }
  }

  useEffect(() => { load() }, [])
  const count = invites.length

  async function accept(inviteId: number) {
    const res = await api(`/api/notifications/${inviteId}/accept`, { method: 'POST' })
    await load()
    setOpen(false)
    nav(`/app/disputes/${res.dispute_id}`)
  }

  async function decline(inviteId: number) {
    await api(`/api/notifications/${inviteId}/decline`, { method: 'POST' })
    await load()
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        className="relative rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 backdrop-blur"
        aria-label="Notifications"
      >
        🔔
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 rounded-full bg-rose-600 text-white text-[11px] px-1.5 py-0.5">
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl border border-white/15 bg-slate-950/80 backdrop-blur shadow-2xl overflow-hidden z-50 text-white">
          <div className="p-3 border-b border-white/10 font-semibold">Invitations</div>
          <div className="p-3 space-y-2 max-h-[320px] overflow-auto">
            {invites.length === 0 ? (
              <div className="text-sm text-white/70">No new invitations.</div>
            ) : invites.map(inv => (
              <div key={inv.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="font-medium">{inv.dispute_title}</div>
                <div className="text-xs text-white/70">Dispute ID {inv.dispute_id} · Role: {inv.role_in_dispute}</div>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => accept(inv.id)}>OK</Button>
                  <Button variant="ghost" onClick={() => decline(inv.id)}>Dismiss</Button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-white/10 flex justify-end">
            <button className="text-sm text-white/70 hover:text-white" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
