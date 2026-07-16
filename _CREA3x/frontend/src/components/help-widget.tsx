import React, { useEffect, useRef, useState } from 'react'
import {
  Box, Paper, Stack, Typography, IconButton, TextField, Button, Fab, Chip, Tooltip,
} from '@mui/material'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import { api } from '../api/client'
import { useI18n, type I18nKey } from '../i18n'

type Msg = { role: 'user' | 'bot'; text: string }

/**
 * Floating help chatbot for anonymous visitors (landing + auth pages).
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
    <Box sx={{ position: 'fixed', bottom: 20, right: 20, zIndex: (th) => th.zIndex.snackbar, '@media print': { display: 'none' } }}>
      {open ? (
        <Paper
          elevation={8}
          sx={{
            mb: 1.5, width: 'min(92vw, 22rem)', borderRadius: 3, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <Stack
            direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5}
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>{t('helpWidgetTitle')}</Typography>
              <Typography variant="caption" color="text.secondary">{t('helpWidgetSubtitle')}</Typography>
            </Box>
            <IconButton size="small" onClick={() => setOpen(false)} aria-label={t('helpWidgetClose')}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          {/* Messages */}
          <Box ref={scrollRef} sx={{ height: 288, overflowY: 'auto', p: 1.5, bgcolor: 'background.default' }} role="log" aria-live="polite">
            <Stack spacing={1}>
              {msgs.map((m, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <Paper
                    variant={m.role === 'user' ? 'elevation' : 'outlined'}
                    elevation={m.role === 'user' ? 2 : 0}
                    sx={{
                      maxWidth: '85%', px: 1.5, py: 1, borderRadius: 2, whiteSpace: 'pre-line',
                      bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                      color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    <Typography variant="body2">{m.text}</Typography>
                  </Paper>
                </Box>
              ))}
              {sending ? <Typography variant="caption" color="text.secondary">{t('helpWidgetSending')}</Typography> : null}
              {msgs.length <= 1 ? (
                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                  {suggestions.map((k) => (
                    <Chip key={k} label={t(k)} size="small" variant="outlined" onClick={() => ask(t(k))} clickable />
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </Box>

          {/* Input */}
          <Stack
            component="form" direction="row" spacing={1} alignItems="center"
            sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}
            onSubmit={(e) => { e.preventDefault(); ask(input) }}
          >
            <TextField
              size="small" fullWidth value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={t('helpWidgetPlaceholder')} aria-label={t('helpWidgetPlaceholder')}
            />
            <IconButton type="submit" color="primary" disabled={sending || !input.trim()} aria-label={t('helpWidgetSend')}>
              <SendIcon />
            </IconButton>
          </Stack>
        </Paper>
      ) : null}

      <Tooltip title={t('helpWidgetTitle')} placement="left">
        <Fab variant="extended" color="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChatBubbleOutlineIcon sx={{ mr: 1 }} />
          {t('helpWidgetOpen')}
        </Fab>
      </Tooltip>
    </Box>
  )
}
