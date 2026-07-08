import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useI18n, type I18nKey } from '../i18n'

type Msg = { role: 'user' | 'bot'; text: string }

/**
 * Floating help chatbot for anonymous visitors (landing + auth pages).
 * Answers general questions about the project and guides registration / sign-in.
 * Uses the public assistant endpoint (no auth); degrades gracefully if offline.
 */
export default function HelpWidget() {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'bot', text: t('helpWidgetWelcome') }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, open])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || sending) return
    setInput('')
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setSending(true)
    try {
      const history = msgs
        .slice(1)
        .slice(-8)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
      const data = await api('/api/assistant/public', {
        method: 'POST',
        auth: false,
        body: { question: q, history, lang },
      })
      setMsgs((m) => [...m, { role: 'bot', text: String(data?.answer ?? '') || t('helpWidgetOffline') }])
    } catch {
      setMsgs((m) => [...m, { role: 'bot', text: t('helpWidgetOffline') }])
    } finally {
      setSending(false)
    }
  }

  const suggestions: I18nKey[] = ['helpWidgetQ1', 'helpWidgetQ2', 'helpWidgetQ3']

  return (
    <div className="fixed bottom-5 right-5 z-50 print:hidden">
      {open ? (
        <div className="mb-3 flex w-[min(92vw,22rem)] flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900/95 text-white shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/5 p-4">
            <div className="min-w-0">
              <div className="font-semibold">{t('helpWidgetTitle')}</div>
              <div className="mt-0.5 text-xs text-white/65">{t('helpWidgetSubtitle')}</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label={t('helpWidgetClose')}
              className="shrink-0 rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div ref={scrollRef} className="h-72 space-y-2 overflow-y-auto p-3" role="log" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/90'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {sending ? <div className="text-xs text-white/50">{t('helpWidgetSending')}</div> : null}
            {msgs.length <= 1 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((k) => (
                  <button
                    key={k}
                    onClick={() => ask(t(k))}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form
            className="flex items-center gap-2 border-t border-white/10 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('helpWidgetPlaceholder')}
              aria-label={t('helpWidgetPlaceholder')}
              className="min-h-[40px] flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {t('helpWidgetSend')}
            </button>
          </form>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t('helpWidgetTitle')}
        className="ml-auto flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 font-medium text-white shadow-xl shadow-blue-900/30 transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 8h9M7.5 12h6M21 12a8 8 0 01-8 8H5l-2 2V12a8 8 0 018-8h0a8 8 0 018 8z" />
        </svg>
        <span className="text-sm">{t('helpWidgetOpen')}</span>
      </button>
    </div>
  )
}
