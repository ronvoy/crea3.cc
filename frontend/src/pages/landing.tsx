import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n, type I18nKey } from '../i18n'
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
	              <WorkflowCarousel />
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

type WorkflowSlideDef = {
  id: number
  titleKey: I18nKey
  descriptionKey: I18nKey
  imageSrc: string
  imageAltKey: I18nKey
}

type WorkflowSlide = {
  id: number
  title: string
  description: string
  imageSrc: string
  imageAlt: string
}

const WORKFLOW_SLIDES: WorkflowSlideDef[] = [
  {
    id: 1,
    titleKey: 'landingWorkflowStep1Title',
    descriptionKey: 'landingWorkflowStep1Desc',
    imageSrc: '/workflow/dispute.png',
    imageAltKey: 'landingWorkflowStep1Alt',
  },
  {
    id: 2,
    titleKey: 'landingWorkflowStep2Title',
    descriptionKey: 'landingWorkflowStep2Desc',
    imageSrc: '/workflow/invite-party.webp',
    imageAltKey: 'landingWorkflowStep2Alt',
  },
  {
    id: 3,
    titleKey: 'landingWorkflowStep3Title',
    descriptionKey: 'landingWorkflowStep3Desc',
    imageSrc: '/workflow/mediation-strategy.webp',
    imageAltKey: 'landingWorkflowStep3Alt',
  },
  {
    id: 4,
    titleKey: 'landingWorkflowStep4Title',
    descriptionKey: 'landingWorkflowStep4Desc',
    imageSrc: '/workflow/proposal.webp',
    imageAltKey: 'landingWorkflowStep4Alt',
  },
]

function WorkflowCarousel() {
  const { t } = useI18n()
  const slides: WorkflowSlide[] = useMemo(
    () =>
      WORKFLOW_SLIDES.map((s) => ({
        id: s.id,
        title: t(s.titleKey),
        description: t(s.descriptionKey),
        imageSrc: s.imageSrc,
        imageAlt: t(s.imageAltKey),
      })),
    [t]
  )
  const total = slides.length

  const [active, setActive] = useState(0)
  const intervalRef = useRef<number | null>(null)
  const wheelLockRef = useRef(0)
  const pointerStartX = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    stop()
    intervalRef.current = window.setInterval(() => {
      setActive((i) => (i + 1) % total)
    }, 3000)
  }, [stop, total])

  const step = useCallback(
    (delta: number) => {
      setActive((i) => (i + delta + total) % total)
      start() // reset autoplay after user interaction
    },
    [start, total]
  )

  const goTo = useCallback(
    (index: number) => {
      setActive(((index % total) + total) % total)
      start() // reset autoplay after user interaction
    },
    [start, total]
  )

  useEffect(() => {
    start()
    return stop
  }, [start, stop])

  const onWheel = (e: React.WheelEvent) => {
    // Only treat horizontal scroll gestures (trackpads) or Shift+wheel as navigation.
    const delta = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0
    if (delta === 0) return
    if (Math.abs(delta) < 20) return

    const now = Date.now()
    if (now - wheelLockRef.current < 650) return
    wheelLockRef.current = now
    delta > 0 ? step(1) : step(-1)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointerStartX.current = e.clientX
    stop()
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const startX = pointerStartX.current
    pointerStartX.current = null

    if (startX === null) {
      start()
      return
    }

    const dx = e.clientX - startX
    if (Math.abs(dx) >= 70) {
      dx < 0 ? step(1) : step(-1)
      return
    }

    start()
  }

  return (
    <div
      className="select-none"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerStartX.current = null
        start()
      }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          step(-1)
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          step(1)
        }
      }}
      aria-label="Workflow carousel"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{t('landingWorkflowHeading')}</div>
        <div className="text-xs text-white/60 hidden sm:block">{t('landingWorkflowHint')}</div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
        <div
          className="flex transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {slides.map((s, i) => (
            <div key={s.id} className="w-full shrink-0">
              <div className="relative h-52 md:h-56">
                <img
                  src={s.imageSrc}
                  alt={s.imageAlt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                  <div className="text-white">
                    <div className="text-lg font-semibold leading-snug">{s.title}</div>
                  </div>
                  <Pill className="bg-white/10 border border-white/15 text-white/80">{i + 1} / {total}</Pill>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm leading-relaxed text-white/80">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => goTo(i)}
              className={
                `h-2 w-2 rounded-full transition-all ${
                  i === active ? 'bg-white/80 scale-110' : 'bg-white/25 hover:bg-white/40'
                }`
              }
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="h-9 w-9 rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15 p-0"
            onClick={() => step(-1)}
            aria-label="Previous step"
          >
            ‹
          </Button>
          <Button
            variant="ghost"
            className="h-9 w-9 rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/15 p-0"
            onClick={() => step(1)}
            aria-label="Next step"
          >
            ›
          </Button>
        </div>
      </div>
    </div>
  )
}
