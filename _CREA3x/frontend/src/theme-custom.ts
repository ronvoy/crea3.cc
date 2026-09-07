/**
 * User-facing look customisation: typeface, background palette + surface
 * opacity, and card style. These map onto REAL MUI tokens in theme.tsx
 * (typography.fontFamily, palette.background, MuiPaper overrides), so a change
 * repaints the whole app — every page, every text node — not just buttons.
 */

export type FontOption = { id: string; label: string; stack: string; google?: string }

/** Elegant, well-hinted faces that read well for long legal text. */
export const FONTS: FontOption[] = [
  { id: 'poppins',    label: 'Poppins',            stack: "'Poppins', system-ui, sans-serif",            google: 'Poppins:wght@400;500;600;700' },
  { id: 'inter',      label: 'Inter',              stack: "'Inter', system-ui, sans-serif",              google: 'Inter:wght@400;500;600;700' },
  { id: 'system',     label: 'System UI',          stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'roboto',     label: 'Roboto',             stack: "'Roboto', system-ui, sans-serif",             google: 'Roboto:wght@400;500;700' },
  { id: 'opensans',   label: 'Open Sans',          stack: "'Open Sans', system-ui, sans-serif",          google: 'Open+Sans:wght@400;500;600;700' },
  { id: 'lato',       label: 'Lato',               stack: "'Lato', system-ui, sans-serif",               google: 'Lato:wght@400;700' },
  { id: 'nunito',     label: 'Nunito Sans',        stack: "'Nunito Sans', system-ui, sans-serif",        google: 'Nunito+Sans:wght@400;600;700' },
  { id: 'worksans',   label: 'Work Sans',          stack: "'Work Sans', system-ui, sans-serif",          google: 'Work+Sans:wght@400;500;600;700' },
  { id: 'dmsans',     label: 'DM Sans',            stack: "'DM Sans', system-ui, sans-serif",            google: 'DM+Sans:wght@400;500;700' },
  { id: 'manrope',    label: 'Manrope',            stack: "'Manrope', system-ui, sans-serif",            google: 'Manrope:wght@400;500;600;700' },
  { id: 'figtree',    label: 'Figtree',            stack: "'Figtree', system-ui, sans-serif",            google: 'Figtree:wght@400;500;600;700' },
  { id: 'publicsans', label: 'Public Sans',        stack: "'Public Sans', system-ui, sans-serif",        google: 'Public+Sans:wght@400;500;600;700' },
  { id: 'ibmplex',    label: 'IBM Plex Sans',      stack: "'IBM Plex Sans', system-ui, sans-serif",      google: 'IBM+Plex+Sans:wght@400;500;600;700' },
  { id: 'sourcesans', label: 'Source Sans 3',      stack: "'Source Sans 3', system-ui, sans-serif",      google: 'Source+Sans+3:wght@400;600;700' },
  { id: 'merriweather', label: 'Merriweather Sans', stack: "'Merriweather Sans', system-ui, sans-serif", google: 'Merriweather+Sans:wght@400;600;700' },
  { id: 'sourceserif', label: 'Source Serif 4',    stack: "'Source Serif 4', Georgia, serif",            google: 'Source+Serif+4:wght@400;600;700' },
  { id: 'lora',       label: 'Lora (serif)',       stack: "'Lora', Georgia, serif",                      google: 'Lora:wght@400;500;600;700' },
  { id: 'crimson',    label: 'Crimson Pro (serif)', stack: "'Crimson Pro', Georgia, serif",              google: 'Crimson+Pro:wght@400;600;700' },
  { id: 'atkinson',   label: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', system-ui, sans-serif", google: 'Atkinson+Hyperlegible:wght@400;700' },
  { id: 'jetbrains',  label: 'JetBrains Mono',     stack: "'JetBrains Mono', ui-monospace, monospace",   google: 'JetBrains+Mono:wght@400;500;700' },
]

export type BgPreset = {
  id: string
  label: string
  /** [page background, surface/paper] for light and dark modes. */
  light: [string, string]
  dark: [string, string]
  /** Optional soft gradient for the page background (light, dark). */
  gradient?: [string, string]
}

/** Aesthetic background palettes — these repaint the PAGE, not just borders. */
export const BACKGROUNDS: BgPreset[] = [
  { id: 'plain',  label: 'Plain',      light: ['#ffffff', '#ffffff'], dark: ['#0b1220', '#111a2b'],
    gradient: ['#ffffff', 'linear-gradient(160deg,#0b1220 0%,#0f172a 55%,#131f36 100%)'] },
  // Light tints are deliberately DEEP enough to read against white (the earlier
  // 2-4% tints were invisible in light mode while obvious in dark mode).
  { id: 'warm',   label: 'Warm sand',  light: ['#f6e4cf', '#fdf3e6'], dark: ['#17110c', '#241a12'],
    gradient: ['linear-gradient(160deg,#f8e8d6 0%,#f0d9bd 100%)', 'linear-gradient(160deg,#17110c 0%,#241a12 100%)'] },
  { id: 'mist',   label: 'Cool mist',  light: ['#dde8f3', '#eff5fb'], dark: ['#0a1018', '#121a24'],
    gradient: ['linear-gradient(160deg,#e3edf7 0%,#cfdff0 100%)', 'linear-gradient(160deg,#0a1018 0%,#111b26 100%)'] },
  { id: 'sage',   label: 'Sage',       light: ['#dcebdf', '#eef7f0'], dark: ['#0b140f', '#132019'],
    gradient: ['linear-gradient(160deg,#e2efe4 0%,#cfe3d4 100%)', 'linear-gradient(160deg,#0b140f 0%,#132019 100%)'] },
  { id: 'lavender', label: 'Lavender', light: ['#e5e0f7', '#f2effc'], dark: ['#100c1c', '#1b1430'],
    gradient: ['linear-gradient(160deg,#eae5fb 0%,#dcd4f3 100%)', 'linear-gradient(160deg,#100c1c 0%,#1b1430 100%)'] },
  { id: 'rose',   label: 'Rose',       light: ['#f8dbe3', '#fdeef2'], dark: ['#160c11', '#25141d'],
    gradient: ['linear-gradient(160deg,#fae3ea 0%,#f3ccd8 100%)', 'linear-gradient(160deg,#160c11 0%,#25141d 100%)'] },
  { id: 'nordic', label: 'Nordic',     light: ['#dbe1ea', '#eceff4'], dark: ['#2e3440', '#3b4252'],
    gradient: ['linear-gradient(160deg,#e1e6ee 0%,#cfd7e2 100%)', 'linear-gradient(160deg,#2e3440 0%,#3b4252 100%)'] },
  { id: 'slate',  label: 'Slate',      light: ['#dde3ea', '#eef2f6'], dark: ['#0a0f1a', '#141d2e'],
    gradient: ['linear-gradient(160deg,#e3e8ee 0%,#d0d8e2 100%)', 'linear-gradient(160deg,#0a0f1a 0%,#141d2e 100%)'] },
  { id: 'ocean',  label: 'Ocean',      light: ['#d3e9f1', '#e9f5fa'], dark: ['#07141a', '#0f2530'],
    gradient: ['linear-gradient(160deg,#dcedf4 0%,#c4e0ec 100%)', 'linear-gradient(160deg,#07141a 0%,#0f2530 100%)'] },
  { id: 'graphite', label: 'Graphite', light: ['#e4e4e4', '#f2f2f2'], dark: ['#0a0a0a', '#171717'],
    gradient: ['linear-gradient(160deg,#eaeaea 0%,#d9d9d9 100%)', 'linear-gradient(160deg,#0a0a0a 0%,#171717 100%)'] },
]

/** Card surface treatment. */
export type CardStyle = 'glass' | 'elevated' | 'outlined'

export type BgImageMode = 'cover' | 'tile'

export type UiCustom = {
  font: string
  /** PAGE background: palette preset, or a user image when `bgImage` is set. */
  background: string
  bgImage: string            // data: URL ('' = use the palette)
  bgImageMode: BgImageMode   // cover = stretch to the viewport, tile = repeat
  /** CARD (.MuiPaper-outlined.MuiPaper-rounded) background: palette + opacity. */
  cardBackground: string     // '' = follow the page palette's surface colour
  surfaceOpacity: number     // card opacity 40–100 (%)
  cardStyle: CardStyle
  /** Per-region CUSTOM colours (hex, '' = use the palette above). Light mode
   *  uses the colour as picked; dark mode uses `darkVariant()` of it. */
  pageColor: string
  cardColor: string
  headerColor: string
  navColor: string
  /** HEADER top bar (.MuiAppBar-root): palette + opacity. */
  headerBackground: string
  headerOpacity: number
  /** SIDE navigation drawer (.MuiDrawer-paper): palette + opacity. */
  navBackground: string
  navOpacity: number
}

export const DEFAULT_CUSTOM: UiCustom = {
  font: 'poppins',
  background: 'plain',
  bgImage: '',
  bgImageMode: 'cover',
  cardBackground: '',
  surfaceOpacity: 100,
  cardStyle: 'outlined',
  pageColor: '',
  cardColor: '',
  headerColor: '',
  navColor: '',
  headerBackground: '',
  headerOpacity: 100,
  navBackground: '',
  navOpacity: 100,
}

/** A saved preset carries BOTH the look and the animation configuration. */
export type SavedTheme = UiCustom & { name: string; savedAt: number; anim?: any }

/**
 * Downscale + compress a picked image so it fits comfortably in localStorage
 * (a raw phone photo would blow the ~5 MB quota).
 */
export function compressImage(file: File, maxPx = 1920, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('read failed'))
    fr.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        const ctx = cv.getContext('2d')
        if (!ctx) return reject(new Error('canvas unavailable'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(cv.toDataURL('image/jpeg', quality))
      }
      img.src = String(fr.result)
    }
    fr.readAsDataURL(file)
  })
}

