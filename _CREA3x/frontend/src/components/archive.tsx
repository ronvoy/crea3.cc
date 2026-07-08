import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, apiBlob } from '../api/client'

type ArchiveItem = {
  dispute_id: number
  title: string
  status: string
  is_closed: boolean
  has_report: boolean
  history: { event: string; at: string }[]
}

function statusColor(s: string): string {
  switch (s) {
    case 'finalized': return 'bg-emerald-100 text-emerald-700'
    case 'abandoned': return 'bg-rose-100 text-rose-700'
    case 'proposed': return 'bg-amber-100 text-amber-700'
    case 'mediation': return 'bg-violet-100 text-violet-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

export default function ArchiveButton() {
  const [items, setItems] = useState<ArchiveItem[]>([])
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const nav = useNavigate()

  async function load() {
    try {
      const data = await api('/api/disputes/archive/list', { method: 'GET' })
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 2000) // auto-refresh every 2s
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  // Only one top-bar panel open at a time: close when the bell opens.
  useEffect(() => {
    function onOtherOpen(e: Event) {
      if ((e as CustomEvent).detail !== 'archive') setOpen(false)
    }
    window.addEventListener('crea-panel-open', onOtherOpen as EventListener)
    return () => window.removeEventListener('crea-panel-open', onOtherOpen as EventListener)
  }, [])

  function togglePanel() {
    const next = !open
    setOpen(next)
    if (next) {
      load()
      window.dispatchEvent(new CustomEvent('crea-panel-open', { detail: 'archive' }))
    }
  }

  async function downloadPdf(disputeId: number, title: string) {
    try {
      const blob = await apiBlob(`/api/disputes/${disputeId}/report`, { method: 'GET' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CREA3_report_dispute_${disputeId}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // If no report or error, send them to the dispute page.
      nav(`/app/disputes/${disputeId}`)
    }
  }

  const closedCount = items.filter((i) => i.is_closed).length

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={togglePanel}
        aria-label="Archive"
        className="relative grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition"
      >
        {/* archive box icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="5" rx="1" />
          <path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" />
          <path d="M10 12h4" />
        </svg>
        {closedCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-slate-600 text-white text-[11px] font-semibold">
            {closedCount > 9 ? '9+' : closedCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-2rem)] max-h-[460px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 shadow-xl z-[60]">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold">Dispute archive</div>
            <div className="text-xs text-slate-500">Your disputes, their status, and reports.</div>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No disputes yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.slice(0, 5).map((it) => (
                <li key={it.dispute_id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <button className="text-left flex-1" onClick={() => nav(`/app/disputes/${it.dispute_id}`)}>
                      <div className="text-sm font-medium text-slate-800">{it.title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusColor(it.status)}`}>
                          {it.status}
                        </span>
                        <span className="text-xs text-slate-400">#{it.dispute_id}</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      {it.has_report ? (
                        <button
                          onClick={() => downloadPdf(it.dispute_id, it.title)}
                          className="text-xs px-2 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                          title="Download PDF report"
                        >
                          PDF
                        </button>
                      ) : null}
                      <button
                        onClick={() => setExpanded(expanded === it.dispute_id ? null : it.dispute_id)}
                        className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        title="Show status history"
                      >
                        {expanded === it.dispute_id ? 'Hide' : 'History'}
                      </button>
                    </div>
                  </div>
                  {expanded === it.dispute_id ? (
                    <ul className="mt-2 ml-1 border-l border-slate-200 pl-3 space-y-1">
                      {it.history.length === 0 ? (
                        <li className="text-xs text-slate-400">No recorded events.</li>
                      ) : it.history.map((h, i) => (
                        <li key={i} className="text-xs text-slate-600">
                          <span className="font-medium">{h.event}</span>
                          <span className="text-slate-400"> · {new Date(h.at).toLocaleDateString()}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 ? (
            <button
              onClick={() => { setOpen(false); nav('/app/archive') }}
              className="w-full px-4 py-2 text-center text-sm font-medium text-blue-700 hover:bg-slate-50 border-t border-slate-100"
            >
              Show all →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
