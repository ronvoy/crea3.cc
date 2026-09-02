import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
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

type Translate = (key: any, vars?: Record<string, string | number>) => string

// Human-readable line per notification type.
function describe(n: Notif, t: Translate): { icon: string; text: string } {
  const who = n.payload?.agent_name || t('ntfWho')
  const where = n.dispute_title ? `“${n.dispute_title}”` : t('ntfWhereDefault')
  switch (n.type) {
    // Milestone events that advance the workflow:
    case 'AllPartiesJoined':
      return { icon: '👥', text: t('ntfAllPartiesJoined', { where }) }
    case 'GoodsPhaseComplete':
      return { icon: '✅', text: t('ntfGoodsPhaseComplete', { where }) }
    case 'ProposalReady':
      return { icon: '⚖', text: t('ntfProposalReady', { where }) }
    case 'MeetingConfirmed':
      return { icon: '📅', text: t('ntfMeetingConfirmed', { where }) }
    case 'DisputeAbandoned':
      return { icon: '⚠', text: t('ntfDisputeAbandoned', { who, where }) }
    case 'DisputeFinalized':
      return { icon: '🏁', text: t('ntfDisputeFinalized', { where }) }
    default:
      return { icon: '•', text: t('ntfDefault', { where }) }
  }
}

function timeAgo(iso: string, t: Translate): string {
  const d = new Date(iso).getTime()
  const s = Math.max(1, Math.floor((Date.now() - d) / 1000))
  if (s < 60) return t('ntfSecAgo', { n: s })
  const m = Math.floor(s / 60); if (m < 60) return t('ntfMinAgo', { n: m })
  const h = Math.floor(m / 60); if (h < 24) return t('ntfHourAgo', { n: h })
  const dd = Math.floor(h / 24); return t('ntfDayAgo', { n: dd })
}

export default function NotificationsBell() {
  const { t } = useI18n()
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const nav = useNavigate()

  async function load() {
    try {
      const [list, count] = await Promise.all([
        api('/api/notifications?limit=30', { method: 'GET' }),
        api('/api/notifications/unread-count', { method: 'GET' }),
      ])
      setItems(Array.isArray(list) ? list : [])
      setUnread(Number(count?.unread || 0))
    } catch {
      /* not logged in / endpoint unavailable — keep the bell quiet */
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 2000) // auto-refresh every 2s
    return () => clearInterval(id)
  }, [])

  // close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Only one top-bar panel open at a time: close when the archive opens.
  useEffect(() => {
    function onOtherOpen(e: Event) {
      if ((e as CustomEvent).detail !== 'notifications') setOpen(false)
    }
    window.addEventListener('crea-panel-open', onOtherOpen as EventListener)
    return () => window.removeEventListener('crea-panel-open', onOtherOpen as EventListener)
  }, [])

  async function openPanel() {
    const next = !open
    setOpen(next)
    if (next) window.dispatchEvent(new CustomEvent('crea-panel-open', { detail: 'notifications' }))
    if (next && unread > 0) {
      try { await api('/api/notifications/read-all', { method: 'POST' }) } catch {}
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    }
  }

  function go(n: Notif) {
    setOpen(false)
    if (n.dispute_id) nav(`/app/disputes/${n.dispute_id}`)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={openPanel}
        aria-label={t('ntfAria')}
        className="relative grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition"
      >
        {/* bell icon (SVG, no external dep) */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-[11px] font-semibold">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed left-2 right-2 top-16 w-auto sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[340px] sm:max-w-[calc(100vw-2rem)] max-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 shadow-xl z-[60]">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold">{t('ntfTitle')}</div>
            <span className="text-xs text-slate-400">{t('ntfLive')}</span>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">{t('ntfNone')}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.slice(0, 5).map((n) => {
                const d = describe(n, t)
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => go(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 flex gap-3 ${n.read ? '' : 'bg-blue-50/40'}`}
                    >
                      <span className="text-base leading-5">{d.icon}</span>
                      <span className="flex-1">
                        <span className="block text-sm text-slate-800">{d.text}</span>
                        <span className="block text-xs text-slate-400 mt-0.5">{timeAgo(n.created_at, t)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {items.length > 0 ? (
            <button
              onClick={() => { setOpen(false); nav('/app/notifications') }}
              className="w-full px-4 py-2 text-center text-sm font-medium text-blue-700 hover:bg-slate-50 border-t border-slate-100"
            >
              {t('ntfShowAll')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