export const getFont = (id: string) => FONTS.find((f) => f.id === id) || FONTS[0]
export const getBg = (id: string) => BACKGROUNDS.find((b) => b.id === id) || BACKGROUNDS[0]

/** #rrggbb + alpha% → rgba(); passes gradients/rgba through untouched. */
export function withOpacity(color: string, pct: number): string {
  const a = Math.max(0, Math.min(100, pct)) / 100
  if (a >= 0.999) return color
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// ── Custom colour helpers (HSV pickers) ──────────────────────────────────────
export type HSV = { h: number; s: number; v: number }   // h 0..360, s/v 0..100

export function hsvToHex({ h, s, v }: HSV): string {
  const S = Math.max(0, Math.min(100, s)) / 100
  const V = Math.max(0, Math.min(100, v)) / 100
  const C = V * S
  const H = (((h % 360) + 360) % 360) / 60
  const X = C * (1 - Math.abs((H % 2) - 1))
  const [r1, g1, b1] =
    H < 1 ? [C, X, 0] : H < 2 ? [X, C, 0] : H < 3 ? [0, C, X] :
    H < 4 ? [0, X, C] : H < 5 ? [X, 0, C] : [C, 0, X]
  const m = V - C
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r1)}${to(g1)}${to(b1)}`
}

export function hexToHsv(hex: string): HSV {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return { h: 210, s: 30, v: 92 }
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return { h: Math.round(h), s: Math.round((max === 0 ? 0 : d / max) * 100), v: Math.round(max * 100) }
}

/**
 * Dark-mode counterpart of a user-picked colour.
 *
 * We deliberately do NOT convert to greyscale: that would throw away the hue the
 * user chose and force a monochrome dark theme. Instead the HUE is preserved and
 * the brightness is pulled down (with a little saturation lift) so the surface is
 * dark enough for white text while still reading as "their" colour.
 */
export function darkVariant(hex: string): string {
  const { h, s } = hexToHsv(hex)
  return hsvToHex({ h, s: Math.min(60, Math.max(12, s * 0.9)), v: 13 })
}

/** Whether the live customisation editor is available (frontend/.env). */
export const CUSTOMIZATION_ENABLED =
  String((import.meta as any).env?.VITE_UI_CUSTOMIZATION ?? '1').trim() === '1'
