import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'

type Msg = { role: 'user' | 'assistant'; text: string }

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', text: 'Hi — I can help explain the dispute flow, bids/rates, and what to do next.' }
  ])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, 0)
  }, [open, msgs.length])

  async function send() {
    const trimmed = input.trim()
    if (!trimmed) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text: trimmed }])

    try {
      // Use backend proxy to avoid CORS and keep keys/config server-side.
      const data = await api('/api/chat', { method: 'POST', body: { question: trimmed } })
      const answer = data?.answer ?? 'No response.'
      setMsgs(m => [...m, { role: 'assistant', text: String(answer) }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'The chat service is currently unavailable.' }])
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-blue-600 text-white w-12 h-12 shadow-lg hover:bg-blue-700"
        aria-label="Chat"
      >
        💬
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-50 w-[360px] max-w-[92vw] rounded-3xl bg-white/90 backdrop-blur border border-slate-200 shadow-2xl overflow-hidden">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="font-semibold">CREA3 Assistant</div>
            <button className="text-slate-600 hover:text-slate-900" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div ref={scrollRef} className="p-3 h-[300px] overflow-auto space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <span
                  className={
                    'inline-block rounded-2xl px-3 py-2 ' +
                    (m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-900')
                  }
                >
                  {m.text}
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-slate-200 flex gap-2 bg-white">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder="Chiedimi qualsiasi cosa…"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button onClick={send} className="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700">Send</button>
          </div>
        </div>
      ) : null}
    </>
  )
}
