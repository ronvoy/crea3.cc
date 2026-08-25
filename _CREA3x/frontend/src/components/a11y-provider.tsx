import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
type FontScale = 100 | 112 | 125 | 150
type Scheme = 'default' | 'dark' | 'light' | 'hc'
type Saturation = 'normal' | 'high' | 'low' | 'mono'
type LetterSpacing = 'normal' | 'wide' | 'xwide' | 'ultra'
type LineHeight = 'normal' | 'generous' | 'double'
type Cursor = 'default' | 'black' | 'white'

export type A11yPrefs = {
  scheme: Scheme
  saturation: Saturation
  readableFont: boolean
  highlightHeadings: boolean
  magnifier: boolean
  contentScale: number          // 90..130
  letterSpacing: LetterSpacing
  lineHeight: LineHeight
  muteSounds: boolean
  readingGuide: boolean
  readingMask: boolean
  stopAnimations: boolean
  hoverHighlight: boolean
  focusHighlight: boolean
  cursor: Cursor
  textColor: string
  headingColor: string
  bgColor: string
}

const DEFAULT_PREFS: A11yPrefs = {
  scheme: 'default', saturation: 'normal', readableFont: false, highlightHeadings: false,
  magnifier: false, contentScale: 100, letterSpacing: 'normal', lineHeight: 'normal',
  muteSounds: false, readingGuide: false, readingMask: false, stopAnimations: false,
  hoverHighlight: false, focusHighlight: false, cursor: 'default',
  textColor: '', headingColor: '', bgColor: '',
}

type A11yState = {
  // Back-compat fields (read by theme.tsx, settings.tsx, accessibility-menu.tsx)
  highContrast: boolean
  reduceMotion: boolean
  lightMode: boolean
  fontScale: FontScale
  setHighContrast: (v: boolean) => void
  setReduceMotion: (v: boolean) => void
  setLightMode: (v: boolean) => void
  setFontScale: (v: FontScale) => void
  // Full accessibility preference set
  prefs: A11yPrefs
  setPref: <K extends keyof A11yPrefs>(key: K, value: A11yPrefs[K]) => void
  reset: () => void
  announce: (msg: string) => void
}

const Ctx = createContext<A11yState | null>(null)

const LS_FS = 'crea3_a11y_font_scale'
const LS_PREFS = 'crea3_a11y_prefs'

function parseBool(v: string | null) {
  if (v === null) return null
  return v === '1' || v.toLowerCase() === 'true'
}
function clampFont(v: number): FontScale {
  if (v >= 150) return 150
  if (v >= 125) return 125
  if (v >= 112) return 112
  return 100
}

