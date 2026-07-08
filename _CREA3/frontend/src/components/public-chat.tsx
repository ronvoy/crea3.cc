import React, { useEffect, useRef, useState } from 'react'
import {
  Box,
  Paper,
  IconButton,
  Typography,
  TextField,
  Fab,
  Stack,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import { api } from '../api/client'

type Msg = { role: 'user' | 'assistant'; content: string }

// Public legal-Q&A chat widget for the landing page. Calls the no-auth
// /api/rag/public-chat endpoint (OpenRouter-backed general legal assistant).
export default function PublicChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm the CREA3 legal assistant. Ask me general questions about dispute resolution, mediation, or how the platform works. This is general information, not legal advice.",
    },
  ])
  const history = useRef<Msg[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  async function send() {
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: q }])
    history.current.push({ role: 'user', content: q })
    setBusy(true)
    try {
      const res = await api('/api/rag/public-chat', {
        method: 'POST',
        body: { query: q, history: history.current.slice(-6) },
        auth: false,
      })
      setMessages((m) => [...m, { role: 'assistant', content: res.answer }])
      history.current.push({ role: 'assistant', content: res.answer })
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry, something went wrong: ${e?.message ?? 'request failed'}` }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Tooltip title="Ask the legal assistant" placement="left">
        <Fab color="primary" onClick={() => setOpen(true)} aria-label="Open legal assistant"
          sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: (t) => t.zIndex.drawer + 2 }}>
          <ChatBubbleOutlineIcon />
        </Fab>
      </Tooltip>
    )
  }

  return (
    <Paper elevation={8} sx={{
      position: 'fixed', bottom: 24, right: 24, zIndex: (t) => t.zIndex.drawer + 2,
      width: { xs: 'calc(100vw - 32px)', sm: 380 }, height: 520, maxHeight: 'calc(100vh - 48px)',
      display: 'flex', flexDirection: 'column', borderRadius: 3, overflow: 'hidden',
    }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <GavelOutlinedIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flexGrow: 1 }}>Legal assistant</Typography>
        <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </Stack>

      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 1.5, bgcolor: 'background.default' }}>
        <Stack spacing={1.5}>
          {messages.map((m, i) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <Paper variant={m.role === 'user' ? 'elevation' : 'outlined'} elevation={m.role === 'user' ? 2 : 0}
                sx={{ p: 1.25, maxWidth: '85%', borderRadius: 2,
                  bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                  color: m.role === 'user' ? 'primary.contrastText' : 'text.primary' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.content}</Typography>
              </Paper>
            </Box>
          ))}
          {busy ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
              <CircularProgress size={14} /> <Typography variant="caption">Thinking…</Typography>
            </Box>
          ) : null}
        </Stack>
      </Box>

      <Stack direction="row" spacing={1} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <TextField size="small" fullWidth placeholder="Ask a legal question…" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          multiline maxRows={3} />
        <IconButton color="primary" onClick={send} disabled={busy || !input.trim()} aria-label="Send"><SendIcon /></IconButton>
      </Stack>
    </Paper>
  )
}
