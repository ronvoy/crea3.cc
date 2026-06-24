import React, { useEffect, useRef, useState } from 'react'
import {
  Box,
  Paper,
  IconButton,
  Typography,
  TextField,
  Fab,
  Stack,
  MenuItem,
  Select,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import { api } from '../api/client'

type Citation = { n: number; source_doc: string; hierarchy_path: string; doc_type: string }
type Msg = { role: 'user' | 'assistant'; content: string; citations?: Citation[]; generator?: string }

// Legal RAG chat bubble for authenticated users. Routes questions to
// /api/rag/query (retrieval + generation) with a selectable scope.
export default function RagChat() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'auto' | 'statutes' | 'cases' | 'general'>('auto')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        "Hi — I'm the CREA3 legal assistant. Ask about your indexed statutes, ongoing cases, or general legal/process questions. I cite sources and this is informational, not legal advice.",
    },
  ])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  async function send() {
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: q }])
    setBusy(true)
    try {
      if (mode === 'general') {
        const res = await api('/api/rag/general', { method: 'POST', body: { query: q } })
        setMessages((m) => [...m, { role: 'assistant', content: res.answer, generator: res.generator }])
      } else {
        const res = await api('/api/rag/query', { method: 'POST', body: { query: q, mode, generate: true } })
        setMessages((m) => [...m, { role: 'assistant', content: res.answer, citations: res.citations, generator: res.generator }])
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry, something went wrong: ${e?.message ?? 'request failed'}` }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Tooltip title="Legal assistant" placement="left">
        <Fab
          color="primary"
          onClick={() => setOpen(true)}
          aria-label="Open legal assistant"
          sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: (t) => t.zIndex.drawer + 2 }}
        >
          <ChatBubbleOutlineIcon />
        </Fab>
      </Tooltip>
    )
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: (t) => t.zIndex.drawer + 2,
        width: { xs: 'calc(100vw - 32px)', sm: 380 },
        height: 540,
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      {/* header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <GavelOutlinedIcon fontSize="small" color="primary" />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Legal assistant</Typography>
        </Box>
        <Select
          size="small"
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          variant="standard"
          sx={{ fontSize: 13 }}
        >
          <MenuItem value="auto">Auto</MenuItem>
          <MenuItem value="statutes">Statutes</MenuItem>
          <MenuItem value="cases">Cases</MenuItem>
          <MenuItem value="general">General</MenuItem>
        </Select>
        <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* messages */}
      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 1.5, bgcolor: 'background.default' }}>
        <Stack spacing={1.5}>
          {messages.map((m, i) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <Paper
                variant={m.role === 'user' ? 'elevation' : 'outlined'}
                elevation={m.role === 'user' ? 2 : 0}
                sx={{
                  p: 1.25,
                  maxWidth: '85%',
                  borderRadius: 2,
                  bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                  color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.content}</Typography>
                {m.citations?.length ? (
                  <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    {m.citations.map((c) => (
                      <Typography key={c.n} variant="caption" color="text.secondary" component="div">
                        [{c.n}] {c.source_doc}{c.hierarchy_path ? ` · ${c.hierarchy_path}` : ''}{c.doc_type ? ` (${c.doc_type})` : ''}
                      </Typography>
                    ))}
                  </Box>
                ) : null}
              </Paper>
            </Box>
          ))}
          {busy ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
              <CircularProgress size={14} /> <Typography variant="caption">Searching sources…</Typography>
            </Box>
          ) : null}
        </Stack>
      </Box>

      {/* input */}
      <Stack direction="row" spacing={1} sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Ask a legal question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          multiline
          maxRows={3}
        />
        <IconButton color="primary" onClick={send} disabled={busy || !input.trim()} aria-label="Send">
          <SendIcon />
        </IconButton>
      </Stack>
    </Paper>
  )
}
