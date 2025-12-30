import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, CardHeader, Pill } from '../components/ui'
import NetworkBackground from '../components/background'
import SiteFooter from '../components/site-footer'
import { api } from '../api/client'
import { useAuth } from '../store/auth'

function LogoMark() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="h-12 w-12 rounded-2xl bg-white/70 border border-white/40 flex items-center justify-center text-slate-900 font-bold">
        C3
      </div>
    )
  }
  return (
    <img
      src="/crea3.logo.png"
      alt="CREA3 logo"
      className="h-12 w-12 rounded-2xl bg-white/70 border border-white/40 object-contain"
      onError={() => setFailed(true)}
    />
  )
}

export default function Landing() {
  const [metrics, setMetrics] = useState<{visits:number; registered_users:number} | null>(null)

  const { user } = useAuth()

  useEffect(() => {
    api('/api/metrics/visit', { method: 'POST' }).catch(() => {})
    api('/api/metrics/summary').then((d) => setMetrics(d)).catch(() => {})
  }, [])

  const primaryCta = useMemo(() => {
    return user ? { label: 'Go to Home', to: '/app' } : { label: 'Create an account', to: '/register' }
  }, [user])

  return (
    <div className="grid min-h-screen gap-6 bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/40 shadow-2xl backdrop-blur">
        <NetworkBackground fixed={false} />

        <div className="relative p-7 md:p-10 text-white">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <div className="text-sm text-white/80">Online dispute resolution platform</div>
              <div className="text-2xl md:text-3xl font-semibold leading-tight">CREA3</div>
            </div>
            <div className="ml-auto hidden md:flex gap-2">
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs border border-white/15">Bids</span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs border border-white/15">Rates</span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs border border-white/15">Mediation</span>
            </div>
          </div>

          <div className="mt-6 grid md:grid-cols-2 gap-6 items-center">
            <div>
              <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">
                Manage disputes through a structured and transparent negotiation workflow.
              </h1>
              <p className="mt-4 text-white/80 text-base md:text-lg">
                Invite participants by email, gather strategy notes and preferences, generate an evidence-based proposal,
                and—when necessary—transition to structured mediation with conferencing support.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link to={primaryCta.to}><Button className="px-5 py-2.5">{primaryCta.label}</Button></Link>
                {user ? null : (
                  <Link to="/login"><Button variant="ghost" className="px-5 py-2.5 border border-white/20 bg-white/10 text-white hover:bg-white/15">Sign in</Button></Link>
                )}
                <Link to="/help"><Button variant="ghost" className="px-5 py-2.5 border border-white/20 bg-white/10 text-white hover:bg-white/15">How it works</Button></Link>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/80">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 border border-white/15">
                  Email invitations and notifications
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 border border-white/15">
                  Strategy notes and preference submission
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 border border-white/15">
                  Conference support for mediation
                </span>
              </div>
            </div>

            <div className="rounded-3xl bg-white/5 border border-white/15 p-5 md:p-6">
              <div className="text-sm font-semibold">Workflow at a glance</div>
              <div className="mt-4 grid gap-3">
                <Step n="1" title="Create a dispute" text="Choose Bids or Rates. Add goods & estimated values." />
                <Step n="2" title="Invite parties and mediators" text="Add email addresses. Participants can accept invitations from their notifications." />
                <Step n="3" title="Collect strategy + preferences" text="Each party submits notes + bids/stars per good." />
                <Step n="4" title="Proposal → accept or decline" text="If declined, mediation opens with conferencing tools." />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VALUE PROPS */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-slate-50/95">
          <CardHeader title="For parties" subtitle="Transparent, structured, and negotiable." />
          <div className="p-4 text-sm text-slate-700 space-y-2">
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>Review the goods list and submit what matters most.</span></div>
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>Save strategy notes for mediator review.</span></div>
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>Accept the proposal or proceed to mediation.</span></div>
          </div>
        </Card>

        <Card className="bg-slate-50/95">
          <CardHeader title="For mediators" subtitle="Read-only visibility across stages." />
          <div className="p-4 text-sm text-slate-700 space-y-2">
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>View context, goods, strategies, and preferences.</span></div>
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>Review proposal metrics and guide negotiations.</span></div>
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>Coordinate conference planning without editing records.</span></div>
          </div>
        </Card>

        <Card className="bg-slate-50/95">
          <CardHeader title="Governance" subtitle="Auditable steps for a clean record." />
          <div className="p-4 text-sm text-slate-700 space-y-2">
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>Access controlled by participation and role.</span></div>
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>Generate a report once the outcome is accepted.</span></div>
            <div className="flex items-start gap-2"><span className="text-slate-400">•</span><span>Swap in your game-theory engine when ready.</span></div>
          </div>
        </Card>
      </div>

      {/* CTA FOOTER */}
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="text-xl font-semibold">Ready to begin?</div>
          <div className="text-sm text-slate-600 mt-1">Create an account, verify your email address, and sign in to access the platform.</div>
          <div className="mt-3">
            <div className="text-xs text-slate-500">Partners</div>
            <img
              src="/partners.png"
              alt="Partners"
              className="mt-2 h-8 w-auto max-w-full object-contain"
              loading="lazy"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={primaryCta.to}><Button className="px-5 py-2.5">{primaryCta.label}</Button></Link>
          {user ? null : <Link to="/login"><Button variant="ghost" className="px-5 py-2.5">Sign in</Button></Link>}
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs border border-white/20">{n}</span>
        <div className="font-semibold">{title}</div>
      </div>
      <div className="mt-1 text-sm text-white/80">{text}</div>
    </div>
  )
}
