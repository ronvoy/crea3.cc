import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  IconButton,
  Divider,
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useI18n, type I18nKey } from '../i18n'
import SiteFooter from '../components/site-footer'
import PublicChat from '../components/public-chat'
import { api } from '../api/client'
import { useAuth } from '../store/auth'

const ROBOT = "'Orbitron', ui-sans-serif, system-ui, sans-serif"

function LogoMark() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <Box
        sx={{
          height: 48,
          width: 48,
          borderRadius: 2,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontFamily: ROBOT,
        }}
      >
        C3
      </Box>
    )
  }
  return (
    <Box
      component="img"
      src="/crea3.logo.png"
      alt="CREA3 logo"
      onError={() => setFailed(true)}
      sx={{ height: 48, width: 48, borderRadius: 2, objectFit: 'contain' }}
    />
  )
}

export default function Landing() {
  const { user } = useAuth()

  useEffect(() => {
    api('/api/metrics/visit', { method: 'POST' }).catch(() => {})
    api('/api/metrics/summary').catch(() => {})
  }, [])

  const primaryCta = useMemo(() => {
    return user ? { label: 'Go to Home', to: '/app' } : { label: 'Create an account', to: '/register' }
  }, [user])

  const valueProps = [
    {
      title: 'For parties',
      subtitle: 'Transparent, structured, and negotiable.',
      points: [
        'Review the goods list and submit what matters most.',
        'Save strategy notes for mediator review.',
        'Accept the proposal or proceed to mediation.',
      ],
    },
    {
      title: 'For mediators',
      subtitle: 'Read-only visibility across stages.',
      points: [
        'View context, goods, strategies, and preferences.',
        'Review proposal metrics and guide negotiations.',
        'Coordinate conference planning without editing records.',
      ],
    },
    {
      title: 'Governance',
      subtitle: 'Auditable steps for a clean record.',
      points: [
        'Access controlled by participation and role.',
        'Generate a report once the outcome is accepted.',
        'Swap in your game-theory engine when ready.',
      ],
    },
  ]

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 } }}>
        {/* ── Brand row ───────────────────────────────────────────────────── */}
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: { xs: 5, md: 8 } }}>
          <LogoMark />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Online dispute resolution platform
            </Typography>
            <Typography variant="h4" sx={{ fontFamily: ROBOT, fontWeight: 700, letterSpacing: '0.04em' }}>
              CREA3
            </Typography>
          </Box>
          <Stack
            direction="row"
            spacing={2.5}
            sx={{ display: { xs: 'none', md: 'flex' } }}
            aria-hidden
          >
            {['Bids', 'Rates', 'Mediation'].map((tag) => (
              <Typography
                key={tag}
                variant="body2"
                color="text.secondary"
                sx={{ fontFamily: ROBOT, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                {tag}
              </Typography>
            ))}
          </Stack>
        </Stack>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 5, md: 6 },
            gridTemplateColumns: { md: '1.1fr 0.9fr' },
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography
              variant="h2"
              sx={{
                fontFamily: ROBOT,
                fontWeight: 700,
                letterSpacing: '0.01em',
                lineHeight: 1.15,
                fontSize: { xs: '2rem', md: '2.85rem' },
              }}
            >
              Manage disputes through a structured and transparent negotiation workflow.
            </Typography>

            <Typography color="text.secondary" sx={{ mt: 3, fontSize: { xs: '1rem', md: '1.125rem' }, maxWidth: 620 }}>
              Invite participants by email, gather strategy notes and preferences, generate an
              evidence-based proposal, and—when necessary—transition to structured mediation with
              conferencing support.
            </Typography>

            <Stack direction="row" spacing={1.5} flexWrap="wrap" sx={{ mt: 4, gap: 1.5 }}>
              <Button component={RouterLink} to={primaryCta.to} variant="contained" size="large">
                {primaryCta.label}
              </Button>
              {user ? null : (
                <Button component={RouterLink} to="/login" variant="outlined" color="inherit" size="large">
                  Sign in
                </Button>
              )}
              <Button component={RouterLink} to="/help" variant="text" color="inherit" size="large">
                How it works
              </Button>
            </Stack>

            <Stack sx={{ mt: 4 }} spacing={1}>
              {[
                'Email invitations and notifications',
                'Strategy notes and preference submission',
                'Conference support for mediation',
              ].map((line) => (
                <Typography key={line} variant="body2" color="text.secondary">
                  — {line}
                </Typography>
              ))}
            </Stack>
          </Box>

          <WorkflowCarousel />
        </Box>

        {/* ── Value props (open, no boxes) ────────────────────────────────── */}
        <Divider sx={{ my: { xs: 6, md: 8 } }} />
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 5, md: 6 },
            gridTemplateColumns: { md: 'repeat(3, 1fr)' },
          }}
        >
          {valueProps.map((vp) => (
            <Box key={vp.title}>
              <Typography variant="h6" sx={{ fontFamily: ROBOT, fontWeight: 600 }}>
                {vp.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {vp.subtitle}
              </Typography>
              <Stack spacing={1} sx={{ mt: 2 }}>
                {vp.points.map((p) => (
                  <Typography key={p} variant="body2" color="text.secondary">
                    — {p}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ))}
        </Box>

        {/* ── Closing CTA (open) ──────────────────────────────────────────── */}
        <Divider sx={{ my: { xs: 6, md: 8 } }} />
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ md: 'center' }}
          justifyContent="space-between"
          spacing={3}
        >
          <Box>
            <Typography variant="h5" sx={{ fontFamily: ROBOT, fontWeight: 600 }}>
              Ready to begin?
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Create an account, verify your email address, and sign in to access the platform.
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2 }}>
              Partners
            </Typography>
            <Box
              component="img"
              src="/partners.png"
              alt="Partners"
              loading="lazy"
              sx={{ mt: 1, height: 32, width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
            />
          </Box>
          <Stack direction="row" spacing={1.5}>
            <Button component={RouterLink} to={primaryCta.to} variant="contained" size="large">
              {primaryCta.label}
            </Button>
            {user ? null : (
              <Button component={RouterLink} to="/login" variant="text" color="inherit" size="large">
                Sign in
              </Button>
            )}
          </Stack>
        </Stack>

        <SiteFooter />
      </Container>

      {/* Public legal assistant */}
      <PublicChat />
    </Box>
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
    imageAltKey: 'landingWorkflowStep1Title',
  },
  {
    id: 2,
    titleKey: 'landingWorkflowStep2Title',
    descriptionKey: 'landingWorkflowStep2Desc',
    imageSrc: '/workflow/invite-party.webp',
    imageAltKey: 'landingWorkflowStep2Title',
  },
  {
    id: 3,
    titleKey: 'landingWorkflowStep3Title',
    descriptionKey: 'landingWorkflowStep3Desc',
    imageSrc: '/workflow/mediation-strategy.webp',
    imageAltKey: 'landingWorkflowStep3Title',
  },
  {
    id: 4,
    titleKey: 'landingWorkflowStep4Title',
    descriptionKey: 'landingWorkflowStep4Desc',
    imageSrc: '/workflow/proposal.webp',
    imageAltKey: 'landingWorkflowStep4Title',
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
      start()
    },
    [start, total]
  )

  const goTo = useCallback(
    (index: number) => {
      setActive(((index % total) + total) % total)
      start()
    },
    [start, total]
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
    <Box
      sx={{ userSelect: 'none' }}
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontFamily: ROBOT, fontWeight: 600 }}>
          {t('landingWorkflowHeading')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
          {t('landingWorkflowHint')}
        </Typography>
      </Stack>

      <Box sx={{ overflow: 'hidden', borderRadius: 3 }}>
        <Box
          sx={{
            display: 'flex',
            transition: 'transform 0.7s ease',
            transform: `translateX(-${active * 100}%)`,
          }}
        >
          {slides.map((s, i) => (
            <Box key={s.id} sx={{ width: '100%', flexShrink: 0 }}>
              <Box sx={{ position: 'relative', height: { xs: 200, md: 240 } }}>
                <Box
                  component="img"
                  src={s.imageSrc}
                  alt={s.imageAlt}
                  loading="lazy"
                  sx={{ height: '100%', width: '100%', objectFit: 'cover', display: 'block' }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.1) 55%, transparent)',
                  }}
                />
                <Box sx={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
                  <Typography sx={{ color: '#fff', fontWeight: 600 }}>
                    {s.title} · {i + 1} / {total}
                  </Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* description for the active slide */}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2, minHeight: 40 }}>
        {slides[active]?.description}
      </Typography>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {slides.map((_, i) => (
            <Box
              key={i}
              component="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => goTo(i)}
              sx={{
                p: 0,
                border: 'none',
                cursor: 'pointer',
                height: 8,
                width: 8,
                borderRadius: '50%',
                transition: 'all 0.2s',
                bgcolor: i === active ? 'primary.main' : 'action.disabled',
              }}
            />
          ))}
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" onClick={() => step(-1)} aria-label="Previous step">
            <ChevronLeftIcon />
          </IconButton>
          <IconButton size="small" onClick={() => step(1)} aria-label="Next step">
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      </Stack>
    </Box>
  )
}
