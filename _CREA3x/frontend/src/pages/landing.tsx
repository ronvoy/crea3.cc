import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n, type I18nKey } from '../i18n'
import { Button, Pill } from '../components/ui'
import NetworkBackground from '../components/background'
import SiteFooter from '../components/site-footer'
import EuropeMap from '../components/europe-map'
import EuEmblem from '../components/eu-emblem'
import HelpWidget from '../components/help-widget'
import { api } from '../api/client'
import { useAuth } from '../store/auth'

function LogoMark() {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  const inner = failed ? (
    <div className="flex h-16 w-16 sm:h-24 sm:w-24 items-center justify-center rounded-2xl border border-white/40 bg-white/80 text-2xl font-bold text-slate-900 shadow-lg shadow-sky-500/20">
      C3
    </div>
  ) : (
    <img
      src="/crea3.logo.png"
      alt="CREA3 logo"
      className="h-16 w-16 sm:h-24 sm:w-24 rounded-2xl border border-white/40 bg-white/80 object-contain p-1 shadow-lg shadow-sky-500/20 ring-1 ring-white/30"
      onError={() => setFailed(true)}
    />
  )
  return (
    <Link to="/" aria-label={t('ariaHome')} className="rounded-2xl transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
      {inner}
    </Link>
  )
}

