import React, { useEffect, useId, useState } from 'react'
import { COUNTRIES, PINS, MAP_VIEWBOX, type Pin } from '../data/europe-map'

const [, , VIEW_W, VIEW_H] = MAP_VIEWBOX.split(' ').map(Number)
const LEAD = PINS.find((p) => p.lead) ?? PINS[0]
const pct = (n: number, total: number) => `${(n / total) * 100}%`
const COUNTRY_COUNT = new Set(PINS.map((p) => p.country)).size

// Cache resolved building photos across opens so re-selecting a pin is instant.
// Value: image URL, or null when none/failed (so we don't refetch).
const imgCache = new Map<string, string | null>()

function useWikiImage(title: string, enabled: boolean): string | null {
  const [src, setSrc] = useState<string | null>(() => imgCache.get(title) ?? null)
  useEffect(() => {
    if (!enabled || !title) return
    if (imgCache.has(title)) {
      setSrc(imgCache.get(title) ?? null)
      return
    }
    let cancelled = false
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { accept: 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        const url: string | null = d?.thumbnail?.source || d?.originalimage?.source || null
        imgCache.set(title, url)
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        imgCache.set(title, null)
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [title, enabled])
  return src
}

/** Always-present placeholder behind the photo: gradient + building glyph + city. */
function BuildingArtwork({ city }: { city: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-slate-800 to-slate-950">
      <svg viewBox="0 0 64 64" className="h-10 w-10 text-white/25" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M6 56h52M10 56V26l14-9 14 9v30M44 56V32l10-6 4 3v27M16 30h4M16 38h4M28 30h4M28 38h4M22 56v-8h4v8" />
      </svg>
      <span className="absolute bottom-1.5 left-2 text-[10px] font-medium uppercase tracking-wide text-white/30">{city}</span>
    </div>
  )
}

/**
 * CREA3 partner network across Europe.
 * Geographically accurate (Mercator) country outlines with interactive pins.
 * Hover, tap, or focus a city to see the partner institution(s) and a photo of the site.
 */
export default function EuropeMap({ className = '' }: { className?: string }) {
  const [active, setActive] = useState<number | null>(null)
  const gid = useId().replace(/:/g, '')
  const total = PINS.reduce((n, p) => n + p.members.length, 0)

  return (
    <div className={className}>
      <div className="relative w-full">
        <svg
          viewBox={MAP_VIEWBOX}
          className="block h-auto w-full"
          role="img"
          aria-label={`Map of Europe showing ${PINS.length} cities hosting ${total} CREA3 partner institutions.`}
        >
          <defs>
            <radialGradient id={`${gid}-sea`} cx="42%" cy="34%" r="85%">
              <stop offset="0%" stopColor="#0b1830" />
              <stop offset="100%" stopColor="#070d1c" />
            </radialGradient>
            <linearGradient id={`${gid}-land`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#243149" />
              <stop offset="100%" stopColor="#1a2336" />
            </linearGradient>
            <linearGradient id={`${gid}-host`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2f5fb0" />
              <stop offset="100%" stopColor="#1e3f7e" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={`url(#${gid}-sea)`} />

          {COUNTRIES.map((c) => (
            <path
              key={c.name}
              d={c.d}
              fill={c.partner ? `url(#${gid}-host)` : `url(#${gid}-land)`}
              stroke={c.partner ? '#5b8def' : '#0b1220'}
              strokeWidth={c.partner ? 1 : 0.8}
              strokeLinejoin="round"
            />
          ))}

          {/* Consortium network: faint spokes from every partner city to the lead. */}
          <g stroke="#7dd3fc" fill="none" strokeLinecap="round">
            {PINS.filter((p) => p !== LEAD).map((p) => (
              <line
                key={`${p.city}-link`}
                x1={LEAD.x}
                y1={LEAD.y}
                x2={p.x}
                y2={p.y}
                strokeWidth={active !== null && PINS[active] === p ? 2 : 1}
                strokeOpacity={active !== null && PINS[active] === p ? 0.85 : 0.28}
                className="crea3-spoke"
              />
            ))}
          </g>
        </svg>

        {/* Interactive pins + tooltips as an HTML overlay aligned to the SVG box. */}
        <div className="absolute inset-0">
          {PINS.map((pin, i) => (
            <PinMarker
              key={`${pin.city}-${pin.country}`}
              pin={pin}
              active={active === i}
              onEnter={() => setActive(i)}
              onLeave={() => setActive((cur) => (cur === i ? null : cur))}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-white/55">
        {PINS.length} cities · {total} partner institutions across {COUNTRY_COUNT} countries. Select a marker to
        see the institution and a photo of the site.
      </p>

      <style>{`
        @keyframes crea3-ping { 0% { transform: scale(1); opacity: .55 } 80%,100% { transform: scale(2.4); opacity: 0 } }
        @keyframes crea3-dash { to { stroke-dashoffset: -24 } }
        .crea3-spoke { stroke-dasharray: 4 8; animation: crea3-dash 1.6s linear infinite }
        html.rm .crea3-spoke { animation: none }
        html.rm .crea3-pulse { animation: none }
      `}</style>
    </div>
  )
}

function PinMarker({
  pin,
  active,
  onEnter,
  onLeave,
}: {
  pin: Pin
  active: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  const size = pin.lead ? 18 : 13
  const label = `${pin.city}, ${pin.country} — ${pin.members.length} partner${pin.members.length > 1 ? 's' : ''}`
  // Flip the tooltip to the left when the pin sits in the right third of the map.
  const flipLeft = pin.x / VIEW_W > 0.62
  // Open downward only for pins very near the top edge.
  const below = pin.y / VIEW_H < 0.14

  const photo = useWikiImage(pin.wiki, active)

  return (
    <div
      className="absolute"
      style={{ left: pct(pin.x, VIEW_W), top: pct(pin.y, VIEW_H), zIndex: active ? 30 : undefined }}
    >
      <div className="absolute -translate-x-1/2 -translate-y-1/2">
        <button
          type="button"
          aria-label={label}
          aria-expanded={active}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onFocus={onEnter}
          onBlur={onLeave}
          onClick={onEnter}
          className="group relative grid place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          style={{ width: size + 14, height: size + 14 }}
        >
          {/* pulse halo */}
          <span
            className="crea3-pulse absolute rounded-full bg-sky-400/50"
            style={{ width: size, height: size, animation: 'crea3-ping 2.8s ease-out infinite' }}
          />
          {/* dot */}
          <span
            className={`relative rounded-full border-2 ${
              pin.lead ? 'border-sky-300 bg-slate-50' : 'border-sky-400 bg-slate-50'
            } shadow-[0_0_12px_rgba(56,189,248,0.8)] transition-transform duration-150 ${
              active ? 'scale-125' : 'group-hover:scale-110'
            }`}
            style={{ width: size, height: size }}
          />
          {pin.members.length > 1 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sky-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-slate-900">
              {pin.members.length}
            </span>
          )}
        </button>

        {active && (
          <div
            role="tooltip"
            className={`absolute z-20 w-64 overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 text-left shadow-2xl backdrop-blur ${
              below ? 'top-4' : 'bottom-4'
            } ${flipLeft ? 'right-2' : 'left-2'}`}
          >
            {/* Photo of the institution / city (live, with graceful fallback) */}
            <div className="relative h-28 w-full">
              <BuildingArtwork city={pin.city} />
              {photo && (
                <img
                  src={photo}
                  alt={`${pin.members[0]?.short ?? pin.city}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              )}
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/95 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
                <span className="text-sm font-semibold text-white drop-shadow">{pin.city}</span>
                <span className="text-xs text-white/70">{pin.country}</span>
                {pin.lead && (
                  <span className="ml-auto rounded-full bg-sky-500/30 px-2 py-0.5 text-[10px] font-medium text-sky-100 ring-1 ring-sky-400/40">
                    Lead
                  </span>
                )}
              </div>
            </div>

            <ul className="space-y-2 p-3">
              {pin.members.map((m) => (
                <li key={m.name}>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="-mx-2 block rounded-lg px-2 py-1 transition hover:bg-white/5"
                  >
                    <span className="block text-sm font-medium leading-snug text-white/90">{m.short}</span>
                    <span className="block text-[11px] text-sky-300/80">{m.type} ↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
