import React from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { useI18n, type I18nKey } from '../i18n'

type Phase = { titleKey: I18nKey; descKey: I18nKey; img: string }

const PHASES: Phase[] = [
  { titleKey: 'landingWorkflowStep1Title', descKey: 'landingWorkflowStep1Desc', img: '/workflow/dispute.png' },
  { titleKey: 'landingWorkflowStep2Title', descKey: 'landingWorkflowStep2Desc', img: '/workflow/invite-party.webp' },
  { titleKey: 'landingWorkflowStep3Title', descKey: 'landingWorkflowStep3Desc', img: '/workflow/mediation-strategy.webp' },
  { titleKey: 'landingWorkflowStep4Title', descKey: 'landingWorkflowStep4Desc', img: '/workflow/proposal.webp' },
]

export default function Workflow() {
  const { t } = useI18n()
  return (
    <div className="grid gap-4">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-blue-600 to-indigo-700 p-7 text-white shadow-sm md:p-10">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/80">{t('landingNavWorkflow')}</div>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">{t('workflowPageTitle')}</h1>
          <p className="mt-3 max-w-2xl text-white/85">{t('workflowPageSubtitle')}</p>
        </div>
      </section>

      {/* Phases */}
      <section className="grid gap-4 md:grid-cols-2">
        {PHASES.map((p, i) => (
          <Card key={p.titleKey} className="overflow-hidden">
            <div className="relative h-44">
              <img src={p.img} alt={t(p.titleKey)} className="h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
              <span className="absolute left-3 top-3 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow">
                {t('workflowPagePhase')} {i + 1}
              </span>
            </div>
            <div className="p-5">
              <div className="text-lg font-semibold text-slate-900">{t(p.titleKey)}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(p.descKey)}</p>
            </div>
          </Card>
        ))}
      </section>

      {/* CTA */}
      <section className="flex flex-col items-start justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-6 shadow-sm sm:flex-row sm:items-center">
        <p className="text-sm text-slate-600">{t('landingReadyBody')}</p>
        <div className="flex gap-2">
          <Link to="/register" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
            {t('landingCtaCreateAccount')}
          </Link>
          <Link to="/scope" className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
            {t('landingNavScope')}
          </Link>
        </div>
      </section>
    </div>
  )
}