export function A11yProvider({ children }: { children: React.ReactNode }) {
  const prefersReduce = useMemo(() => {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
  }, [])

  const [fontScale, setFontScale] = useState<FontScale>(() => {
    const raw = localStorage.getItem(LS_FS)
    const n = raw ? Number(raw) : 100
    return clampFont(Number.isFinite(n) ? n : 100)
  })
  const [prefs, setPrefs] = useState<A11yPrefs>(() => {
    try {
      const raw = localStorage.getItem(LS_PREFS)
      if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
    } catch {}
    // Migrate the legacy reduce-motion flag / OS preference.
    return { ...DEFAULT_PREFS, stopAnimations: parseBool(localStorage.getItem('crea3_a11y_reduce_motion')) ?? prefersReduce }
  })

  const announcerRef = useRef<HTMLDivElement | null>(null)
  const announce = (msg: string) => {
    const el = announcerRef.current
    if (!el) return
    el.textContent = ''
    window.setTimeout(() => { el.textContent = msg }, 10)
  }

  // Derived back-compat values.
  const lightMode = prefs.scheme === 'default' || prefs.scheme === 'light'
  const highContrast = prefs.scheme === 'hc'
  const reduceMotion = prefs.stopAnimations

  const setPref = <K extends keyof A11yPrefs>(key: K, value: A11yPrefs[K]) => {
    setPrefs(p => ({ ...p, [key]: value }))
  }

  // ── Apply preferences to <html> (classes / vars / inline) ───────────────────
  useEffect(() => {
    try { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)) } catch {}
    const root = document.documentElement
    const cl = root.classList
    // Contrast scheme (exclusive — this is what fixes light+hc black-on-black):
    cl.toggle('light', prefs.scheme === 'default' || prefs.scheme === 'light')
    cl.toggle('a11y-sharp', prefs.scheme === 'light')
    cl.toggle('hc', prefs.scheme === 'hc')
    // Saturation filter
    cl.toggle('a11y-sat-high', prefs.saturation === 'high')
    cl.toggle('a11y-sat-low', prefs.saturation === 'low')
    cl.toggle('a11y-sat-mono', prefs.saturation === 'mono')
    // Content / reading
    cl.toggle('a11y-readable', prefs.readableFont)
    cl.toggle('a11y-hl-headings', prefs.highlightHeadings)
    cl.toggle('a11y-magnifier', prefs.magnifier)
    cl.toggle('a11y-ls-wide', prefs.letterSpacing === 'wide')
    cl.toggle('a11y-ls-xwide', prefs.letterSpacing === 'xwide')
    cl.toggle('a11y-ls-ultra', prefs.letterSpacing === 'ultra')
    cl.toggle('a11y-lh-generous', prefs.lineHeight === 'generous')
    cl.toggle('a11y-lh-double', prefs.lineHeight === 'double')
    // Orientation / navigation
    cl.toggle('rm', prefs.stopAnimations)
    cl.toggle('a11y-hover', prefs.hoverHighlight)
    cl.toggle('a11y-focus', prefs.focusHighlight)
    cl.toggle('a11y-guide', prefs.readingGuide)
    cl.toggle('a11y-mask', prefs.readingMask)
    cl.toggle('a11y-mute', prefs.muteSounds)
    cl.toggle('a11y-cursor-black', prefs.cursor === 'black')
    cl.toggle('a11y-cursor-white', prefs.cursor === 'white')
    // Interface zoom
    document.body.style.zoom = prefs.contentScale === 100 ? '' : String(prefs.contentScale / 100)
    // Custom colours
    const customColors = !!(prefs.textColor || prefs.headingColor || prefs.bgColor)
    cl.toggle('a11y-custom', customColors)
    root.style.setProperty('--a11y-text', prefs.textColor || '')
    root.style.setProperty('--a11y-heading', prefs.headingColor || '')
    root.style.setProperty('--a11y-bg', prefs.bgColor || '')
    // A global flag other code can read to suppress sounds.
    ;(window as any).__crea3MuteSounds = prefs.muteSounds
  }, [prefs])

  useEffect(() => {
    try { localStorage.setItem(LS_FS, String(fontScale)) } catch {}
    document.documentElement.style.fontSize = fontScale + '%'
  }, [fontScale])

  // Cursor-following overlays: reading guide, reading mask and text magnifier.
  useEffect(() => {
    const anyOn = prefs.readingGuide || prefs.readingMask || prefs.magnifier
    if (!anyOn) return
    const guide = document.createElement('div'); guide.className = 'a11y-guide-line'
    const maskTop = document.createElement('div'); maskTop.className = 'a11y-mask-band'
    const maskBot = document.createElement('div'); maskBot.className = 'a11y-mask-band'
    const mag = document.createElement('div'); mag.className = 'a11y-magnifier-box'
    if (prefs.readingGuide) document.body.appendChild(guide)
    if (prefs.readingMask) { document.body.appendChild(maskTop); document.body.appendChild(maskBot) }
    if (prefs.magnifier) document.body.appendChild(mag)

    // Mask bands: fixed to the viewport edges; only their extent changes on move.
    maskTop.style.top = '0px'; maskTop.style.left = '0px'; maskTop.style.right = '0px'
    maskBot.style.bottom = '0px'; maskBot.style.left = '0px'; maskBot.style.right = '0px'
    const onMove = (e: MouseEvent) => {
      const y = e.clientY, x = e.clientX
      if (prefs.readingGuide) guide.style.top = `${y}px`
      if (prefs.readingMask) {
        maskTop.style.height = `${Math.max(0, y - 55)}px`
        maskBot.style.top = `${y + 55}px`
      }
      if (prefs.magnifier) {
        const el = document.elementFromPoint(x, y) as HTMLElement | null
        const txt = el ? (el.innerText || el.textContent || '').trim().slice(0, 220) : ''
        if (txt) {
          mag.textContent = txt
          mag.style.display = 'block'
          mag.style.left = `${Math.min(x + 16, window.innerWidth - 340)}px`
          mag.style.top = `${Math.min(y + 20, window.innerHeight - 120)}px`
        } else {
          mag.style.display = 'none'
        }
      }
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      ;[guide, maskTop, maskBot, mag].forEach(el => el.parentNode && el.parentNode.removeChild(el))
    }
  }, [prefs.readingGuide, prefs.readingMask, prefs.magnifier])

  const reset = () => {
    setPrefs({ ...DEFAULT_PREFS })
    setFontScale(100)
    announce('Accessibility settings reset')
  }

  const value: A11yState = {
    highContrast, reduceMotion, lightMode, fontScale,
    setHighContrast: v => { setPref('scheme', v ? 'hc' : 'default'); announce(v ? 'High contrast enabled' : 'High contrast disabled') },
    setReduceMotion: v => { setPref('stopAnimations', v); announce(v ? 'Reduced motion enabled' : 'Reduced motion disabled') },
    setLightMode: v => { setPref('scheme', v ? 'default' : 'dark') },
    setFontScale: v => { setFontScale(v); announce(`Font size set to ${v}%`) },
    prefs, setPref, reset, announce,
  }

  return (
    <Ctx.Provider value={value}>
      <div ref={announcerRef} className="sr-only" aria-live="polite" aria-atomic="true" />
      {children}
    </Ctx.Provider>
  )
}

export function useA11y() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useA11y must be used inside A11yProvider')
  return ctx
}
