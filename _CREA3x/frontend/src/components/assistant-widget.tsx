import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box, Paper, Stack, Typography, IconButton, TextField, Fab, Tooltip, Tabs, Tab, Avatar,
} from '@mui/material'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import { useLocation, matchPath } from 'react-router-dom'
import { api } from '../api/client'
import { useI18n } from '../i18n'

type TabId = 'workflow' | 'legal'
type Msg = { role: 'user' | 'bot'; text: string }

/**
 * Unified floating AI assistant for the authenticated app.
 *
 * A single robot-avatar FAB (bottom-right, on every logged-in page). Inside, a
 * tab switches between:
 *   - "Workflow" — helps the user operate the platform; when the current route
 *     is a dispute, the request is grounded on that dispute's live data
 *     (POST /api/assistant/disputes/{id}), otherwise the general FAQ
 *     (POST /api/assistant).
 *   - "Legal AI" — general legal Q&A. Wired to POST /api/assistant/legal in
 *     Step 3; until then it replies with a short "coming soon" note.
 *
 * Voice (record → transcribe → speak) is added in Steps 4–5.
 */
export default function AssistantWidget() {
  const { t, lang } = useI18n()
  const loc = useLocation()

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('workflow')
  const [wfMsgs, setWfMsgs] = useState<Msg[]>([{ role: 'bot', text: t('aiWorkflowWelcome') }])
  const [lgMsgs, setLgMsgs] = useState<Msg[]>([{ role: 'bot', text: t('aiLegalWelcome') }])
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

  const msgs = tab === 'workflow' ? wfMsgs : lgMsgs

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [wfMsgs, lgMsgs, open, tab])

  function historyPayload(list: Msg[]) {
    // Last few turns, excluding the very first canned greeting.
    return list.slice(1).slice(-8).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))
  }

  async function ask(question: string) {
    const q = question.trim()
    if (!q || sending) return
    setInput('')

    const activeTab = tab
    const list = activeTab === 'workflow' ? wfMsgs : lgMsgs
    const setList = activeTab === 'workflow' ? setWfMsgs : setLgMsgs

    setList((m) => [...m, { role: 'user', text: q }])
    setSending(true)
    try {
      if (activeTab === 'legal') {
        // Placeholder until Step 3 wires POST /api/assistant/legal.
        setList((m) => [...m, { role: 'bot', text: t('aiLegalComingSoon') }])
      } else {
        const path = disputeId ? `/api/assistant/disputes/${disputeId}` : '/api/assistant'
        const data = await api(path, {
          method: 'POST',
          body: { question: q, history: historyPayload(list), lang },
        })
        setList((m) => [...m, { role: 'bot', text: String(data?.answer ?? '') || t('aiWidgetUnavailable') }])
      }
    } catch (e: any) {
      setList((m) => [...m, { role: 'bot', text: e?.message || t('aiWidgetUnavailable') }])
    } finally {
      setSending(false)
    }
  }

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
          sx={{
            mb: 1.5, width: 'min(94vw, 24rem)', borderRadius: 3, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <Stack
            direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}
            sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
          >
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <SmartToyOutlinedIcon fontSize="small" />
              </Avatar>
              <Typography sx={{ fontWeight: 600 }} noWrap>{t('aiWidgetTitle')}</Typography>
            </Stack>
            <IconButton size="small" onClick={() => setOpen(false)} aria-label={t('aiWidgetClose')}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          {/* Tabs */}
          <Tabs
            value={tab}
            onChange={(_e, v) => setTab(v)}
            variant="fullWidth"
            sx={{ minHeight: 40, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 40, textTransform: 'none' } }}
          >
            <Tab value="workflow" label={t('aiTabWorkflow')} />
            <Tab value="legal" label={t('aiTabLegal')} />
          </Tabs>

          {/* Messages */}
          <Box
            ref={scrollRef}
            sx={{ height: 300, overflowY: 'auto', p: 1.5, bgcolor: 'background.default' }}
            role="log" aria-live="polite"
          >
            <Stack spacing={1}>
              {msgs.map((m, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <Paper
                    variant={m.role === 'user' ? 'elevation' : 'outlined'}
                    elevation={m.role === 'user' ? 2 : 0}
                    sx={{
                      maxWidth: '85%', px: 1.5, py: 1, borderRadius: 2,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                      color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    <Typography variant="body2">{m.text}</Typography>
                  </Paper>
                </Box>
              ))}
              {sending ? (
                <Typography variant="caption" color="text.secondary">{t('aiWidgetSending')}</Typography>
              ) : null}
            </Stack>
          </Box>

          {/* Legal disclaimer */}
          {tab === 'legal' ? (
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

      <Tooltip title={t('aiWidgetOpen')} placement="left">
        <Fab color="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t('aiWidgetOpen')}>
          <SmartToyOutlinedIcon />
        </Fab>
      </Tooltip>
    </Box>
  )
}
