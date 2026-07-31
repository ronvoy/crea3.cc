import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box, Paper, Stack, Typography, IconButton, TextField, Fab, Tooltip, Avatar, Chip, Button,
} from '@mui/material'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import HistoryIcon from '@mui/icons-material/History'
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import MicNoneIcon from '@mui/icons-material/MicNone'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined'
import VolumeOffOutlinedIcon from '@mui/icons-material/VolumeOffOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLocation, matchPath } from 'react-router-dom'
import { api } from '../api/client'
import { useI18n, type I18nKey } from '../i18n'

type Intent = 'workflow' | 'past_cases' | 'legal_statutes'
type Msg = {
  role: 'user' | 'bot'; text: string; intent?: Intent; sources?: string[]; files?: string[]
  voice?: boolean; audioUrl?: string; msgId?: number; hasAudioIn?: boolean
}
type Attachment = { filename: string; text: string; chars: number; truncated: boolean }
type SessionRow = { id: number; title: string; updated_at: string; message_count: number }

const WELCOME_KEY = 'aiWelcome' as const

// UI language code → BCP-47 tag for browser SpeechRecognition / STT hint.
const SPEECH_LANG: Record<string, string> = {
  en: 'en-US', it: 'it-IT', sl: 'sl-SI', et: 'et-EE', be: 'fr-BE', lt: 'lt-LT', hr: 'hr-HR',
}
// UI language code → ISO-639-1 for server Whisper (`be` is French-Belgium → fr).
const STT_LANG: Record<string, string> = {
  en: 'en', it: 'it', sl: 'sl', et: 'et', be: 'fr', lt: 'lt', hr: 'hr',
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onloadend = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

const ATTACH_ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.txt,.md,.markdown,.json,.csv,.log,.tsv'

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
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attaching, setAttaching] = useState(false)
  const [attachErr, setAttachErr] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [sttAvailable, setSttAvailable] = useState(false)
  const [ttsAvailable, setTtsAvailable] = useState(false)
  const [autoplay, setAutoplay] = useState(true)
  // Unified audio playback state: which message/kind is playing and whether paused.
  const [nowPlaying, setNowPlaying] = useState<{ key: string; paused: boolean } | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const [voiceErr, setVoiceErr] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<any>(null)
  const recognizedRef = useRef<string>('')

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

  // Load the user's saved chats + voice capability when the panel opens.
  useEffect(() => {
    if (!open) return
    api('/api/assistant/sessions').then((rows) => setSessions(rows || [])).catch(() => {})
    api('/api/assistant/voice/config').then((c) => { setSttAvailable(!!c?.stt); setTtsAvailable(!!c?.tts) }).catch(() => {})
  }, [open])

  const speechSupported = typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  const voiceSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices &&
    (sttAvailable || !!speechSupported)

  async function startRecording() {
    setVoiceErr(null)
    recognizedRef.current = ''

    // Always capture the audio (for storage + playback in EVERY browser, and as a
    // transcription fallback when browser recognition is blocked, e.g. Brave).
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setVoiceErr(t('aiMicDenied'))
      return
    }
    streamRef.current = stream
    chunksRef.current = []
    try {
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.start()
      recorderRef.current = rec
    } catch {
      // MediaRecorder unsupported — continue; recognition may still work.
      recorderRef.current = null
    }

    // Browser transcription in parallel only when there's no server STT.
    if (!sttAvailable && speechSupported) {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recog = new SR()
      recog.lang = SPEECH_LANG[lang] || 'en-US'
      recog.continuous = true
      recog.interimResults = true
      recog.onresult = (ev: any) => {
        let finalTxt = ''
        for (let i = 0; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalTxt += ev.results[i][0].transcript + ' '
        }
        if (finalTxt.trim()) recognizedRef.current = finalTxt.trim()
      }
      recog.onerror = (e: any) => {
        const code = e?.error
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') setVoiceErr(t('aiMicDenied'))
        else if (code === 'no-speech') setVoiceErr(t('aiVoiceNoSpeech'))
        else if (code === 'network') setVoiceErr(t('aiBraveHint'))   // Brave blocks the cloud recognizer
        else setVoiceErr(t('aiVoiceUnsupported'))
      }
      recognitionRef.current = recog
      try { recog.start() } catch { /* keep recording; upload fallback may handle it */ }
    }
    setRecording(true)
  }

  async function stopRecording() {
    setRecording(false)

    // Finalize browser recognition (if running) — WAIT for async results.
    let recogText = ''
    if (recognitionRef.current) {
      const recog = recognitionRef.current
      recogText = await new Promise<string>((resolve) => {
        let settled = false
        const done = () => { if (!settled) { settled = true; resolve(recognizedRef.current.trim()) } }
        recog.onend = done
        setTimeout(done, 1500)
        try { recog.stop() } catch { done() }
      })
      recognitionRef.current = null
    }

    // Finalize the recorded audio blob.
    let blob: Blob | null = null
    const rec = recorderRef.current
    if (rec) {
      blob = await new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }))
        try { rec.stop() } catch { resolve(new Blob(chunksRef.current, { type: 'audio/webm' })) }
      })
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    recorderRef.current = null

    const mime = blob?.type || 'audio/webm'
    const audioUrl = blob ? URL.createObjectURL(blob) : undefined
    const audioB64 = blob ? await blobToBase64(blob).catch(() => '') : ''

    // Transcript: server STT (any browser, incl. Brave) or browser recognition.
    let transcript = recogText
    if (sttAvailable && blob) {
      try {
        setTranscribing(true)
        const form = new FormData()
        form.append('file', blob, 'recording.webm')
        if (STT_LANG[lang]) form.append('lang', STT_LANG[lang])
        const data = await api('/api/assistant/voice/transcribe', { method: 'POST', body: form })
        transcript = String(data?.text || '').trim()
      } catch (e: any) {
        setVoiceErr(e?.message || t('aiVoiceUnsupported'))
      } finally {
        setTranscribing(false)
      }
    }

    if (!transcript) {
      // Nothing recognised. In a browser that blocks recognition (Brave) and with
      // no server STT, guide the user; otherwise it was just silence.
      if (!sttAvailable && (!speechSupported || voiceErr)) setVoiceErr((v) => v || t('aiBraveHint'))
      else setVoiceErr((v) => v || t('aiVoiceNoSpeech'))
      return
    }
    setVoiceErr(null)
    // Always attach the recorded audio so the user can replay it in any browser.
    ask(transcript, audioUrl ? { audioUrl, audioB64, mime } : undefined)
  }

  function toggleRecording() {
    if (recording) stopRecording()
    else startRecording()
  }

  // ── Unified audio playback (play / pause / resume) ─────────────────────────
  function stopAudio() {
    if (audioElRef.current) { try { audioElRef.current.pause() } catch {} ; audioElRef.current = null }
    try { window.speechSynthesis?.cancel() } catch {}
    setNowPlaying(null)
  }

  function togglePauseResume() {
    setNowPlaying((p) => {
      if (!p) return p
      if (audioElRef.current) {
        if (audioElRef.current.paused) { audioElRef.current.play().catch(() => {}); return { ...p, paused: false } }
        audioElRef.current.pause(); return { ...p, paused: true }
      }
      // speechSynthesis path
      try {
        if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); return { ...p, paused: false } }
        window.speechSynthesis.pause(); return { ...p, paused: true }
      } catch { return p }
    })
  }

  function playSrc(key: string, src: string) {
    stopAudio()
    const a = new Audio(src)
    audioElRef.current = a
    a.onended = () => setNowPlaying((p) => (p?.key === key ? null : p))
    a.play().catch(() => setNowPlaying((p) => (p?.key === key ? null : p)))
    setNowPlaying({ key, paused: false })
  }

  // Speak a bot answer: server TTS (e.g. Kokoro) if available, else browser voice.
  async function speak(m: Msg) {
    const key = `tts:${m.msgId ?? 'live'}`
    if (nowPlaying?.key === key) { togglePauseResume(); return }
    const plain = (m.text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/[*_`#>|]/g, '')
      .trim()
    if (!plain) return
    stopAudio()
    try {
      if (ttsAvailable) {
        const data = await api('/api/assistant/voice/tts', {
          method: 'POST',
          body: { text: plain, lang, session_id: sessionId, message_id: m.msgId },
        })
        if (data?.audio_b64) { playSrc(key, `data:${data.mime || 'audio/mpeg'};base64,${data.audio_b64}`); return }
      }
    } catch { /* fall through to browser voice */ }
    try {
      const u = new SpeechSynthesisUtterance(plain)
      u.lang = SPEECH_LANG[lang] || 'en-US'
      u.onend = () => setNowPlaying((p) => (p?.key === key ? null : p))
      setNowPlaying({ key, paused: false })
      window.speechSynthesis.speak(u)
    } catch { setNowPlaying(null) }
  }

  // Play / pause the user's own recording.
  async function playMessageAudio(m: Msg) {
    const key = `in:${m.msgId ?? m.audioUrl ?? ''}`
    if (nowPlaying?.key === key) { togglePauseResume(); return }
    try {
      if (m.audioUrl) { playSrc(key, m.audioUrl); return }
      if (sessionId && m.msgId && m.hasAudioIn) {
        const data = await api(`/api/assistant/sessions/${sessionId}/messages/${m.msgId}/audio?kind=in`)
        if (data?.audio_b64) playSrc(key, `data:${data.mime || 'audio/webm'};base64,${data.audio_b64}`)
      }
    } catch { /* ignore */ }
  }

  function isPlaying(key: string) { return nowPlaying?.key === key && !nowPlaying.paused }
  function isActive(key: string) { return nowPlaying?.key === key }

  async function refreshSessions() {
    try { setSessions((await api('/api/assistant/sessions')) || []) } catch {}
  }

  function newChat() {
    stopAudio()
    setMsgs([{ role: 'bot', text: t(WELCOME_KEY) }])
    setSessionId(null)
    setAttachments([])
    setShowHistory(false)
  }

  async function openSession(id: number) {
    try {
      const data = await api(`/api/assistant/sessions/${id}`)
      const loaded: Msg[] = (data?.messages || []).map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'bot',
        text: m.text,
        intent: m.intent || undefined,
        sources: Array.isArray(m.sources) && m.sources.length ? m.sources : undefined,
        files: Array.isArray(m.files) && m.files.length ? m.files : undefined,
        msgId: m.id,
        voice: !!m.has_audio_in,
        hasAudioIn: !!m.has_audio_in,
      }))
      setMsgs(loaded.length ? loaded : [{ role: 'bot', text: t(WELCOME_KEY) }])
      setSessionId(id)
      setShowHistory(false)
    } catch { /* ignore */ }
  }

  async function renameSession(id: number, current: string) {
    const title = window.prompt(t('aiRenamePrompt'), current)
    if (title == null || !title.trim()) return
    try { await api(`/api/assistant/sessions/${id}`, { method: 'PATCH', body: { title: title.trim() } }); refreshSessions() } catch {}
  }

  async function deleteSession(id: number) {
    if (!window.confirm(t('aiDeleteConfirm'))) return
    try {
      await api(`/api/assistant/sessions/${id}`, { method: 'DELETE' })
      if (id === sessionId) newChat()
      refreshSessions()
    } catch {}
  }

  // Closing always returns to the docked FAB (never leaves the panel expanded
  // with the launcher hidden).
  function closePanel() {
    stopAudio()
    setOpen(false)
    setFull(false)
    setShowHistory(false)
  }

  function historyPayload(list: Msg[]) {
    return list.slice(1).slice(-8).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))
  }

  async function onAttach(files: FileList | null) {
    if (!files || !files.length) return
    setAttachErr(null)
    setAttaching(true)
    try {
      for (const f of Array.from(files)) {
        const form = new FormData()
        form.append('file', f)
        const data = await api('/api/assistant/attach', { method: 'POST', body: form })
        setAttachments((a) => [
          ...a,
          { filename: data.filename, text: data.text, chars: data.chars, truncated: !!data.truncated },
        ])
      }
    } catch (e: any) {
      setAttachErr(e?.message || 'Could not read that file.')
    } finally {
      setAttaching(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function ask(question: string, voice?: { audioUrl: string; audioB64: string; mime: string }) {
    const q = question.trim()
    if (!q || sending) return
    setInput('')
    const list = msgs
    const sentFiles = attachments
    setMsgs((m) => [...m, {
      role: 'user', text: q, files: sentFiles.map((a) => a.filename),
      voice: !!voice, audioUrl: voice?.audioUrl,
    }])
    setAttachments([])
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
          attachments: sentFiles.map((a) => ({ filename: a.filename, text: a.text })),
          session_id: sessionId,
          transcript: voice ? q : undefined,
          audio_in_b64: voice?.audioB64,
          audio_in_mime: voice?.mime,
        },
      })
      setMsgs((m) => [
        ...m,
        {
          role: 'bot',
          text: String(data?.answer ?? '') || t('aiWidgetUnavailable'),
          intent: data?.intent as Intent,
          sources: Array.isArray(data?.sources) ? data.sources : undefined,
          msgId: data?.message_id ?? undefined,
        },
      ])
      if (data?.session_id) {
        setSessionId(data.session_id)
        refreshSessions()
      }
      // Auto-play the reply aloud (server TTS if configured, else browser voice).
      if (autoplay) {
        const answer = String(data?.answer ?? '')
        if (answer) speak({ role: 'bot', text: answer, msgId: data?.message_id ?? undefined })
      }
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'bot', text: e?.message || t('aiWidgetUnavailable') }])
    } finally {
      setSending(false)
    }
  }

  // Panel geometry: docked card vs. full-screen overlay. `position` is part of
  // this (fixed when expanded so it fills the viewport; relative when docked so
  // the drag-drop overlay anchors to the panel) — do NOT override it below.
  const panelSx = full
    ? { position: 'fixed' as const, inset: 0, width: '100vw', height: '100dvh', borderRadius: 0, mb: 0 }
    : { position: 'relative' as const, mb: 1.5, width: 'min(94vw, 24rem)', height: 'auto', borderRadius: 3 }

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
          onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
          onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) setDragOver(false) }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onAttach(e.dataTransfer.files) }}
          sx={{ ...panelSx, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {dragOver ? (
            <Box
              sx={{
                position: 'absolute', inset: 0, zIndex: 5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'action.hover', border: 2, borderStyle: 'dashed', borderColor: 'primary.main',
                pointerEvents: 'none',
              }}
            >
              <Stack alignItems="center" spacing={1}>
                <AttachFileIcon color="primary" />
                <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>{t('aiDropHere')}</Typography>
              </Stack>
            </Box>
          ) : null}
          {/* Header: [history][expand]  avatar+title  [new][close] */}
          <Stack
            direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}
            sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
          >
            <Stack direction="row" alignItems="center">
              <Tooltip title={t('aiHistory')} placement="bottom">
                <IconButton size="small" onClick={() => setShowHistory((v) => !v)} aria-label={t('aiHistory')}>
                  <HistoryIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={full ? t('aiCollapse') : t('aiExpand')} placement="bottom">
                <IconButton size="small" onClick={() => setFull((v) => !v)} aria-label={full ? t('aiCollapse') : t('aiExpand')}>
                  {full ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0, flex: 1, justifyContent: 'center' }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 30, height: 30 }}>
                <SmartToyOutlinedIcon fontSize="small" />
              </Avatar>
              <Typography sx={{ fontWeight: 600 }} noWrap>{t('aiWidgetTitle')}</Typography>
            </Stack>
            <Stack direction="row" alignItems="center">
              <Tooltip title={autoplay ? t('aiAutoplayOn') : t('aiAutoplayOff')} placement="bottom">
                <IconButton
                  size="small"
                  onClick={() => { if (autoplay) stopAudio(); setAutoplay((v) => !v) }}
                  aria-label={autoplay ? t('aiAutoplayOn') : t('aiAutoplayOff')}
                  color={autoplay ? 'primary' : 'default'}
                >
                  {autoplay ? <VolumeUpOutlinedIcon fontSize="small" /> : <VolumeOffOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title={t('aiNewChat')} placement="bottom">
                <IconButton size="small" onClick={newChat} aria-label={t('aiNewChat')}>
                  <AddCommentOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton size="small" onClick={closePanel} aria-label={t('aiWidgetClose')}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>

          {/* History sidebar (overlay drawer inside the panel) */}
          {showHistory ? (
            <Box sx={{ position: 'absolute', inset: 0, zIndex: 7, display: 'flex' }}>
              <Box
                sx={{
                  width: 'min(82%, 300px)', height: '100%', bgcolor: 'background.paper',
                  borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="overline" sx={{ fontWeight: 700 }} color="text.secondary">{t('aiHistory')}</Typography>
                  <Button size="small" startIcon={<AddCommentOutlinedIcon />} onClick={newChat}>{t('aiNewChat')}</Button>
                </Stack>
                <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
                  {sessions.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>{t('aiNoHistory')}</Typography>
                  ) : sessions.map((s) => (
                    <Stack
                      key={s.id} direction="row" alignItems="center" spacing={0.5}
                      sx={{
                        borderRadius: 1, px: 1, py: 0.75, cursor: 'pointer',
                        bgcolor: s.id === sessionId ? 'action.selected' : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Typography
                        variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}
                        onClick={() => openSession(s.id)} title={s.title}
                      >
                        {s.title}
                      </Typography>
                      <IconButton size="small" onClick={() => renameSession(s.id, s.title)} aria-label={t('aiRename')}>
                        <DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => deleteSession(s.id)} aria-label={t('aiDelete')}>
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>
                  ))}
                </Box>
              </Box>
              <Box sx={{ flex: 1 }} onClick={() => setShowHistory(false)} />
            </Box>
          ) : null}

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
                      // Bot answers use most of the width for comfortable reading;
                      // user messages stay a bit narrower. Responsive in both the
                      // docked popup and the full-screen view.
                      maxWidth: '100%',
                      width: m.role === 'bot' ? (full ? 'min(100%, 60rem)' : '92%') : 'auto',
                      px: 1.5, py: 1, borderRadius: 2, wordBreak: 'break-word',
                      bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                      color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                    }}
                  >
                    {m.role === 'bot'
                      ? <Markdown text={m.text} />
                      : <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.text}</Typography>}
                  </Paper>
                  {m.role === 'bot' && m.sources && m.sources.length ? (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, maxWidth: full ? 'min(100%, 60rem)' : '92%' }}>
                      {t('aiSources')}: {m.sources.join(', ')}
                    </Typography>
                  ) : null}
                  {m.role === 'bot' && i > 0 ? (() => {
                    const key = `tts:${m.msgId ?? 'live'}`
                    const playing = isPlaying(key)
                    return (
                      <Tooltip title={playing ? t('aiPause') : t('aiSpeak')} placement="right">
                        <IconButton size="small" onClick={() => speak(m)} aria-label={playing ? t('aiPause') : t('aiSpeak')} sx={{ mt: 0.25 }}>
                          {playing ? <PauseIcon sx={{ fontSize: 18 }} /> : <VolumeUpOutlinedIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </Tooltip>
                    )
                  })() : null}
                  {m.role === 'user' && m.files && m.files.length ? (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      📎 {m.files.join(', ')}
                    </Typography>
                  ) : null}
                  {m.role === 'user' && (m.audioUrl || m.hasAudioIn) ? (() => {
                    const key = `in:${m.msgId ?? m.audioUrl ?? ''}`
                    const playing = isPlaying(key)
                    return (
                      <Button
                        size="small"
                        startIcon={playing ? <PauseIcon /> : <PlayArrowIcon />}
                        onClick={() => playMessageAudio(m)}
                        sx={{ mt: 0.25, minWidth: 0, textTransform: 'none', py: 0 }}
                      >
                        {playing ? t('aiPauseRecording') : t('aiPlayRecording')}
                      </Button>
                    )
                  })() : null}
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

          {/* Pending attachments + attach/voice errors */}
          {(attachments.length > 0 || attachErr || voiceErr || recording) ? (
            <Box sx={{ px: 1.5, pt: 1 }}>
              {attachErr ? (
                <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>{attachErr}</Typography>
              ) : null}
              {voiceErr ? (
                <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>{voiceErr}</Typography>
              ) : null}
              {recording ? (
                <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
                  ● {t('aiRecordStop')}
                </Typography>
              ) : null}
              <Stack direction="row" flexWrap="wrap" gap={0.75}>
                {attachments.map((a, i) => (
                  <Chip
                    key={i} size="small" variant="outlined" label={a.truncated ? `${a.filename} (trimmed)` : a.filename}
                    onDelete={() => setAttachments((list) => list.filter((_, j) => j !== i))}
                    deleteIcon={<CloseIcon />}
                    sx={{ maxWidth: '100%' }}
                  />
                ))}
              </Stack>
            </Box>
          ) : null}

          {/* Input: attach + multiline (grows down to 5 rows, then scrolls). */}
          <Stack
            component="form" direction="row" spacing={0.5} alignItems="flex-end"
            sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}
            onSubmit={(e) => { e.preventDefault(); ask(input) }}
          >
            <input
              ref={fileRef} type="file" hidden multiple accept={ATTACH_ACCEPT}
              onChange={(e) => onAttach(e.target.files)}
            />
            <Tooltip title={t('aiAttach')} placement="top">
              <span>
                <IconButton
                  onClick={() => fileRef.current?.click()}
                  disabled={attaching || sending || recording}
                  aria-label={t('aiAttach')}
                >
                  {attaching ? <CircularProgress size={20} /> : <AttachFileIcon />}
                </IconButton>
              </span>
            </Tooltip>
            {voiceSupported ? (
              <Tooltip title={recording ? t('aiRecordStop') : t('aiRecordStart')} placement="top">
                <span>
                  <IconButton
                    onClick={toggleRecording}
                    disabled={sending || transcribing}
                    color={recording ? 'error' : 'default'}
                    aria-label={recording ? t('aiRecordStop') : t('aiRecordStart')}
                  >
                    {transcribing ? <CircularProgress size={20} /> : recording ? <StopCircleIcon /> : <MicNoneIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
            <TextField
              size="small" fullWidth multiline minRows={1} maxRows={5}
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter inserts a newline.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) }
              }}
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
