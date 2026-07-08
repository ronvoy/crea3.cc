import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Card, CardHeader } from '../components/ui'
import { useI18n } from '../i18n'

type Notif = {
  id: number
  dispute_id?: number | null
  dispute_title?: string | null
  type: string
  payload: Record<string, any>
  read: boolean
  created_at: string
}

function describe(n: Notif): { icon: string; text: string } {
  const who = n.payload?.agent_name || n.payload?.by || 'Someone'
  const where = n.dispute_title ? `"${n.dispute_title}"` : 'a dispute'
  switch (n.type) {
    case 'DisputeAbandoned':
      return { icon: '⚠', text: `${who} abandoned ${where}; it is now closed.` }
    case 'ProposalReady':
    case 'ProposalGenerated':
      return { icon: '📄', text: `A new allocation proposal is ready in ${where}.` }
    case 'ProposalAccepted':
      return { icon: '✅', text: `${who} accepted the proposal in ${where}.` }
    case 'ProposalRejected':
      return { icon: '✕', text: `${who} rejected the proposal in ${where}.` }
    case 'InviteAccepted':
      return { icon: '🤝', text: `${who} accepted the invitation to ${where}.` }
    default:
      return { icon: '🔔', text: `${n.type} — ${where}` }
  }
}

function timeAgo(iso: string): string {
  try { return new Date(iso).toLocaleString() } catch { return '' }
}

export default function NotificationsAll() {
  const nav = useNavigate()
  const { t } = useI18n()
  const [items, setItems] = useState<Notif[] | null>(null)

  useEffect(() => {
    api('/api/notifications?limit=200', { method: 'GET' })
      .then((d: any) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
    api('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
  }, [])

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t('notificationsPageTitle')} subtitle={t('notificationsPageSubtitle')} />
        <div className="p-4">
          {items === null ? (
            <div className="text-sm text-slate-500">…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-slate-600">{t('notificationsEmpty')}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => {
                const d = describe(n)
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => { if (n.dispute_id) nav(`/app/disputes/${n.dispute_id}`) }}
                      className="w-full text-left py-3 flex gap-3 hover:bg-slate-50 rounded-lg px-2"
                    >
                      <span className="text-base leading-5">{d.icon}</span>
                      <span className="flex-1">
                        <span className="block text-sm text-slate-800">{d.text}</span>
                        <span className="block text-xs text-slate-400 mt-0.5">{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
