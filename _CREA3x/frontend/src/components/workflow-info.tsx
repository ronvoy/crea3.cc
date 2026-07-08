import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, Button } from './ui'
import { useI18n, type I18nKey } from '../i18n'
import { api } from '../api/client'
import DisputeStatusBadge from './dispute-status-badge'

type ActiveDispute = { id: number; title: string; status: string }

const stroke = (d: string, cls = 'h-6 w-6') => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)
const CHECK = 'M5 12l4 4 10-10'

// The five workflow phases, labelled with the dispute tab keys (already translated).
const PHASES: I18nKey[] = ['tabAgents', 'tabGoods', 'tabPreferences', 'tabProposals', 'tabMediation']

export default function WorkflowInfo({
  icon,
  title,
  intro,
  points,
  activeStep = 0,
}: {
  icon: React.ReactNode
  title: string
  intro: string
  points: string[]
  activeStep?: number
}) {
  const { t } = useI18n()
  const nav = useNavigate()

  const [disputes, setDisputes] = useState<ActiveDispute[] | null>(null)
  useEffect(() => {
    let alive = true
    api('/api/disputes')
      .then((rows: ActiveDispute[]) => {
        if (!alive) return
        // Show only active disputes — exclude abandoned ones.
        setDisputes((rows || []).filter((d) => d.status !== 'abandoned'))
      })
      .catch(() => {
        if (alive) setDisputes([])
      })
    return () => {
      alive = false
    }
  }, [])
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex h-full flex-col p-6 md:p-8">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              {icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{intro}</p>
            </div>
          </div>

          {/* Phase stepper */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('workflow')}</div>
            <ol className="mt-3 flex flex-wrap items-center gap-y-3">
              {PHASES.map((key, i) => {
                const active = i === activeStep
                const done = i < activeStep
                return (
                  <li key={key} className="flex items-center">
                    <div className="flex items-center gap-2">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                          active
                            ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                            : done
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-white text-slate-500 ring-1 ring-slate-200'
                        }`}
                      >
                        {done ? stroke(CHECK, 'h-4 w-4') : i + 1}
                      </span>
                      <span className={`text-sm ${active ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{t(key)}</span>
                    </div>
                    {i < PHASES.length - 1 ? <span className="mx-2 hidden h-px w-6 bg-slate-300 sm:block" aria-hidden /> : null}
                  </li>
                )
              })}
            </ol>
          </div>

          {/* Points */}
          <ul className="mt-4 grid flex-1 gap-3 sm:grid-cols-3">
            {points.map((p, i) => (
              <li key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  {stroke(CHECK, 'h-5 w-5')}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{p}</p>
              </li>
            ))}
          </ul>

          {/* Active disputes (abandoned ones are excluded) */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('wfActiveDisputes')}</div>
            {disputes === null ? (
              <div className="mt-3 text-sm text-slate-500">…</div>
            ) : disputes.length === 0 ? (
              <div className="mt-3 text-sm text-slate-600">{t('wfNoActiveDisputes')}</div>
            ) : (
              <div className="mt-3 grid gap-2">
                {disputes.map((d) => (
                  <Link
                    key={d.id}
                    to={`/app/disputes/${d.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:bg-white"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{d.title}</div>
                      <div className="text-xs text-slate-500">ID {d.id}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <DisputeStatusBadge status={d.status} theme="light" />
                      <span className="text-sm font-medium text-blue-700">{t('wfOpenDispute')}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex-1 text-sm text-slate-600">{t('wfNeedDispute')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => nav('/app/mediators')}>{t('mediatorsTitle')}</Button>
              <Button variant="outline" onClick={() => nav('/app/faq')}>{t('navFaqs')}</Button>
              <Button onClick={() => nav('/app')}>{t('wfGoToDisputes')}</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
