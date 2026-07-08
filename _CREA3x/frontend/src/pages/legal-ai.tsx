import React from 'react'
import { Card, CardHeader } from '../components/ui'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import LegalAvatar from '../components/legal-avatar'

// The embedded platform AI assistant (external Streamlit app). ?embed=true hides
// Streamlit's own chrome so it sits cleanly inside the page.
const CHATBOT_EMBED_URL = 'https://crea3_chatbot.idealunina.work/?embed=true'
const CHATBOT_OPEN_URL = 'https://crea3_chatbot.idealunina.work/'

/**
 * Legal AI Assistant — the embedded chatbot only.
 *
 * Text and voice inputs are intentionally NOT exposed here; they are handled
 * separately (on the chatbot side).
 */
export default function LegalAiAssistant() {
  const { user } = useAuth()
  const { t } = useI18n()
  const isAuthed = !!user

  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden">
        <CardHeader
          title={
            <div className="flex items-center gap-3">
              <LegalAvatar size={40} state={'idle' as any} />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{t('navLegalAi')}</div>
                <div className="text-xs text-slate-600 mt-0.5">{t('legalAiSubtitle')}</div>
              </div>
            </div>
          }
        />

        <div className="p-5">
          <div className="rounded-3xl border border-slate-200/70 bg-white/75 overflow-hidden">
            {isAuthed ? (
              <iframe
                src={CHATBOT_EMBED_URL}
                title={t('navLegalAi')}
                className="w-full h-[560px] border-0"
                allow="microphone; camera; clipboard-write; autoplay"
              />
            ) : (
              <div className="p-6 text-sm text-slate-600">{t('legalAiChatbotSignIn')}</div>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap border-t border-slate-200/70 bg-white/85 px-4 py-2 text-xs text-slate-500">
              <span>{t('legalAiChatbotNote')}</span>
              <a href={CHATBOT_OPEN_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-800">{t('legalAiChatbotOpen')}</a>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">{t('legalAiDisclaimer')}</div>
        </div>
      </Card>
    </div>
  )
}
