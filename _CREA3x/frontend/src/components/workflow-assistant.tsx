import React, { useEffect, useRef, useState } from 'react'
import { Card, CardHeader, Button, Input } from './ui'
import { api } from '../api/client'
import { useI18n } from '../i18n'

type Sender = 'user' | 'bot'
type Msg = { sender: Sender; text: string; ts: string }

function nowIso() { return new Date().toISOString() }
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

/**
 * Workflow Assistant — a LOCAL (Ollama) chatbot shown at the bottom of the
 * dispute workspace.
 *
 *  - Answers "how do I use the platform / what goes in this field" questions
 *    (the backend injects a platform guide into the system prompt).
 *  - Is grounded on the CURRENT dispute's live data (status, goods, agents and
 *    the caller's OWN preferences), so the user can ask about the ongoing case.
 *  - Lets the user switch the underlying model (any model installed in Ollama).
 *
 * If `disputeId` is provided it calls POST /api/assistant/disputes/{id}
 * (grounded); otherwise POST /api/assistant (general FAQ).
 */
export default function WorkflowAssistant({ disputeId, variant }: { disputeId?: number; variant?: 'support' }) {
  const { t, lang } = useI18n()
  const isSupport = variant === 'support'

  const [msgs, setMsgs] = useState<Msg[]>([
    { sender: 'bot', text: t('assistantWelcome'), ts: nowIso() },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // The assistant uses the server's default model (llama 3.2). The picker is
  // intentionally hidden from the user.
  const model = ''

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs.length])

  function historyPayload() {
    // last few turns, excluding the very first canned greeting
    return msgs
      .filter((_, i) => i > 0)
      .slice(-8)
      .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }))
  }

  async function send() {
    const q = input.trim()
    if (!q || sending) return
    setErr(null)
    setSending(true)
    setMsgs(m => [...m, { sender: 'user', text: q, ts: nowIso() }])
    setInput('')

    const path = disputeId ? `/api/assistant/disputes/${disputeId}` : '/api/assistant'
    try {
      const data = await api(path, {
        method: 'POST',
        body: { question: q, history: historyPayload(), model: model || undefined, lang },
      })
      setMsgs(m => [...m, { sender: 'bot', text: String(data?.answer ?? '(no answer)'), ts: nowIso() }])
    } catch (e: any) {
      const msg = e?.message || t('assistantUnavailable')
      setErr(msg)
      setMsgs(m => [...m, { sender: 'bot', text: `⚠️ ${msg}`, ts: nowIso() }])
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <div className="min-w-0">
            <div className="font-semibold text-slate-900">{isSupport ? t('assistantSupportTitle') : t('assistantTitle')}</div>
            <div className="text-xs text-slate-600 mt-0.5">
              {isSupport ? t('assistantSupportSubtitle') : (disputeId ? t('assistantSubtitleDispute') : t('assistantSubtitleGeneral'))}
            </div>
          </div>
        }
        right={null}
      />
      <div className="p-4">
        <div className="rounded-2xl border border-slate-200 bg-white/70 overflow-hidden">
          <div ref={scrollRef} className="h-[280px] overflow-y-auto p-3 space-y-2" role="log" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={m.sender === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.sender === 'user'
                  ? 'max-w-[88%] rounded-2xl rounded-br-md bg-blue-600 text-white px-3 py-2 text-sm shadow-sm'
                  : 'max-w-[88%] rounded-2xl rounded-bl-md bg-slate-50 text-slate-900 px-3 py-2 text-sm border border-slate-200'}>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                  <div className={m.sender === 'user' ? 'mt-1 text-[10px] text-white/70' : 'mt-1 text-[10px] text-slate-400'}>{fmtTime(m.ts)}</div>
                </div>
              </div>
            ))}
            {sending ? <div className="text-xs text-slate-400 px-1">…</div> : null}
          </div>
          <div className="border-t border-slate-200 bg-slate-50 p-2 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('assistantPlaceholder')}
              aria-label={t('assistantPlaceholder')}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            />
            <Button onClick={send} disabled={!input.trim() || sending}>{sending ? '…' : t('send')}</Button>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">{t('assistantHint')}</div>
      </div>
    </Card>
  )
}
