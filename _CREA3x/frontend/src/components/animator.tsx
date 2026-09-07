import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { load as yamlLoad } from 'js-yaml'

/**
 * GSAP-driven entrance animations, configured by `public/animation.yaml`.
 *
 * The YAML is fetched at runtime (edit + reload, no rebuild). Per-browser
 * overrides from Settings ⚙ → Animation are merged on top. Accessibility always
 * wins: when "Stop animations" (html.rm) or the OS reduced-motion preference is
 * on, nothing animates and elements are shown immediately.
 */

export type TargetCfg = {
  enabled: number | boolean
  selector: string
  effect: string
  duration?: number
  delay?: number
  stagger?: number
  distance?: number
  ease?: string
  once?: boolean
}

export type AnimConfig = {
  animation: number | boolean
  defaults: Required<Pick<TargetCfg, 'duration' | 'delay' | 'stagger' | 'distance' | 'ease'>> & { once: boolean }
  targets: Record<string, TargetCfg>
}

export const EFFECTS = ['fade', 'rise', 'fall', 'slide-left', 'slide-right', 'zoom', 'flip-x'] as const
export const EASES = [
  'power1.out', 'power2.out', 'power3.out', 'power4.out',
  'back.out(1.4)', 'expo.out', 'circ.out', 'sine.out', 'elastic.out(1, 0.6)',
] as const

const LS_OVERRIDES = 'crea3_anim_overrides_v1'

const FALLBACK: AnimConfig = {
  animation: 1,
  defaults: { duration: 0.55, delay: 0, stagger: 0.06, distance: 24, ease: 'sine.out', once: true },
  targets: {
    cards: { enabled: 1, selector: '.MuiPaper-outlined.MuiPaper-rounded', effect: 'fall' },
    header: { enabled: 1, selector: "[data-anim='header']", effect: 'fall' },
    headerItems: { enabled: 1, selector: "[data-anim='header'] > *", effect: 'fall' },
    dialogs: { enabled: 1, selector: '.MuiDialog-paper', effect: 'zoom', once: false },
  },
}

/** from-vars for each effect (GSAP animates FROM these to the natural state). */
function fromVars(effect: string, d: number): gsap.TweenVars {
  switch (effect) {
    case 'rise': return { opacity: 0, y: d }
    case 'fall': return { opacity: 0, y: -d }
    case 'slide-right': return { opacity: 0, x: -d }
    case 'slide-left': return { opacity: 0, x: d }
    case 'zoom': return { opacity: 0, scale: 0.96 }
    case 'flip-x': return { opacity: 0, rotationX: -12, transformPerspective: 600 }
    case 'fade':
    default: return { opacity: 0 }
  }
}

type Ctx = {
  cfg: AnimConfig
  fileCfg: AnimConfig
  setTarget: (name: string, patch: Partial<TargetCfg>) => void
  setMaster: (on: boolean) => void
  setDefaults: (patch: Partial<AnimConfig['defaults']>) => void
  applyConfig: (next: AnimConfig) => void
  resetToFile: () => void
}
const C = createContext<Ctx | null>(null)

export function useAnimations(): Ctx {
  const ctx = useContext(C)
  if (!ctx) throw new Error('useAnimations must be used inside AnimationProvider')
  return ctx
}

