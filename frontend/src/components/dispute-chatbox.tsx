import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardHeader, Button, Input, Pill } from './ui'
import { useAuth } from '../store/auth'

const API_URL = 'https://crea3_chatbot.idealunina.work/chat'

type Sender = 'user' | 'bot'
type ChatMsg = { sender: Sender; text: string; ts: string }
type ChatThread = { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMsg[] }
type ChatState = { activeChatId: string; chats: ChatThread[] }

function uid() {
  return `c_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}
function nowIso() {
  return new Date().toISOString()
}
function fmtTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function safeTitle(text: string) {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return 'New chat'
  return t.slice(0, 44) + (t.length > 44 ? '…' : '')
}

export default function DisputeChatBox({ disputeId }: { disputeId: number }) {
  const { user } = useAuth()
  const storageKey = useMemo(() => {
    const who = user?.email || user?.username || 'anon'
    return `crea3_dispute_chat_state_v1:${who}:${disputeId}`
  }, [user?.email, user?.username, disputeId])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [state, setState] = useState<ChatState | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const isAuthed = !!user

  function defaultState(): ChatState {
    const id = uid()
    return {
      activeChatId: id,
      chats: [
        {
          id,
          title: 'New chat',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          messages: [
            {
              sender: 'bot',
              text: "Hi! I'm the dispute assistant. Start typing below to ask a question.",
              ts: nowIso(),
            },
          ],
        },
      ],
    }
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
    } catch {
      // ignore
    }
    const ds = defaultState()
    setState(ds)
    localStorage.setItem(storageKey, JSON.stringify(ds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, isAuthed])

  useEffect(() => {
    if (!state) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state, storageKey])

  const activeChat = useMemo(() => {
    if (!state) return null
    return state.chats.find(c => c.id === state.activeChatId) || state.chats[0] || null
  }, [state])

  useEffect(() => {
    if (!activeChat) return
    const el = scrollRef.current
    if (!el) return
    setTimeout(() => {
      el.scrollTop = el.scrollHeight
    }, 0)
  }, [activeChat?.messages.length])

  function setActiveChat(id: string) {
    if (!state) return
    setState({ ...state, activeChatId: id })
  }

  function addMessage(sender: Sender, text: string) {
    if (!state) return
    const chats = state.chats.map(c => {
      if (c.id !== state.activeChatId) return c
      const updated: ChatThread = {
        ...c,
        updatedAt: nowIso(),
        messages: [...c.messages, { sender, text, ts: nowIso() }],
      }
      if (updated.title === 'New chat' && sender === 'user') {
        updated.title = safeTitle(text)
      }
      return updated
    })
    setState({ ...state, chats })
  }

  function createNewChat() {
    if (!state) return
    const id = uid()
    const thread: ChatThread = {
      id,
      title: 'New chat',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [{ sender: 'bot', text: 'New chat started. What would you like to ask?', ts: nowIso() }],
    }
    setState({ activeChatId: id, chats: [thread, ...state.chats] })
    setDrawerOpen(true)
  }

  function deleteChat(id: string) {
    if (!state) return
    const target = state.chats.find(c => c.id === id)
    if (!target) return
    const ok = confirm(`Delete "${target.title || 'this chat'}"? This cannot be undone.`)
    if (!ok) return

    const remaining = state.chats.filter(c => c.id !== id)
    if (remaining.length === 0) {
      const ds = defaultState()
      setState(ds)
      return
    }
    const newActive = state.activeChatId === id ? remaining[0].id : state.activeChatId
    setState({ activeChatId: newActive, chats: remaining })
  }

  async function send() {
    if (!activeChat) return
    const q = input.trim()
    if (!q || sending) return

    setInput('')
    addMessage('user', q)
    setSending(true)

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      if (!res.ok) throw new Error('server_error')
      const data = await res.json()
      const answer = String(data?.answer ?? 'No response.')
      addMessage('bot', answer)
    } catch (e) {
      addMessage('bot', '⚠️ Could not connect to the chat server.')
      // eslint-disable-next-line no-console
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  if (!isAuthed) return null
  if (!state || !activeChat) return null

  const chatsSorted = [...state.chats].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader
        title="Dispute assistant chat"
        subtitle="Create multiple chats. History is stored locally in your browser."
        right={
          <div className="flex items-center gap-2">
            <Button onClick={createNewChat}>＋ New chat</Button>
            <Button variant="danger" onClick={() => deleteChat(state.activeChatId)}>
              🗑 Delete
            </Button>
            <Button variant="ghost" onClick={() => setDrawerOpen(v => !v)} title="History">
              ☰
            </Button>
          </div>
        }
      />

      <div className="relative">
        <div className="p-4 bg-gradient-to-b from-slate-50/80 to-white">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="font-semibold truncate">{activeChat.title}</div>
              <div className="text-xs text-slate-500 truncate">
                Dispute #{disputeId} • {user?.email || user?.username}
              </div>
            </div>
            <Pill>{sending ? 'Sending…' : 'Ready'}</Pill>
          </div>

          <div
            ref={scrollRef}
            className="h-[360px] overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/70 backdrop-blur p-4 space-y-3 shadow-sm"
          >
            {activeChat.messages.map((m, idx) => (
              <div key={idx} className={`max-w-[86%] ${m.sender === 'user' ? 'ml-auto' : ''}`}>
                <div
                  className={
                    m.sender === 'user'
                      ? 'rounded-2xl rounded-tr-md bg-gradient-to-br from-blue-600 to-blue-900 text-white px-4 py-3 shadow'
                      : 'rounded-2xl rounded-tl-md bg-white text-slate-900 px-4 py-3 border border-slate-200/70 shadow-sm whitespace-pre-wrap'
                  }
                >
                  {m.text}
                </div>
                <div className={`mt-1 text-[11px] text-slate-500 ${m.sender === 'user' ? 'text-right' : ''}`}>
                  {fmtTime(m.ts)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Type your message…"
            />
            <Button onClick={send} disabled={sending || !input.trim()}>
              Send
            </Button>
          </div>
        </div>

        <div
          className={`absolute top-0 right-0 h-full w-[340px] max-w-[92vw] bg-white/90 backdrop-blur border-l border-slate-200/70 shadow-2xl transition-transform duration-200 ${
            drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="h-14 px-4 border-b border-slate-200/70 flex items-center justify-between">
            <div className="text-xs font-extrabold tracking-wider text-slate-700 uppercase">Chats</div>
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              ×
            </Button>
          </div>
          <div className="p-3 space-y-2 overflow-auto h-[calc(100%-56px)]">
            {chatsSorted.map(c => {
              const last = c.messages?.[c.messages.length - 1]?.text || 'No messages yet'
              const active = c.id === state.activeChatId
              return (
                <div
                  key={c.id}
                  className={`group rounded-2xl border px-3 py-3 cursor-pointer transition ${
                    active ? 'border-blue-300 bg-blue-50/70' : 'border-slate-200/70 bg-slate-50/60 hover:bg-white'
                  }`}
                  onClick={() => setActiveChat(c.id)}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-1 h-2.5 w-2.5 rounded-full ${active ? 'bg-blue-600' : 'bg-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{c.title || 'Chat'}</div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">{last}</div>
                      <div className="text-[11px] text-slate-400 mt-1">{fmtTime(c.updatedAt)}</div>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition text-red-600 hover:bg-red-50 rounded-lg px-2 py-1"
                      title="Delete chat"
                      onClick={e => {
                        e.stopPropagation()
                        deleteChat(c.id)
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}
