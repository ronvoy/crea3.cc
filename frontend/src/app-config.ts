import { create } from 'zustand'
import { api } from './api/client'

// ── Font + theme catalogues (drive the dev toolbar dropdowns) ──────────────────
export type FontOption = { id: string; label: string; css: string; google: string | null }

export const FONT_OPTIONS: FontOption[] = [
  { id: 'Orbitron', label: 'Orbitron (classic robot)', css: "'Orbitron', sans-serif", google: 'Orbitron:wght@400;500;600;700;800' },
  { id: 'Inter', label: 'Inter', css: "'Inter', system-ui, sans-serif", google: 'Inter:wght@400;500;600;700' },
  { id: 'Roboto', label: 'Roboto', css: "'Roboto', system-ui, sans-serif", google: 'Roboto:wght@400;500;700' },
  { id: 'Poppins', label: 'Poppins', css: "'Poppins', system-ui, sans-serif", google: 'Poppins:wght@400;500;600;700' },
  { id: 'Montserrat', label: 'Montserrat', css: "'Montserrat', system-ui, sans-serif", google: 'Montserrat:wght@400;500;600;700' },
  { id: 'Lato', label: 'Lato', css: "'Lato', system-ui, sans-serif", google: 'Lato:wght@400;700' },
  { id: 'Space Grotesk', label: 'Space Grotesk', css: "'Space Grotesk', system-ui, sans-serif", google: 'Space+Grotesk:wght@400;500;600;700' },
  { id: 'IBM Plex Sans', label: 'IBM Plex Sans', css: "'IBM Plex Sans', system-ui, sans-serif", google: 'IBM+Plex+Sans:wght@400;500;600;700' },
  { id: 'Source Sans 3', label: 'Source Sans 3', css: "'Source Sans 3', system-ui, sans-serif", google: 'Source+Sans+3:wght@400;600;700' },
  { id: 'Nunito', label: 'Nunito', css: "'Nunito', system-ui, sans-serif", google: 'Nunito:wght@400;600;700' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono', css: "'JetBrains Mono', ui-monospace, monospace", google: 'JetBrains+Mono:wght@400;500;700' },
  { id: 'System', label: 'System default', css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', google: null },
]

export type ThemePreset = { id: string; label: string; primary: string }

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'blue', label: 'Blue', primary: '#2563eb' },
  { id: 'indigo', label: 'Indigo', primary: '#4f46e5' },
  { id: 'violet', label: 'Violet', primary: '#7c3aed' },
  { id: 'teal', label: 'Teal', primary: '#0d9488' },
  { id: 'emerald', label: 'Emerald', primary: '#059669' },
  { id: 'forest', label: 'Forest', primary: '#166534' },
  { id: 'cyan', label: 'Cyan', primary: '#0891b2' },
  { id: 'amber', label: 'Amber', primary: '#d97706' },
  { id: 'rose', label: 'Rose', primary: '#e11d48' },
  { id: 'crimson', label: 'Crimson', primary: '#dc2626' },
  { id: 'fuchsia', label: 'Fuchsia', primary: '#c026d3' },
  { id: 'slate', label: 'Slate', primary: '#475569' },
]

const LS_FONT = 'crea3_font_type'
const LS_THEME = 'crea3_theme_type'

export function fontCss(id: string): string {
  return (FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0]).css
}

export function presetPrimary(id: string): string {
  return (THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0]).primary
}

// Inject the Google Fonts <link> for the chosen font on demand.
export function ensureFontLoaded(id: string) {
  const opt = FONT_OPTIONS.find((f) => f.id === id)
  if (!opt || !opt.google) return
  const linkId = `gf-${opt.id.replace(/\s+/g, '-')}`
  if (document.getElementById(linkId)) return
  const link = document.createElement('link')
  link.id = linkId
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${opt.google}&display=swap`
  document.head.appendChild(link)
}

type AppConfigState = {
  deploymentEnvironment: string // 'dev' | 'prod' | ''
  fontType: string
  themeType: string
  isDev: boolean
  googleEnabled: boolean
  setFontType: (id: string) => void
  setThemeType: (id: string) => void
  loadFromServer: () => Promise<void>
  persistToServer: () => Promise<void>
}

function initialFont(): string {
  const v = localStorage.getItem(LS_FONT)
  return v && FONT_OPTIONS.some((f) => f.id === v) ? v : 'Orbitron'
}
function initialTheme(): string {
  const v = localStorage.getItem(LS_THEME)
  return v && THEME_PRESETS.some((t) => t.id === v) ? v : 'blue'
}

export const useAppConfig = create<AppConfigState>((set, get) => ({
  deploymentEnvironment: '',
  fontType: initialFont(),
  themeType: initialTheme(),
  isDev: true,
  googleEnabled: false,

  setFontType(id) {
    ensureFontLoaded(id)
    localStorage.setItem(LS_FONT, id)
    set({ fontType: id })
  },
  setThemeType(id) {
    localStorage.setItem(LS_THEME, id)
    set({ themeType: id })
  },

  async loadFromServer() {
    try {
      const cfg = await api('/api/app-config', { auth: false })
      const env = String(cfg.deployment_environment || '').toLowerCase()
      const isDev = env === 'dev'
      // In prod, the .env values are authoritative. In dev, local overrides win.
      const patch: Partial<AppConfigState> = { deploymentEnvironment: env, isDev, googleEnabled: !!cfg.google_oauth_enabled }
      if (!isDev) {
        if (cfg.font_type && FONT_OPTIONS.some((f) => f.id === cfg.font_type)) patch.fontType = cfg.font_type
        if (cfg.theme_type && THEME_PRESETS.some((t) => t.id === cfg.theme_type)) patch.themeType = cfg.theme_type
      } else {
        // Seed from server only if the user has no local choice yet.
        if (!localStorage.getItem(LS_FONT) && cfg.font_type && FONT_OPTIONS.some((f) => f.id === cfg.font_type)) patch.fontType = cfg.font_type
        if (!localStorage.getItem(LS_THEME) && cfg.theme_type && THEME_PRESETS.some((t) => t.id === cfg.theme_type)) patch.themeType = cfg.theme_type
      }
      set(patch)
      ensureFontLoaded(get().fontType)
    } catch {
      // Backend unreachable: keep local defaults, assume dev so tools are visible.
      set({ deploymentEnvironment: '', isDev: true })
    }
  },

  async persistToServer() {
    const { fontType, themeType } = get()
    await api('/api/app-config', { method: 'POST', body: { font_type: fontType, theme_type: themeType }, auth: false })
  },
}))
