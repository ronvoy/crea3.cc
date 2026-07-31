import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box, Paper, Stack, Typography, IconButton, TextField, Fab, Tooltip, Avatar, Chip,
} from '@mui/material'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLocation, matchPath } from 'react-router-dom'
import { api } from '../api/client'
import { useI18n, type I18nKey } from '../i18n'

type Intent = 'workflow' | 'past_cases' | 'legal_statutes'
type Msg = { role: 'user' | 'bot'; text: string; intent?: Intent; sources?: string[] }

const INTENT_LABEL: Record<Intent, I18nKey> = {
  workflow: 'aiIntentWorkflow',
  past_cases: 'aiIntentPastCases',
  legal_statutes: 'aiIntentLegalStatutes',
}

/** Render assistant text as Markdown (headings, lists, code, links, GFM tables). */
function Markdown({ text }: { text: string }) {
  return (
    <Box
      sx={{
        fontSize: '0.875rem', lineHeight: 1.5,
        '& > :first-of-type': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& p': { my: 0.75 },
        '& ul, & ol': { pl: 2.5, my: 0.75 },
        '& li': { mb: 0.25 },
        '& h1, & h2, & h3, & h4': { fontSize: '1rem', fontWeight: 700, mt: 1, mb: 0.5 },
        '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: '0.85em', fontFamily: 'monospace' },
        '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, overflowX: 'auto', my: 0.75 },
        '& pre code': { bgcolor: 'transparent', p: 0 },
        '& a': { color: 'primary.main' },
        '& blockquote': { borderLeft: 3, borderColor: 'divider', pl: 1, my: 0.75, color: 'text.secondary' },
        '& table': { borderCollapse: 'collapse', display: 'block', overflowX: 'auto', my: 0.75, maxWidth: '100%' },
        '& th, & td': { border: 1, borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left', fontSize: '0.85em' },
        '& th': { bgcolor: 'action.hover', fontWeight: 700 },
        '& img': { maxWidth: '100%' },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a target="_blank" rel="noreferrer" {...props} /> }}
      >
        {text}
      </ReactMarkdown>
    </Box>
  )
}

/**
 * Unified floating AI assistant for the authenticated app.
 *
 * A single robot-avatar FAB (bottom-right, every logged-in page). One chat: each
 * question is classified server-side into an intent (workflow / past_cases /
 * legal_statutes) and routed automatically — no tabs, no manual selector. A
 * top-left button expands the panel to full screen. Requests go to
 * POST /api/assistant/ask (primary LLM → Mistral). Answers render as Markdown.
 *
 * Voice (record → transcribe → speak) is added in Steps 4–5.
 */
export default function AssistantWidget() {
  const { t, lang } = useI18n()
  const loc = useLocation()

  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([{ role: 'bot', text: t('aiWelcome') }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Ground Workflow answers on the dispute the user is currently viewing.
  const disputeId = useMemo(() => {
    const m = matchPath('/app/disputes/:id', loc.pathname)
    const raw = m?.params?.id
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? n : null
  }, [loc.pathname])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, open, full])

  // Closing always returns to the docked FAB (never leaves the panel expanded
  // with the launcher hidden).
  function closePanel() {
    setOpen(false)
    setFull(false)
  }

  function historyPayload(list: Msg[]) {
    return list.slice(1).slice(-8).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))
  }

  async function ask(question: string) {
    const q = question.trim()
    if (!q || sending) return
    setInput('')
    const list = msgs
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setSending(true)
    try {
      const data = await api('/api/assistant/ask', {
        method: 'POST',
        body: {
          question: q,
          history: historyPayload(list),
          lang,
          dispute_id: disputeId,
          mode: 'auto',
        },
      })
      setMsgs((m) => [
        ...m,
        {
          role: 'bot',
          text: String(data?.answer ?? '') || t('aiWidgetUnavailable'),
          intent: data?.intent as Intent,
          sources: Array.isArray(data?.sources) ? data.sources : undefined,
        },
      ])
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'bot', text: e?.message || t('aiWidgetUnavailable') }])
    } finally {
      setSending(false)
    }
  }

  // Panel geometry: docked card vs. full-screen overlay.
  const panelSx = full
    ? { position: 'fixed' as const, inset: 0, width: '100vw', height: '100dvh', borderRadius: 0, mb: 0 }
    : { mb: 1.5, width: 'min(94vw, 24rem)', height: 'auto', borderRadius: 3 }

  const showLegalDisclaimer = msgs.some((m) => m.intent === 'legal_statutes' || m.intent === 'past_cases')

  return (
    <Box
      sx={{
        position: 'fixed', bottom: 20, right: 20,
        zIndex: (th) => th.zIndex.snackbar,
        '@media print': { display: 'none' },
      }}
    >
      {open ? (
        <Paper
          elevation={8}
          sx={{ ...panelSx, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {/* Header: [expand]  avatar+title  [close] */}
          <Stack
            direction="row" alignItems="center" justifyContent="space-between" spacing={1}
            sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
          >
            <Tooltip title={full ? t('aiCollapse') : t('aiExpand')} placement="right">
              <IconButton size="small" onClick={() => setFull((v) => !v)} aria-label={full ? t('aiCollapse') : t('aiExpand')}>
                {full ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0, flex: 1, justifyContent: 'center' }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 30, height: 30 }}>
                <SmartToyOutlinedIcon fontSize="small" />
              </Avatar>
              <Typography sx={{ fontWeight: 600 }} noWrap>{t('aiWidgetTitle')}</Typography>
            </Stack>
            <IconButton size="small" onClick={closePanel} aria-label={t('aiWidgetClose')}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          {/* Messages */}
          <Box
            ref={scrollRef}
            sx={{ flex: full ? 1 : 'unset', height: full ? 'auto' : 300, overflowY: 'auto', p: 1.5, bgcolor: 'background.default' }}
            role="log" aria-live="polite"
          >
            <Stack spacing={1}>
              {msgs.map((m, i) => (
                <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.role === 'bot' && m.intent ? (
                    <Chip
                      size="small" variant="outlined" label={t(INTENT_LABEL[m.intent])}
                      sx={{ mb: 0.5, height: 20, fontSize: 11 }}
                    />
                  ) : null}
                  <Paper
                    variant={m.role === 'user' ? 'elevation' : 'outlined'}
                    elevation={m.role === 'user' ? 2 : 0}
                    sx={{
                      maxWidth: full ? '46rem' : '85%', px: 1.5, py: 1, borderRadius: 2,
                      wordBreak: 'break-word',
                      bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                      color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    {m.role === 'bot'
                      ? <Markdown text={m.text} />
                      : <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Typography>}
                  </Paper>
                  {m.role === 'bot' && m.sources && m.sources.length ? (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, maxWidth: full ? '46rem' : '85%' }}>
                      {t('aiSources')}: {m.sources.join(', ')}
                    </Typography>
                  ) : null}
                </Box>
              ))}
              {sending ? (
                <Typography variant="caption" color="text.secondary">{t('aiWidgetSending')}</Typography>
              ) : null}
            </Stack>
          </Box>

          {showLegalDisclaimer ? (
            <Typography
              variant="caption" color="text.secondary"
              sx={{ px: 1.5, py: 0.75, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
            >
              {t('aiWidgetDisclaimer')}
            </Typography>
          ) : null}

          {/* Input */}
          <Stack
            component="form" direction="row" spacing={1} alignItems="center"
            sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}
            onSubmit={(e) => { e.preventDefault(); ask(input) }}
          >
            <TextField
              size="small" fullWidth value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={t('aiWidgetPlaceholder')} aria-label={t('aiWidgetPlaceholder')}
            />
            <IconButton type="submit" color="primary" disabled={sending || !input.trim()} aria-label={t('aiWidgetSend')}>
              <SendIcon />
            </IconButton>
          </Stack>
        </Paper>
      ) : null}

      {!open ? (
        <Tooltip title={t('aiWidgetOpen')} placement="left">
          <Fab color="primary" onClick={() => setOpen(true)} aria-expanded={open} aria-label={t('aiWidgetOpen')}>
            <SmartToyOutlinedIcon />
          </Fab>
        </Tooltip>
      ) : null}
    </Box>
  )
}