function mergeOverrides(base: AnimConfig, ov: any): AnimConfig {
  if (!ov || typeof ov !== 'object') return base
  const out: AnimConfig = {
    animation: ov.animation ?? base.animation,
    defaults: { ...base.defaults, ...(ov.defaults || {}) },
    targets: { ...base.targets },
  }
  for (const [k, v] of Object.entries(ov.targets || {})) {
    out.targets[k] = { ...(base.targets[k] || ({} as TargetCfg)), ...(v as object) } as TargetCfg
  }
  return out
}

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  const [fileCfg, setFileCfg] = useState<AnimConfig>(FALLBACK)
  const [cfg, setCfg] = useState<AnimConfig>(FALLBACK)

  // Load the YAML once, then apply any per-browser overrides.
  useEffect(() => {
    let alive = true
    ;(async () => {
      let base = FALLBACK
      try {
        const res = await fetch('/animation.yaml', { cache: 'no-cache' })
        if (res.ok) {
          const parsed = yamlLoad(await res.text()) as AnimConfig
          if (parsed && typeof parsed === 'object') {
            base = { ...FALLBACK, ...parsed, defaults: { ...FALLBACK.defaults, ...(parsed.defaults || {}) } }
          }
        }
      } catch { /* keep the built-in fallback */ }
      if (!alive) return
      setFileCfg(base)
      let ov: any = null
      try { ov = JSON.parse(localStorage.getItem(LS_OVERRIDES) || 'null') } catch { /* ignore */ }
      setCfg(mergeOverrides(base, ov))
    })()
    return () => { alive = false }
  }, [])

  function persist(next: AnimConfig) {
    setCfg(next)
    try {
      localStorage.setItem(LS_OVERRIDES, JSON.stringify({
        animation: next.animation, defaults: next.defaults, targets: next.targets,
      }))
    } catch { /* ignore */ }
  }

  const api: Ctx = {
    cfg, fileCfg,
    setMaster: (on) => persist({ ...cfg, animation: on ? 1 : 0 }),
    setDefaults: (patch) => persist({ ...cfg, defaults: { ...cfg.defaults, ...patch } }),
    setTarget: (name, patch) => persist({
      ...cfg,
      targets: { ...cfg.targets, [name]: { ...(cfg.targets[name] || ({} as TargetCfg)), ...patch } },
    }),
    applyConfig: (next) => persist({
      animation: next?.animation ?? cfg.animation,
      defaults: { ...cfg.defaults, ...(next?.defaults || {}) },
      targets: { ...cfg.targets, ...(next?.targets || {}) },
    }),
    resetToFile: () => { try { localStorage.removeItem(LS_OVERRIDES) } catch { /* ignore */ }; setCfg(fileCfg) },
  }

  return (
    <C.Provider value={api}>
      {children}
      <Animator />
    </C.Provider>
  )
}

/** Runs the tweens on mount and on every route change. */
function Animator() {
  const { cfg } = useAnimations()
  const loc = useLocation()
  const played = useRef<Set<string>>(new Set())
  const visit = useRef(0)

  useEffect(() => {
    const reduced =
      document.documentElement.classList.contains('rm') ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (reduced || !Number(cfg.animation)) return

    // Let the route's DOM paint first, then reveal it.
    // Each navigation (or config change) is a NEW visit, so `once` guards only
    // against double-running inside the same visit — revisiting a route, or
    // reloading the tab, animates again.
    visit.current += 1
    const myVisit = visit.current
    const id = window.setTimeout(() => {
      const D = cfg.defaults
      for (const [name, tRaw] of Object.entries(cfg.targets || {})) {
        const t = tRaw as TargetCfg
        if (!Number(t.enabled)) continue
        const once = t.once ?? D.once
        const key = `${myVisit}::${loc.pathname}::${name}`
        if (once && played.current.has(key)) continue

        let nodes: Element[] = []
        try { nodes = Array.from(document.querySelectorAll(t.selector)) } catch { continue }
        if (!nodes.length) continue
        played.current.add(key)

        gsap.fromTo(
          nodes,
          fromVars(t.effect || 'fade', Number(t.distance ?? D.distance)),
          {
            opacity: 1, x: 0, y: 0, scale: 1, rotationX: 0,
            duration: Number(t.duration ?? D.duration),
            delay: Number(t.delay ?? D.delay),
            stagger: Number(t.stagger ?? D.stagger),
            ease: String(t.ease ?? D.ease),
            overwrite: 'auto',
            clearProps: 'transform,opacity',
          },
        )
      }
    }, 30)
    return () => window.clearTimeout(id)
  }, [loc.pathname, cfg])

  return null
}