export default function Landing() {
  const [metrics, setMetrics] = useState<{ visits: number; registered_users: number; disputes: number } | null>(null)
  const { user } = useAuth()
  const { t } = useI18n()

  useEffect(() => {
    api('/api/metrics/visit', { method: 'POST' }).catch(() => {})
    api('/api/metrics/summary').then((d) => setMetrics(d)).catch(() => {})
  }, [])

  const primaryCta = useMemo(
    () =>
      user
        ? { labelKey: 'landingCtaGoHome' as I18nKey, to: '/app' }
        : { labelKey: 'landingCtaCreateAccount' as I18nKey, to: '/register' },
    [user],
  )

  return (
    <div className="grid min-h-screen min-w-0 gap-6 overflow-x-hidden bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/40 shadow-2xl backdrop-blur">
        <NetworkBackground fixed={false} />
        {/* decorative gradient blobs */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden />

        <div className="relative p-7 text-white md:p-12">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <LogoMark />
              <div>
                <div className="text-sm font-medium uppercase tracking-wide text-white/70">{t('landingKicker')}</div>
                <div className="text-3xl font-semibold leading-tight md:text-4xl">CREA3</div>
              </div>
            </div>
            <nav className="hidden items-center gap-1 md:flex" aria-label={t('ariaPrimary')}>
              <TopNav to="/workflow" label={t('landingNavWorkflow')} />
              <TopNav to="/partners" label={t('landingNavPartners')} />
              <TopNav to="/scope" label={t('landingNavScope')} />
              <TopNav to="/help" label={t('landingNavHelp')} />
            </nav>
          </div>

          <div className="mt-8 grid min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="min-w-0 max-w-xl">
              <h1 className="text-3xl font-semibold tracking-tight break-words sm:text-4xl md:text-5xl">{t('landingHeroTitle')}</h1>
              <p className="mt-4 text-lg text-white/80">{t('landingHeroBody')}</p>
              <p className="mt-3 text-sm leading-relaxed text-white/55">{t('landingHeroLead')}</p>

              <div className="mt-7 flex flex-wrap gap-2">
                <Link to={primaryCta.to}>
                  <Button className="px-5 py-2.5">{t(primaryCta.labelKey)}</Button>
                </Link>
                {user ? null : (
                  <Link to="/login">
                    <Button className="px-5 py-2.5">
                      {t('landingSignIn')}
                    </Button>
                  </Link>
                )}
                <Link to="/help">
                  <Button className="px-5 py-2.5">
                    {t('landingHowItWorks')}
                  </Button>
                </Link>
              </div>

              {metrics && (metrics.visits > 0 || metrics.registered_users > 0) ? (
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-4 sm:gap-8">
                  <Stat value={metrics.registered_users} label={t('landingStatUsers')} />
                  <Stat value={metrics.disputes ?? 0} label={t('landingStatDisputes')} />
                  <Stat value={metrics.visits} label={t('landingStatVisits')} />
                  <Stat value={9} label={t('landingStatPartners')} />
                </div>
              ) : null}

              <div className="mt-7 flex flex-wrap items-center gap-2">
                <HeroBadge icon={bi('M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z')} label={t('landingBadgeEu')} />
                <HeroBadge icon={bi('M8 9l-3 3 3 3M16 9l3 3-3 3M13 7l-2 10')} label={t('landingBadgeOpenSource')} />
                <HeroBadge icon={bi('M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3C9.5 5.7 9.5 18.3 12 21')} label={t('landingBadgeLangs')} />
                <HeroBadge icon={bi('M12 3a9 9 0 100 18 9 9 0 000-18zM12 6.5v.01M9 10h6M12 10v4l-1.5 3M12 14l1.5 3')} label={t('landingBadgeA11y')} />
              </div>
            </div>

            <div className="min-w-0 rounded-3xl border border-white/15 bg-white/5 p-3 md:p-4">
              <WorkflowCarousel />
            </div>
          </div>
        </div>
      </section>

      {/* VALUE PROPS — one crisp line each */}
      <section className="grid gap-4 md:grid-cols-3">
        <ValueCard
          icon={I('M9 11a3 3 0 100-6 3 3 0 000 6zM2 20a7 7 0 0114 0M17 11a3 3 0 10-1-5.8M22 20a7 7 0 00-5-6.7')}
          title={t('landingValParties')}
          body={t('landingValPartiesBody')}
        />
        <ValueCard
          icon={I('M12 3v18M5 7h14M7 7l-3 6a3 3 0 006 0L7 7zM17 7l-3 6a3 3 0 006 0l-3-6z')}
          title={t('landingValMediators')}
          body={t('landingValMediatorsBody')}
        />
        <ValueCard
          icon={I('M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9.5 12l1.8 1.8L15 10')}
          title={t('landingValGovernance')}
          body={t('landingValGovernanceBody')}
        />
      </section>

      {/* FEATURES — concrete platform capabilities */}
      <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-7 shadow-sm md:p-10">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold uppercase tracking-wide text-blue-700">{t('landingFeaturesKicker')}</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{t('landingFeaturesTitle')}</h2>
          <p className="mt-3 text-slate-600">{t('landingFeaturesBody')}</p>
        </div>

        <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Feature key={f.titleKey} icon={f.icon} title={t(f.titleKey)} body={t(f.bodyKey)} />
          ))}
        </div>
      </section>

      {/* PARTNERS — logo wall + interactive map of Europe */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55 shadow-2xl backdrop-blur">
        <div className="relative grid gap-8 p-7 text-white md:p-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="lg:self-center">
            <Pill className="border-sky-400/30 bg-sky-500/15 text-sky-200">{t('landingPartnersKicker')}</Pill>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t('landingPartnersTitle')}</h2>
            <p className="mt-3 max-w-md text-white/75">{t('landingPartnersBody')}</p>
            <Link to="/partners" className="mt-5 inline-block">
              <Button variant="ghost" className="border border-white/20 bg-white/10 px-5 py-2.5 text-white hover:bg-white/15">
                {t('landingSeeAllPartners')}
              </Button>
            </Link>

            {/* Static logo wall */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/90 p-4 shadow-inner">
              <img
                src="/partners.png"
                alt="Logos of the CREA3 partner institutions"
                className="mx-auto h-auto w-full max-w-md object-contain"
                loading="lazy"
              />
            </div>
          </div>

          <div className="mx-auto w-full max-w-xl lg:self-center">
            <EuropeMap />
          </div>
        </div>
      </section>

      {/* FINAL CTA — slim */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <div className="text-xl font-semibold">{t('landingReadyTitle')}</div>
          <div className="mt-1 text-sm text-slate-600">{t('landingReadyBody')}</div>
        </div>
        <div className="flex gap-2">
          <Link to={primaryCta.to}>
            <Button className="px-5 py-2.5">{t(primaryCta.labelKey)}</Button>
          </Link>
          {user ? null : (
            <Link to="/login">
              <Button variant="ghost" className="px-5 py-2.5">
                {t('landingSignIn')}
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* FUNDING — EU grant acknowledgement */}
      <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-7 shadow-sm md:p-9">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,260px)_1fr] lg:gap-10">
          {/* Logos + co-funding emblem */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <img src="/crea3.logo.png" alt="CREA3" className="h-14 w-14 rounded-xl border border-slate-200 object-contain p-1" />
              <div>
                <div className="text-lg font-semibold text-slate-900">CREA3</div>
                <div className="text-xs text-slate-500">{t('fundingKicker')}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <EuEmblem className="h-12 w-auto rounded-md" />
              <div className="mt-2 text-sm font-medium text-slate-800">{t('fundingCofunded')}</div>
              <div className="text-xs text-slate-500">{t('landingEcJust')}</div>
            </div>
          </div>

          {/* Grant details */}
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-blue-700">{t('fundingKicker')}</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{t('fundingProjectName')}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{t('fundingDescription')}</p>

            <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <FundingRow label={t('fundingGrantNo')} />
              <FundingRow label={t('fundingCall')} />
              <FundingRow label={t('fundingAmount')} />
              <FundingRow label={t('fundingDuration')} />
              <FundingRow label={t('fundingCoordinator')} wide />
              <FundingRow label={t('fundingRating')} wide />
            </dl>

            <p className="mt-5 max-w-3xl border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
              {t('fundingDisclaimer')}
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
      <HelpWidget />
    </div>
  )
}

function FundingRow({ label, wide = false }: { label: string; wide?: boolean }) {
  return (
    <div className={`flex items-start gap-2 text-sm text-slate-700 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-white md:text-3xl">{value.toLocaleString()}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  )
}

const bi = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

function HeroBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85">
      <span className="text-sky-300">{icon}</span>
      {label}
    </span>
  )
}

function TopNav({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
    >
      {label}
    </Link>
  )
}

function ValueCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">{icon}</div>
      <div className="mt-3 text-base font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  )
}

type FeatureDef = { icon: React.ReactNode; titleKey: I18nKey; bodyKey: I18nKey }

// Stroked, lucide-style glyphs (no extra dependency).
const I = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const FEATURES: FeatureDef[] = [
  { icon: I('M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9.5 12l1.8 1.8L15 10'), titleKey: 'featSecurityTitle', bodyKey: 'featSecurityBody' },
  { icon: I('M4 19V5m0 14h16M8 16l3-4 3 2 4-6'), titleKey: 'featProposalsTitle', bodyKey: 'featProposalsBody' },
  { icon: I('M7.5 8h9M7.5 12h6M21 12a8 8 0 01-8 8H5l-2 2V12a8 8 0 018-8h0a8 8 0 018 8z'), titleKey: 'featAssistantTitle', bodyKey: 'featAssistantBody' },
  { icon: I('M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3C9.5 5.7 9.5 18.3 12 21'), titleKey: 'featLangTitle', bodyKey: 'featLangBody' },
  { icon: I('M7 3h7l5 5v13H7zM14 3v5h5M9.5 13h5M9.5 16.5h5'), titleKey: 'featAuditTitle', bodyKey: 'featAuditBody' },
  { icon: I('M3 6h12v12H3zM15 10l6-3v10l-6-3'), titleKey: 'featMediationTitle', bodyKey: 'featMediationBody' },
]

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        {icon}
      </div>
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
      </div>
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
  { id: 1, titleKey: 'landingWorkflowStep1Title', descriptionKey: 'landingWorkflowStep1Desc', imageSrc: '/workflow/dispute.png', imageAltKey: 'landingWorkflowStep1Title' },
  { id: 2, titleKey: 'landingWorkflowStep2Title', descriptionKey: 'landingWorkflowStep2Desc', imageSrc: '/workflow/invite-party.webp', imageAltKey: 'landingWorkflowStep2Title' },
  { id: 3, titleKey: 'landingWorkflowStep3Title', descriptionKey: 'landingWorkflowStep3Desc', imageSrc: '/workflow/mediation-strategy.webp', imageAltKey: 'landingWorkflowStep3Title' },
  { id: 4, titleKey: 'landingWorkflowStep4Title', descriptionKey: 'landingWorkflowStep4Desc', imageSrc: '/workflow/proposal.webp', imageAltKey: 'landingWorkflowStep4Title' },
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
    [t],
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
    }, 5000)
  }, [stop, total])

  const step = useCallback(
    (delta: number) => {
      setActive((i) => (i + delta + total) % total)
      start()
    },
    [start, total],
  )

  const goTo = useCallback(
    (index: number) => {
      setActive(((index % total) + total) % total)
      start()
    },
    [start, total],
  )

  useEffect(() => {
    start()
    return stop
  }, [start, stop])

  const onWheel = (e: React.WheelEvent) => {
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
      aria-label={t('ariaCarousel')}
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
        <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${active * 100}%)` }}>
          {slides.map((s, i) => (
            <div key={s.id} className="w-full shrink-0">
              <div className="relative h-80 md:h-[34rem]">
                <img src={s.imageSrc} alt={s.imageAlt} className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                  <div className="text-xl font-semibold leading-snug text-white md:text-2xl">{s.title}</div>
                  <Pill className="border border-white/15 bg-white/10 text-white/80">
                    {i + 1} / {total}
                  </Pill>
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
              className={`h-2 w-2 rounded-full transition-all ${i === active ? 'scale-110 bg-white/80' : 'bg-white/25 hover:bg-white/40'}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="h-9 w-9 rounded-full border border-white/15 bg-white/10 p-0 text-white hover:bg-white/15"
            onClick={() => step(-1)}
            aria-label={t('ariaPrev')}
          >
            ‹
          </Button>
          <Button
            variant="ghost"
            className="h-9 w-9 rounded-full border border-white/15 bg-white/10 p-0 text-white hover:bg-white/15"
            onClick={() => step(1)}
            aria-label={t('ariaNext')}
          >
            ›
          </Button>
        </div>
      </div>
    </div>
  )
}
