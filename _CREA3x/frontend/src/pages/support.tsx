import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, Input, Textarea, Button, ErrorBox } from '../components/ui'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { useAuth } from '../store/auth'

const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL ||
  import.meta.env.VITE_PROJECT_CONTACT1_EMAIL ||
  import.meta.env.VITE_PROJECT_CONTACT_EMAIL ||
  'support@crea3.cc'

const ACCEPT = '.png,.jpg,.jpeg,.pdf,.docx,.txt'
const ALLOWED_RE = /\.(png|jpe?g|pdf|docx|txt)$/i
const MAX_FILES = 8
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB each

export default function SupportPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const mailto = useMemo(() => {
    const body = `${message}\n\n— ${user?.username ?? ''} (${user?.email ?? ''})`
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[crea3.cc] ' + subject)}&body=${encodeURIComponent(body)}`
  }, [subject, message, user])

  function addFiles(list: FileList | null) {
    if (!list) return
    setErr(null)
    const valid: File[] = []
    for (const f of Array.from(list)) {
      if (!ALLOWED_RE.test(f.name)) { setErr(t('supportFileType')); continue }
      if (f.size > MAX_SIZE) { setErr(t('supportFileTooBig')); continue }
      valid.push(f)
    }
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES))
    if (fileRef.current) fileRef.current.value = ''
  }
  function removeFile(i: number) { setFiles((prev) => prev.filter((_, idx) => idx !== i)) }

  async function submit() {
    setErr(null)
    if (!subject.trim() || !message.trim()) {
      setErr(t('supportRequired'))
      return
    }
    setStatus('sending')
    try {
      const form = new FormData()
      form.append('subject', subject.trim())
      form.append('message', message.trim())
      for (const f of files) form.append('files', f, f.name)
      await api('/api/support', { method: 'POST', body: form })
      setStatus('sent')
    } catch (e: any) {
      setStatus('error')
      setErr(t('supportError'))
    }
  }

  return (
    <div className="grid w-full gap-4">
      <Card>
        <CardHeader title={t('supportTitle')} subtitle={t('supportSubtitle')} />
        <div className="p-5">
          {status === 'sent' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
              <div className="font-medium">{t('supportSent')}</div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={() => { setSubject(''); setMessage(''); setFiles([]); setStatus('idle') }}>
                  {t('supportSendAnother')}
                </Button>
                <Button variant="ghost" onClick={() => navigate(-1)}>{t('supportBack')}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                <span className="font-medium text-slate-700">{t('supportFromLabel')}:</span>{' '}
                {user?.username} · {user?.email}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('supportSubjectLabel')}</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('supportSubjectPlaceholder')} maxLength={200} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('supportMessageLabel')}</label>
                <Textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('supportMessagePlaceholder')} maxLength={8000} />
              </div>

              {/* Attachments */}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t('supportAttachments')}</label>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  onChange={(e) => addFiles(e.target.files)}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES}>
                  {t('supportAddFiles')}
                </Button>
                <div className="mt-1 text-xs text-slate-500">{t('supportFileHint')}</div>
                {files.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                        <span className="min-w-0 truncate text-slate-700">
                          {f.name} <span className="text-slate-400">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="shrink-0 rounded p-1 text-slate-400 hover:text-rose-600"
                          aria-label={t('supportRemoveFile')}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <ErrorBox message={err} />

              {status === 'error' ? (
                <a href={mailto} className="inline-block text-sm text-blue-700 underline underline-offset-4">
                  {t('supportMailtoFallback')}
                </a>
              ) : null}

              <div className="flex gap-2 pt-1">
                <Button onClick={submit} disabled={status === 'sending'}>
                  {status === 'sending' ? t('supportSending') : t('supportSend')}
                </Button>
                <Button variant="ghost" onClick={() => navigate(-1)}>{t('supportBack')}</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
