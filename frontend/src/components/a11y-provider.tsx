import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

type FontScale = 100 | 112 | 125 | 150

type A11yState = {
  highContrast: boolean
  reduceMotion: boolean
  fontScale: FontScale
  setHighContrast: (v: boolean) => void
  setReduceMotion: (v: boolean) => void
  setFontScale: (v: FontScale) => void
  reset: () => void
  announce: (msg: string) => void
}

const Ctx = createContext<A11yState | null>(null)

const LS_HC = 'crea3_a11y_high_contrast'
const LS_RM = 'crea3_a11y_reduce_motion'
const LS_FS = 'crea3_a11y_font_scale'

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
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return false
    }
  }, [])

  const [highContrast, setHighContrast] = useState<boolean>(() => parseBool(localStorage.getItem(LS_HC)) ?? false)
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => parseBool(localStorage.getItem(LS_RM)) ?? prefersReduce)
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    const raw = localStorage.getItem(LS_FS)
    const n = raw ? Number(raw) : 100
    return clampFont(Number.isFinite(n) ? n : 100)
  })

  const announcerRef = useRef<HTMLDivElement | null>(null)

  const announce = (msg: string) => {
    const el = announcerRef.current
    if (!el) return
    // force screen readers to re-announce
    el.textContent = ''
    window.setTimeout(() => {
      el.textContent = msg
    }, 10)
  }

  useEffect(() => {
    try { localStorage.setItem(LS_HC, highContrast ? '1' : '0') } catch {}
    document.documentElement.classList.toggle('hc', highContrast)
  }, [highContrast])

  useEffect(() => {
    try { localStorage.setItem(LS_RM, reduceMotion ? '1' : '0') } catch {}
    document.documentElement.classList.toggle('rm', reduceMotion)
  }, [reduceMotion])

  useEffect(() => {
    try { localStorage.setItem(LS_FS, String(fontScale)) } catch {}
    document.documentElement.style.fontSize = fontScale + '%'
  }, [fontScale])

  const reset = () => {
    setHighContrast(false)
    setReduceMotion(prefersReduce)
    setFontScale(100)
    announce('Accessibility settings reset')
  }

  const value: A11yState = {
    highContrast,
    reduceMotion,
    fontScale,
    setHighContrast: v => { setHighContrast(v); announce(v ? 'High contrast enabled' : 'High contrast disabled') },
    setReduceMotion: v => { setReduceMotion(v); announce(v ? 'Reduced motion enabled' : 'Reduced motion disabled') },
    setFontScale: v => { setFontScale(v); announce(`Font size set to ${v}%`) },
    reset,
    announce,
  }

  return (
    <Ctx.Provider value={value}>
      {/* Screen-reader live region */}
      <div
        ref={announcerRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />
      {children}
    </Ctx.Provider>
  )
}

export function useA11y() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useA11y must be used inside A11yProvider')
  return ctx
}
