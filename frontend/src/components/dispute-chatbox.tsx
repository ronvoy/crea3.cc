import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardHeader, Button, Input, Pill, Select } from './ui'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { useA11y } from './a11y-provider'
import LegalAvatar from './legal-avatar'

const API_URL = 'https://crea3_chatbot.idealunina.work/chat'

type Sender = 'user' | 'bot'
type ChatMsg = { sender: Sender; text: string; ts: string }
type ChatThread = { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMsg[] }
type ChatState = { activeChatId: string; chats: ChatThread[] }

type SpeechRec = SpeechRecognition & {
  lang: string
  interimResults: boolean
  continuous: boolean
}

function uid() {
  return `c_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}
function nowIso() { return new Date().toISOString() }
function fmtTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function DisputeChatBox({ disputeId }: { disputeId: number }) {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const { announce } = useA11y()

  const isAuthed = !!user
  const storageKey = useMemo(() => `crea3_dispute_chat_state_v2:${user?.username ?? 'anon'}:${disputeId}`, [user?.username, disputeId])

  const [state, setState] = useState<ChatState | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const activeChat = useMemo(() => {
    if (!state) return null
    return state.chats.find(c => c.id === state.activeChatId) || state.chats[0] || null
  }, [state])

  // Composer
  const [input, setInput] = useState('')
  const [dictationPreview, setDictationPreview] = useState('')

  const [sending, setSending] = useState(false)
  const messagesRef = useRef<HTMLDivElement | null>(null)

  // Voice (speech-to-text)
  const srRef = useRef<SpeechRec | null>(null)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const lastFinalRef = useRef<string>('')
  const sentFromVoiceRef = useRef(false)
  const manualStopRef = useRef(false)

  // Voice conversation (fully vocal)
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceSession, setVoiceSession] = useState(false)

  // Text-to-speech
  const [ttsMuted, setTtsMuted] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  const srLangCode = useMemo(() => (
    lang === 'it' ? 'it-IT'
    : lang === 'sl' ? 'sl-SI'
    : lang === 'et' ? 'et-EE'
    : lang === 'lt' ? 'lt-LT'
    : lang === 'hr' ? 'hr-HR'
    : lang === 'be' ? 'fr-BE'
    : 'en-US'
  ), [lang])


  // Better multilingual TTS: pick the best available system/browser voice for the selected language,
  // and allow the user to override it (stored per-language in localStorage).
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([])
  const [ttsVoiceURI, setTtsVoiceURI] = useState<string>('')

  useEffect(() => {
    try { setTtsVoiceURI(localStorage.getItem(`crea3_tts_voice_uri:${srLangCode}`) || '') } catch { setTtsVoiceURI('') }
  }, [srLangCode])

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const load = () => {
      try { setTtsVoices(window.speechSynthesis.getVoices() || []) } catch { setTtsVoices([]) }
    }
    load()
    // Some browsers populate voices asynchronously.
    // @ts-ignore
    window.speechSynthesis.onvoiceschanged = load
    return () => {
      try {
        // @ts-ignore
        if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null
      } catch {}
    }
  }, [])

  const ttsVoiceOptions = useMemo(() => {
    const base = srLangCode.split('-')[0]?.toLowerCase() || 'en'
    const scored = (v: SpeechSynthesisVoice) => {
      const name = (v.name || '').toLowerCase()
      let s = 0
      if ((v.lang || '').toLowerCase() === srLangCode.toLowerCase()) s += 50
      if ((v.lang || '').toLowerCase().startsWith(base)) s += 25
      if (name.includes('google')) s += 12
      if (name.includes('microsoft')) s += 10
      if (name.includes('natural') || name.includes('neural') || name.includes('premium')) s += 8
      return s
    }
    const opts = (ttsVoices || [])
      .filter(v => ((v.lang || '').toLowerCase().startsWith(base)))
      .sort((a, b) => scored(b) - scored(a) || (a.name || '').localeCompare(b.name || ''))
    return opts
  }, [ttsVoices, srLangCode])

  const chosenTtsVoice = useMemo(() => {
    if (!ttsVoices || ttsVoices.length === 0) return undefined
    const byUri = ttsVoices.find(v => v.voiceURI === ttsVoiceURI)
    if (byUri) return byUri
    const base = srLangCode.split('-')[0]?.toLowerCase() || 'en'
    const candidates = ttsVoices.filter(v => (v.lang || '').toLowerCase().startsWith(base))
    if (candidates.length === 0) return undefined

    const score = (v: SpeechSynthesisVoice) => {
      const name = (v.name || '').toLowerCase()
      let s = 0
      if ((v.lang || '').toLowerCase() === srLangCode.toLowerCase()) s += 50
      if (name.includes('google')) s += 12
      if (name.includes('microsoft')) s += 10
      if (name.includes('natural') || name.includes('neural') || name.includes('premium')) s += 8
      return s
    }
    return candidates.sort((a, b) => score(b) - score(a))[0]
  }, [ttsVoices, ttsVoiceURI, srLangCode])

  function save(next: ChatState) {
    setState(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  function defaultState(): ChatState {
    const id = uid()
    return {
      activeChatId: id,
      chats: [{
        id,
        title: 'New chat',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        messages: [{ sender: 'bot', text: "Hi! I'm the dispute assistant. Ask a question to get started.", ts: nowIso() }],
      }],
    }
  }

  function mutateState(updater: (s: ChatState) => ChatState) {
    setState(prev => {
      const base = (() => {
        if (prev) return prev
        try {
          const raw = localStorage.getItem(storageKey)
          if (raw) return JSON.parse(raw) as ChatState
        } catch {}
        return defaultState()
      })()
      const next = updater(base)
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    if (!isAuthed) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as ChatState
        setState(parsed)
        return
      }
    } catch {}
    const d = defaultState()
    setState(d)
    try { localStorage.setItem(storageKey, JSON.stringify(d)) } catch {}
  }, [isAuthed, storageKey])

  // Build speech recognition instance
  useEffect(() => {
    const W: any = window as any
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition
    if (!SR) {
      setVoiceSupported(false)
      srRef.current = null
      return
    }
    setVoiceSupported(true)

    const rec: SpeechRec = new SR()
    rec.interimResults = true
    rec.continuous = false
    rec.lang = srLangCode

    rec.onresult = (e: any) => {
      let transcript = ''
      let finalTranscript = ''

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const part = e.results[i][0]?.transcript || ''
        transcript += part
        if (e.results[i].isFinal) finalTranscript += part
      }

      const trimmed = transcript.trim()
      if (trimmed) { setInput(trimmed); setDictationPreview(trimmed) }

      const finalTrimmed = finalTranscript.trim()
      if (finalTrimmed) {
        lastFinalRef.current = finalTrimmed

        // Always write the final transcript into the input (requested),
        // then automatically query the chatbot.
        if (!manualStopRef.current && !sentFromVoiceRef.current && !sending && !speaking) {
          sentFromVoiceRef.current = true
          setDictationPreview('')
          sendText(finalTrimmed)
        }
      }
    }

    rec.onerror = () => {
      setListening(false)
      sentFromVoiceRef.current = false
      manualStopRef.current = false
      announce('Voice input error')
    }

    rec.onend = () => {
      setListening(false)
      const finalText = lastFinalRef.current

      // If we didn’t send from onresult, try sending now.
      if (!manualStopRef.current && !sentFromVoiceRef.current && finalText && !sending && !speaking) {
        sendText(finalText)
      }

      lastFinalRef.current = ''
      setDictationPreview('')
      sentFromVoiceRef.current = false
      manualStopRef.current = false
    }

    srRef.current = rec
    return () => {
      try { rec.abort() } catch {}
      srRef.current = null
    }
  }, [announce, srLangCode, sending, speaking])

  // Scroll to bottom on updates
  useEffect(() => {
    if (!messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [activeChat?.messages.length])

  function setActiveChat(id: string) {
    mutateState((s) => ({ ...s, activeChatId: id }))
  }

  function createNewChat() {
    const id = uid()
    const thread: ChatThread = {
      id,
      title: 'New chat',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [{ sender: 'bot', text: 'New chat started. What would you like to ask?', ts: nowIso() }],
    }
    mutateState((s) => ({ activeChatId: id, chats: [thread, ...s.chats] }))
    setDrawerOpen(true)
  }

  function deleteChat(id: string) {
    const snapshot = (() => {
      if (state) return state
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) return JSON.parse(raw) as ChatState
      } catch {}
      return null
    })()
    if (!snapshot) return
    const target = snapshot.chats.find(c => c.id === id)
    if (!target) return
    const ok = confirm(`Delete "${target.title || 'this chat'}"? This cannot be undone.`)
    if (!ok) return

    mutateState((s) => {
      const remaining = s.chats.filter(c => c.id !== id)
      if (remaining.length === 0) return defaultState()
      const nextActive = s.activeChatId === id ? remaining[0].id : s.activeChatId
      return { activeChatId: nextActive, chats: remaining }
    })
  }

  function addMessage(msg: ChatMsg) {
    mutateState((s) => {
      const chats = s.chats.map(c => {
        if (c.id !== s.activeChatId) return c
        const next = { ...c }
        next.messages = [...next.messages, msg]
        next.updatedAt = nowIso()

        // Auto-title from first user message
        if (next.title === 'New chat' && msg.sender === 'user') {
          next.title = msg.text.slice(0, 36) + (msg.text.length > 36 ? '…' : '')
        }
        return next
      })
      return { ...s, chats }
    })
  }

  function stopSpeech() {
    try { window.speechSynthesis?.cancel() } catch {}
    setSpeaking(false)
  }

  function speakBot(text: string, onDone?: () => void) {
    if (!('speechSynthesis' in window)) { onDone?.(); return }
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const v = chosenTtsVoice
      if (v) {
        // Pick a better voice for the selected language when available.
        // This greatly improves pronunciation for many languages on Chrome/Edge.
        // @ts-ignore
        u.voice = v
        u.lang = (v.lang || srLangCode)
      } else {
        u.lang = srLangCode
      }
      u.rate = 1
      u.pitch = 1
      u.onstart = () => setSpeaking(true)
      u.onend = () => { setSpeaking(false); onDone?.() }
      u.onerror = () => { setSpeaking(false); onDone?.() }
      window.speechSynthesis.speak(u)
    } catch {
      setSpeaking(false)
      onDone?.()
    }
  }

  function startMic() {
    if (!voiceSupported) return
    manualStopRef.current = false
    sentFromVoiceRef.current = false
    lastFinalRef.current = ''
    stopSpeech()
    try { srRef.current?.start?.() } catch {}
    setListening(true)
    announce('Listening')
  }

  function stopMic(manual = true) {
    if (!voiceSupported) return
    manualStopRef.current = manual
    try { srRef.current?.stop?.() } catch {}
    setListening(false)
    if (manual) announce('Stopped listening')
  }

  async function sendText(text: string) {
    const q = (text || '').trim()
    if (!q) return
    if (sending) return
    setSending(true)

    // In voice session, stop mic while we process/speak.
    try { srRef.current?.abort?.() } catch {}
    setListening(false)

    addMessage({ sender: 'user', text: q, ts: nowIso() })
    setInput('')
    setDictationPreview('')

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) throw new Error('Server error')
      const data = await res.json()
      const botText = (data?.answer || '(No answer)') as string
      addMessage({ sender: 'bot', text: botText, ts: nowIso() })

      // Fully vocal mode: speak the answer, then continue listening automatically.
      if (voiceMode && voiceSession && !ttsMuted) {
        speakBot(botText, () => {
          if (voiceMode && voiceSession) {
            startMic()
          }
        })
      }
    } catch (e) {
      addMessage({ sender: 'bot', text: '⚠️ Could not connect to the chat server.', ts: nowIso() })
    } finally {
      setSending(false)
    }
  }

  function send() {
    sendText(input)
  }

  function toggleVoiceMode() {
    setVoiceMode(v => {
      const nv = !v

      // When enabling voice mode, start a hands‑free voice session:
      // user speaks → transcript → auto-send → bot answers → TTS → continue listening.
      if (nv) {
        setTtsMuted(false)
        setVoiceSession(true)
        // start mic on next tick (ensures state updated)
        setTimeout(() => startMic(), 50)
        announce('Voice conversation started')
      } else {
        setVoiceSession(false)
        stopMic(false) // allow final auto-send if user was dictating
        stopSpeech()
      }
      return nv
    })
  }
  // UI helpers
  const avatarState = listening ? 'listening' : speaking ? 'speaking' : 'idle'
  const statusText =
    speaking ? 'Speaking…' : listening ? t('listening') : voiceMode ? 'Voice ready' : ''

  const canSend = !!input.trim() && !sending

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <div className="flex items-center gap-3">
            <LegalAvatar size={40} state={avatarState as any} />
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">Dispute assistant chat</div>
              <div className="text-xs text-slate-600 mt-0.5" aria-live="polite">
                {statusText || 'Create multiple chats. History is stored locally in your browser.'}
              </div>
            </div>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <Button onClick={createNewChat} aria-label={t('newChat')}>
              + {t('newChat')}
            </Button>

            <Button
              variant="danger"
              onClick={() => activeChat && deleteChat(activeChat.id)}
              aria-label={t('delete')}
              disabled={!activeChat}
            >
              {t('delete')}
            </Button>

            <Button
              variant="ghost"
              onClick={() => setDrawerOpen(v => !v)}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-label={t('history')}
              title={t('history')}
            >
              ☰
            </Button>
          </div>
        }
      />

      <div className="p-5">
        <div className="rounded-3xl border border-slate-200/70 bg-white/75 overflow-hidden">
          <div
            ref={messagesRef}
            className="h-[420px] overflow-y-auto p-4 space-y-3"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {!isAuthed ? (
              <div className="text-sm text-slate-600">Please sign in to use the chat.</div>
            ) : !activeChat ? (
              <div className="text-sm text-slate-600">Loading chat…</div>
            ) : (
              activeChat.messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.sender === 'user'
                      ? 'flex justify-end'
                      : 'flex justify-start'
                  }
                >
                  <div
                    className={
                      m.sender === 'user'
                        ? 'max-w-[85%] rounded-2xl rounded-br-lg bg-blue-600 text-white px-4 py-3 shadow'
                        : 'max-w-[85%] rounded-2xl rounded-bl-lg bg-white text-slate-900 px-4 py-3 border border-slate-200 shadow-sm'
                    }
                  >
                    <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{m.text}</div>
                    <div className={m.sender === 'user' ? 'mt-1 text-[11px] text-white/80' : 'mt-1 text-[11px] text-slate-500'}>
                      {fmtTime(m.ts)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-200/70 bg-white/85 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill className="bg-white/70 border border-slate-200">{voiceSupported ? 'Mic ready' : 'Mic unavailable'}</Pill>

              <Button
                variant="ghost"
                onClick={toggleVoiceMode}
                aria-label={voiceMode ? t('stopVoice') : t('startVoice')}
                title={t('voice')}
              >
                {voiceMode ? t('stopVoice') : t('startVoice')}
              </Button>

              <Button
                variant="ghost"
                onClick={() => setTtsMuted(m => !m)}
                aria-pressed={ttsMuted}
                aria-label={ttsMuted ? t('speakOut') : t('muted')}
                title={ttsMuted ? t('speakOut') : t('muted')}
              >
                {ttsMuted ? t('speakOut') : t('muted')}
              </Button>

              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!voiceSupported) return
                    if (listening) stopMic(false) // auto-send final transcript
                    else startMic()
                  }}
                  aria-label={listening ? t('stop') : t('mic')}
                  title={listening ? t('stop') : t('mic')}
                  disabled={!voiceSupported || sending || speaking}
                >
                  {listening ? t('stop') : t('mic')}
                </Button>

                <Button onClick={send} disabled={!canSend} aria-label={t('send')}>
                  {sending ? '…' : t('send')}
                </Button>
              </div>
            </div>

            {voiceMode && !ttsMuted ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="text-xs text-slate-600 min-w-[70px]">Speaker</div>
                {ttsVoiceOptions.length > 0 ? (
                  <Select
                    value={ttsVoiceURI}
                    onChange={(e) => {
                      const v = e.target.value
                      setTtsVoiceURI(v)
                      try { localStorage.setItem(`crea3_tts_voice_uri:${srLangCode}`, v) } catch {}
                    }}
                    aria-label="Speaker voice"
                  >
                    <option value="">Auto (best available)</option>
                    {ttsVoiceOptions.map(v => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="text-xs text-slate-600">
                    No {srLangCode} voice found. Installing a system voice can improve pronunciation.
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-2 flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chatPlaceholder')}
                aria-label={t('chatPlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (canSend) send()
                  }
                }}
              />
            </div>

            {dictationPreview ? (
              <div className="mt-2 text-xs text-slate-600" aria-live="polite">
                Dictation: <span className="font-medium">{dictationPreview}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* History drawer */}
      <div
        className={
          drawerOpen
            ? 'fixed inset-0 z-50'
            : 'pointer-events-none fixed inset-0 z-50'
        }
        aria-hidden={!drawerOpen}
      >
        <div
          className={drawerOpen ? 'absolute inset-0 bg-black/30' : 'absolute inset-0 bg-black/0'}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('history')}
          className={
            'absolute right-0 top-0 h-full w-[340px] max-w-[92vw] bg-white shadow-2xl border-l border-slate-200 ' +
            (drawerOpen ? 'translate-x-0' : 'translate-x-full') +
            ' transition-transform duration-200'
          }
        >
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="font-semibold">{t('history')}</div>
            <Button variant="ghost" onClick={() => setDrawerOpen(false)} aria-label={t('close')}>
              ✕
            </Button>
          </div>

          <div className="p-3 space-y-2 overflow-y-auto h-[calc(100%-64px)]">
            <Button className="w-full" onClick={createNewChat} aria-label={t('newChat')}>
              + {t('newChat')}
            </Button>

            {state?.chats
              ?.slice()
              .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
              .map((c) => {
                const last = c.messages?.[c.messages.length - 1]?.text || ''
                const active = c.id === state.activeChatId
                return (
                  <div
                    key={c.id}
                    className={
                      'rounded-2xl border p-3 cursor-pointer flex items-start gap-2 ' +
                      (active ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50')
                    }
                    onClick={() => setActiveChat(c.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setActiveChat(c.id)
                    }}
                  >
                    <div className={'mt-1 h-2.5 w-2.5 rounded-full ' + (active ? 'bg-blue-600' : 'bg-slate-300')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{c.title || 'Chat'}</div>
                      <div className="text-xs text-slate-600 truncate mt-0.5">{last}</div>
                      <div className="text-[11px] text-slate-500 mt-1">Updated {fmtTime(c.updatedAt)}</div>
                    </div>
                    <button
                      className="text-rose-600 hover:text-rose-700 text-sm px-2 py-1 rounded-lg hover:bg-rose-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteChat(c.id)
                      }}
                      aria-label={t('delete')}
                      title={t('delete')}
                    >
                      🗑
                    </button>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
    </Card>
  )
}
