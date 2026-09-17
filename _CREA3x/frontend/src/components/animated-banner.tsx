import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'

/**
 * Home-page banner: the five animated CREA3 illustrations, shown as a
 * crossfading carousel.
 *
 * The SVGs (public/banner/*.svg) carry their own CSS keyframe animations. They
 * are fetched once and INLINED rather than loaded through <img>, because an
 * <img> is a sealed document: nothing on the page can pause it. Inline, the
 * site's reduced-motion rules (the accessibility "Stop animations" toggle and
 * the OS preference) freeze them like any other animation — WCAG 2.2.2.
 * Every file's classes / keyframes / ids are prefixed per file (b01-…, b02-…)
 * so the five stylesheets never collide once they share one document.
 *
 * The SVGs carry NO text: the heading / subtitle that used to be drawn inside
 * each file (top 86px strip) lives in a translucent overlay box rendered here,
 * so it is localized like the rest of the site and slides in with each
 * illustration. The illustrations' own animations are untouched.
 */

type Slide = { id: string; src: string; titleKey: string; captionKey: string; headingKey: string; subKey: string }

const SLIDES: Slide[] = [
  { id: 'crea3',       src: '/banner/01_crea3.svg',            titleKey: 'bannerCrea3Title',    captionKey: 'bannerCrea3Caption',   headingKey: 'bannerCrea3Heading',   subKey: 'bannerCrea3Sub' },
  { id: 'balance',     src: '/banner/02_bilancia_equita.svg',  titleKey: 'bannerBalanceTitle',  captionKey: 'bannerBalanceCaption', headingKey: 'bannerBalanceHeading', subKey: 'bannerBalanceSub' },
  { id: 'complexity',  src: '/banner/03_cubo_complessita.svg', titleKey: 'bannerCubeTitle',     captionKey: 'bannerCubeCaption',    headingKey: 'bannerCubeHeading',    subKey: 'bannerCubeSub' },
  { id: 'pieces',      src: '/banner/04_tessere_incastro.svg', titleKey: 'bannerPiecesTitle',   captionKey: 'bannerPiecesCaption',  headingKey: 'bannerPiecesHeading',  subKey: 'bannerPiecesSub' },
  { id: 'bridge',      src: '/banner/05_ponte_accordo.svg',    titleKey: 'bannerBridgeTitle',   captionKey: 'bannerBridgeCaption',  headingKey: 'bannerBridgeHeading',  subKey: 'bannerBridgeSub' },
]

const INTERVAL_MS = 7000

/** Strip anything that must not be injected, keep the <svg> element only. */
function sanitize(svg: string): string {
  const start = svg.indexOf('<svg')
  const end = svg.lastIndexOf('</svg>')
  if (start < 0 || end < 0) return ''
  return svg
    .slice(start, end + 6)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    // fill the slide box; the files declare width="100%" but no height. The
    // overlay box (below) is the accessible text, so the drawing is decorative.
    .replace(/<svg\b/, '<svg preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="width:100%;height:100%;display:block"')
}

function prefersReducedMotion(): boolean {
  try {
    return document.documentElement.classList.contains('rm') ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch { return false }
}

export default function AnimatedBanner() {
  const { t } = useI18n()
  const [markup, setMarkup] = useState<Record<string, string>>({})
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const timer = useRef<number | null>(null)
  const touchX = useRef<number | null>(null)
  const total = SLIDES.length

  // Fetch all five once; a failed file simply shows nothing for that slide.
  useEffect(() => {
    let alive = true
    Promise.all(
      SLIDES.map((s) =>
        fetch(s.src).then((r) => (r.ok ? r.text() : '')).catch(() => '').then((txt) => [s.id, sanitize(txt)] as const),
      ),
    ).then((pairs) => { if (alive) setMarkup(Object.fromEntries(pairs)) })
    return () => { alive = false }
  }, [])

  const go = useCallback((i: number) => setActive(((i % total) + total) % total), [total])

  // Auto-advance, unless the visitor asked for less motion or is interacting.
  useEffect(() => {
    if (paused || prefersReducedMotion()) return
    timer.current = window.setInterval(() => setActive((i) => (i + 1) % total), INTERVAL_MS)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [paused, total])

  const slides = useMemo(() => SLIDES.map((s) => ({
    ...s,
    title: t(s.titleKey as any),
    caption: t(s.captionKey as any),
    heading: t(s.headingKey as any),
    sub: t(s.subKey as any),
  })), [t])
  const current = slides[active]

  return (
    <div
      className="crea3-banner relative min-w-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null }}
      onTouchEnd={(e) => {
        const x0 = touchX.current, x1 = e.changedTouches[0]?.clientX
        touchX.current = null
        if (x0 == null || x1 == null) return
        if (x1 - x0 > 40) go(active - 1)
        else if (x0 - x1 > 40) go(active + 1)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1) }
      }}
      role="region"
      aria-roledescription="carousel"
      aria-label={t('bannerAria' as any)}
      tabIndex={0}
    >
      {/* Slide stage — a fixed aspect box so the layout never jumps between
          illustrations of different heights; each SVG scales to fit inside. */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-[#FAFAF7]" style={{ aspectRatio: '680 / 506' }}>
        {slides.map((s, i) => (
          <div
            key={s.id}
            className="absolute inset-0 transition-opacity duration-700 ease-out"
            style={{ opacity: i === active ? 1 : 0, pointerEvents: i === active ? 'auto' : 'none' }}
            aria-hidden={i !== active}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${total}: ${s.title}`}
          >
            {markup[s.id] ? (
              <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: markup[s.id] }} />
            ) : (
              <div className="h-full w-full animate-pulse rounded-2xl bg-white/10" />
            )}
          </div>
        ))}

        {/* Text overlay — translucent box over the (now empty) title strip of
            the illustration. Keyed by slide so it re-mounts and slides in on
            every change; the keyframe lives in index.css and is disabled under
            reduced motion. Sizes step up with the viewport so it fits a phone. */}
        <div
          key={current.id}
          className="crea3-banner-text pointer-events-none absolute left-[4%] right-[4%] top-[3%] rounded-xl border border-white/70 bg-white/75 px-3 py-2 text-center shadow-sm backdrop-blur-sm sm:left-[7%] sm:right-[7%] sm:px-5 sm:py-3"
        >
          <div className="text-sm font-semibold leading-tight text-slate-900 sm:text-lg md:text-xl">{current.heading}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-600 sm:mt-1 sm:text-sm">{current.sub}</div>
        </div>
      </div>

      {/* Caption + controls */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{current.title}</div>
          <div className="truncate text-xs text-white/65">{current.caption}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => go(active - 1)} aria-label={t('bannerPrev' as any)}
            className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-sm text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">‹</button>
          <div className="flex items-center gap-1.5 px-1" role="tablist" aria-label={t('bannerAria' as any)}>
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={s.title}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  i === active ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
          <button type="button" onClick={() => go(active + 1)} aria-label={t('bannerNext' as any)}
            className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-sm text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">›</button>
        </div>
      </div>
    </div>
  )
}
