import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, Input, Textarea, Button, ErrorBox } from '../components/ui'
import { api } from '../api/client'
import { useI18n } from '../i18n'
import { useAuth } from '../store/auth'
import WorkflowAssistant from '../components/workflow-assistant'

const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL ||
  import.meta.env.VITE_PROJECT_CONTACT1_EMAIL ||
  import.meta.env.VITE_PROJECT_CONTACT_EMAIL ||
  'support@crea3.eu'

export default function SupportPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)

  const mailto = useMemo(() => {
    const body = `${message}\n\n— ${user?.username ?? ''} (${user?.email ?? ''})`
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[CREA3 Support] ' + subject)}&body=${encodeURIComponent(body)}`
  }, [subject, message, user])

  async function submit() {
    setErr(null)
    if (!subject.trim() || !message.trim()) {
      setErr(t('supportRequired'))
      return
    }
    setStatus('sending')
    try {
      await api('/api/support', { method: 'POST', body: { subject: subject.trim(), message: message.trim() } })
      setStatus('sent')
    } catch (e: any) {
      setStatus('error')
      setErr(t('supportError'))
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader title={t('supportTitle')} subtitle={t('supportSubtitle')} />
        <div className="p-5">
          {status === 'sent' ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
              <div className="font-medium">{t('supportSent')}</div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={() => { setSubject(''); setMessage(''); setStatus('idle') }}>
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

      <WorkflowAssistant variant="support" />
    </div>
  )
}
