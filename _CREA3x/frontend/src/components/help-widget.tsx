import React, { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box, Paper, Stack, Typography, IconButton, TextField, Button, Fab, Chip, Tooltip, Link as MuiLink,
} from '@mui/material'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined'
import VolumeOffOutlinedIcon from '@mui/icons-material/VolumeOffOutlined'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api/client'
import { useI18n, type I18nKey } from '../i18n'

type Msg = { role: 'user' | 'bot'; text: string }

// Persist the public chat across route changes (landing, /workflow, /partners,
// /scope, /help, /login, /register …) for the tab session — cleared when the
// page/tab is closed. The widget isn't rendered inside /app, so no conflict.
const CHAT_KEY = 'crea3-helpchat'
const OPEN_KEY = 'crea3-helpchat-open'
function loadMsgs(): Msg[] | null {
  try { const s = sessionStorage.getItem(CHAT_KEY); const p = s ? JSON.parse(s) : null; return Array.isArray(p) && p.length ? p : null } catch { return null }
}

// Render bot text as Markdown (bold, lists, tables, links). Internal "/…" links
// navigate within the SPA (relative → work on any host); http(s) open a new tab.
function Markdown({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  return (
    <Box
      sx={{
        fontSize: '0.875rem', lineHeight: 1.5,
        '& > :first-of-type': { mt: 0 }, '& > :last-child': { mb: 0 },
        '& p': { my: 0.5 }, '& ul, & ol': { pl: 2.5, my: 0.5 }, '& li': { mb: 0.25 },
        '& h1, & h2, & h3, & h4': { fontSize: '1rem', fontWeight: 700, mt: 1, mb: 0.5 },
        '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: '0.85em', fontFamily: 'monospace' },
        '& a': { color: 'primary.main', fontWeight: 600 },
        '& table': { borderCollapse: 'collapse', display: 'block', overflowX: 'auto', my: 0.75, maxWidth: '100%' },
        '& th, & td': { border: 1, borderColor: 'divider', px: 1, py: 0.5, fontSize: '0.85em' },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href && href.startsWith('/')) return <MuiLink component={RouterLink} to={href} onClick={onNavigate}>{children}</MuiLink>
            if (href && (href.startsWith('mailto:') || href.startsWith('tel:'))) return <MuiLink href={href}>{children}</MuiLink>
            return <MuiLink href={href} target="_blank" rel="noreferrer">{children}</MuiLink>
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </Box>
  )
}

// UI language → BCP-47 tag for the browser Web Speech API (STT + TTS).
// Browser-only for this PUBLIC widget: no auth, no server cost. A future
// server path (public /voice/* endpoints) can slot in behind these helpers.
const SPEECH_LANG: Record<string, string> = {
  en: 'en-US', it: 'it-IT', sl: 'sl-SI', et: 'et-EE', be: 'fr-BE', nl: 'nl-BE', lt: 'lt-LT', hr: 'hr-HR',
}
const speechSupported = typeof window !== 'undefined' &&
  !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

/**
 * Floating help chatbot for anonymous visitors (landing + auth pages).
 * Uses the public assistant endpoint (no auth); degrades gracefully if offline.
 */
export default function HelpWidget() {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState<boolean>(() => { try { return sessionStorage.getItem(OPEN_KEY) === '1' } catch { return false } })
  const [full, setFull] = useState(false)
  const [autoplay, setAutoplay] = useState(true)
  const [msgs, setMsgs] = useState<Msg[]>(() => loadMsgs() || [{ role: 'bot', text: t('helpWidgetWelcome') }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null)
  const [voiceErr, setVoiceErr] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const recognizedRef = useRef<string>('')

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, open])

  // Persist chat + open-state for the tab session so it survives navigation.
  useEffect(() => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs)) } catch {} }, [msgs])
  useEffect(() => { try { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0') } catch {} }, [open])

  // Keep the opening greeting in sync with the UI language while the chat is
  // still pristine (just the welcome) — never overwrite an in-progress chat.
  useEffect(() => {
    setMsgs((prev) => (prev.length === 1 && prev[0].role === 'bot' ? [{ role: 'bot', text: t('helpWidgetWelcome') }] : prev))
  }, [lang, t])

  async function ask(question: string, spoken = false) {
    const q = question.trim()
    if (!q || sending) return
    setInput('')
    // ask() appends exactly the user msg then the bot msg, so the bot reply's
    // index is deterministic: current length (+1 for the user msg we add now).
    const botIdx = msgs.length + 1
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
      const answer = String(data?.answer ?? '') || t('helpWidgetOffline')
      setMsgs((m) => [...m, { role: 'bot', text: answer }])
      if (spoken && autoplay) speak(answer, botIdx) // voice-in → speak back unless muted
    } catch {
      setMsgs((m) => [...m, { role: 'bot', text: t('helpWidgetOffline') }])
    } finally {
      setSending(false)
    }
  }

  // ── Voice: browser Web Speech API (STT in, TTS out) ────────────────────────
  function startListening() {
    setVoiceErr(null)
    if (!speechSupported) { setVoiceErr(t('aiVoiceUnsupported')); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recog = new SR()
    recog.lang = SPEECH_LANG[lang] || 'en-US'
    recog.interimResults = true
    recog.continuous = false
    recognizedRef.current = ''
    recog.onresult = (ev: any) => {
      let finalTxt = ''
      for (let i = 0; i < ev.results.length; i++) if (ev.results[i].isFinal) finalTxt += ev.results[i][0].transcript + ' '
      if (finalTxt.trim()) recognizedRef.current = finalTxt.trim()
      setInput(recognizedRef.current || ev.results[0]?.[0]?.transcript || '')
    }
    recog.onerror = (e: any) => {
      const code = e?.error
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') setVoiceErr(t('aiMicDenied'))
      else if (code === 'no-speech') setVoiceErr(t('aiVoiceNoSpeech'))
      else if (code === 'network') setVoiceErr(t('aiBraveHint'))
      else setVoiceErr(t('aiVoiceUnsupported'))
    }
    recog.onend = () => {
      setRecording(false)
      recognitionRef.current = null
      const said = recognizedRef.current.trim()
      if (said) ask(said, true) // voice in → speak the reply back
    }
    recognitionRef.current = recog
    try { recog.start(); setRecording(true) } catch { setVoiceErr(t('aiVoiceUnsupported')) }
  }
  function stopListening() {
    try { recognitionRef.current?.stop() } catch {}
    setRecording(false)
  }
  function toggleRecording() { recording ? stopListening() : startListening() }

  function speak(text: string, idx: number) {
    try { window.speechSynthesis.cancel() } catch {}
    if (speakingIdx === idx) { setSpeakingIdx(null); return } // toggle off
    const plain = (text || '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/[*_`#>|]/g, '').trim()
    if (!plain) return
    try {
      const u = new SpeechSynthesisUtterance(plain)
      u.lang = SPEECH_LANG[lang] || 'en-US'
      u.onend = () => setSpeakingIdx((p) => (p === idx ? null : p))
      setSpeakingIdx(idx)
      window.speechSynthesis.speak(u)
    } catch { setSpeakingIdx(null) }
  }

  // Stop any speech + recognition when the panel closes or unmounts.
  useEffect(() => {
    if (open) return
    try { window.speechSynthesis?.cancel() } catch {}
    try { recognitionRef.current?.stop() } catch {}
    setSpeakingIdx(null); setRecording(false)
  }, [open])

  const suggestions: I18nKey[] = ['helpWidgetQ1', 'helpWidgetQ2', 'helpWidgetQ3']

  // Docked card vs. full-screen overlay (responsive to the viewport).
  const panelSx = full
    ? { position: 'fixed' as const, inset: 0, width: '100vw', height: '100dvh', m: 0, borderRadius: 0, maxWidth: 'none', zIndex: (th: any) => th.zIndex.modal, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }
    : { mb: 1.5, width: 'min(92vw, 22rem)', borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' as const }

  return (
    <Box sx={{ position: 'fixed', bottom: 20, right: 20, zIndex: (th) => th.zIndex.snackbar, '@media print': { display: 'none' } }}>
      {open ? (
        <Paper elevation={8} sx={panelSx}>
          {/* Header */}
          <Stack
            direction="row" alignItems="center" justifyContent="space-between" spacing={1}
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>{t('helpWidgetTitle')}</Typography>
              <Typography variant="caption" color="text.secondary">{t('helpWidgetSubtitle')}</Typography>
            </Box>
            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
              <Tooltip title={autoplay ? t('aiAutoplayOn') : t('aiAutoplayOff')}>
                <IconButton
                  size="small"
                  onClick={() => { if (autoplay) { try { window.speechSynthesis?.cancel() } catch {}; setSpeakingIdx(null) } setAutoplay((v) => !v) }}
                  aria-label={autoplay ? t('aiAutoplayOn') : t('aiAutoplayOff')}
                  color={autoplay ? 'primary' : 'default'}
                >
                  {autoplay ? <VolumeUpOutlinedIcon fontSize="small" /> : <VolumeOffOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title={full ? t('aiCollapse') : t('aiExpand')}>
                <IconButton size="small" onClick={() => setFull((v) => !v)} aria-label={full ? t('aiCollapse') : t('aiExpand')}>
                  {full ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={() => { setOpen(false); setFull(false) }} aria-label={t('helpWidgetClose')}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>

          {/* Messages */}
          <Box ref={scrollRef} sx={{ flex: full ? 1 : 'unset', height: full ? 'auto' : 288, overflowY: 'auto', p: 1.5, bgcolor: 'background.default' }} role="log" aria-live="polite">
            <Stack spacing={1}>
              {msgs.map((m, i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <Paper
                    variant={m.role === 'user' ? 'elevation' : 'outlined'}
                    elevation={m.role === 'user' ? 2 : 0}
                    sx={{
                      maxWidth: m.role === 'bot' && full ? 'min(100%, 52rem)' : '85%',
                      px: 1.5, py: 1, borderRadius: 2, whiteSpace: m.role === 'user' ? 'pre-line' : 'normal',
                      bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                      color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    <Stack direction="row" alignItems="flex-start" spacing={0.5}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {m.role === 'bot'
                          ? <Markdown text={m.text} onNavigate={() => { setOpen(false); setFull(false) }} />
                          : <Typography variant="body2">{m.text}</Typography>}
                      </Box>
                      {m.role === 'bot' ? (
                        <Tooltip title={t('aiSpeak')}>
                          <IconButton
                            size="small" onClick={() => speak(m.text, i)} aria-label={t('aiSpeak')}
                            sx={{ mt: -0.25, mr: -0.5, color: speakingIdx === i ? 'primary.main' : 'text.disabled' }}
                          >
                            {speakingIdx === i ? <StopIcon sx={{ fontSize: 16 }} /> : <VolumeUpIcon sx={{ fontSize: 16 }} />}
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </Stack>
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

          {/* Voice error hint */}
          {voiceErr ? (
            <Typography variant="caption" color="error" sx={{ px: 1.5, pt: 1 }}>{voiceErr}</Typography>
          ) : null}

          {/* Input */}
          <Stack
            component="form" direction="row" spacing={1} alignItems="center"
            sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}
            onSubmit={(e) => { e.preventDefault(); ask(input) }}
          >
            {speechSupported ? (
              <Tooltip title={recording ? t('stopRecord') : t('mic')}>
                <IconButton
                  onClick={toggleRecording} aria-label={recording ? t('stopRecord') : t('mic')}
                  color={recording ? 'error' : 'default'}
                  sx={recording ? { animation: 'crea-pulse 1.2s ease-in-out infinite', '@keyframes crea-pulse': { '50%': { opacity: 0.4 } } } : undefined}
                >
                  {recording ? <StopIcon /> : <MicIcon />}
                </IconButton>
              </Tooltip>
            ) : null}
            <TextField
              size="small" fullWidth value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={recording ? t('stopRecord') : t('helpWidgetPlaceholder')} aria-label={t('helpWidgetPlaceholder')}
            />
            <IconButton type="submit" color="primary" disabled={sending || !input.trim()} aria-label={t('helpWidgetSend')}>
              <SendIcon />
            </IconButton>
          </Stack>
        </Paper>
      ) : null}

      <Tooltip title={t('helpWidgetTitle')} placement="left">
        <Fab color="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t('helpWidgetOpen')}>
          <ChatBubbleOutlineIcon />
        </Fab>
      </Tooltip>
    </Box>
  )
}
