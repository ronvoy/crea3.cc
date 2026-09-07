import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { useA11y } from './components/a11y-provider'
import { API_BASE, getAccessToken } from './api/client'
import {
  DEFAULT_CUSTOM, UiCustom, SavedTheme, getBg, getFont, withOpacity, darkVariant,
} from './theme-custom'

// ── Look store: typeface, background palette, surface opacity, card style ────
const LS_CUSTOM = 'crea3_ui_custom_v1'
const LS_SAVED = 'crea3_ui_saved_themes_v1'

type LookCtx = {
  custom: UiCustom
  setCustom: (patch: Partial<UiCustom>) => void
  reset: () => void
  saved: SavedTheme[]
  saveCurrent: (name: string, anim?: any) => void
  applySaved: (name: string) => any
  deleteSaved: (name: string) => void
  /** Presets published to the server — visible to EVERY visitor. */
  shared: Array<{ name: string; payload: any; author: string }>
  refreshShared: () => Promise<void>
  publishShared: (name: string, anim?: any) => Promise<void>
  applyShared: (name: string) => any
  deleteShared: (name: string) => Promise<void>
}
const LookContext = createContext<LookCtx | null>(null)
export function useLook(): LookCtx {
  const c = useContext(LookContext)
  if (!c) throw new Error('useLook must be used inside AppThemeProvider')
  return c
}

/** Load a Google font on demand for the selected typeface. */
function ensureCustomFont(fontId: string) {
  const f = getFont(fontId)
  if (!f.google) return
  const id = `gf-${f.id}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id; link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`
  document.head.appendChild(link)
}

// ── Minimal Material UI theme (ported from CREA3) ─────────────────────────────
// Clean, flat, lots of whitespace. Reads accessibility state (light/dark mode,
// high-contrast, font scale) from the A11yProvider so the settings dock toggles
// keep working. Font/primary are static here (Poppins / blue) to match CREA3's
// default look without pulling in the dev-toolbar/app-config machinery.

const FONT_FAMILY = "'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const PRIMARY_MAIN = '#2563eb'

// Inject the Poppins stylesheet once.
function ensureFontLoaded() {
  const id = 'gf-Poppins'
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'
  document.head.appendChild(link)
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { lightMode, highContrast } = useA11y()
  const [custom, setCustomState] = useState<UiCustom>(() => {
    try { return { ...DEFAULT_CUSTOM, ...JSON.parse(localStorage.getItem(LS_CUSTOM) || '{}') } } catch { return DEFAULT_CUSTOM }
  })
  const [saved, setSaved] = useState<SavedTheme[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_SAVED) || '[]') } catch { return [] }
  })
  const writeCustom = (next: UiCustom) => {
    setCustomState(next)
    try { localStorage.setItem(LS_CUSTOM, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const writeSaved = (next: SavedTheme[]) => {
    setSaved(next)
    try { localStorage.setItem(LS_SAVED, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const [shared, setShared] = useState<Array<{ name: string; payload: any; author: string }>>([])
  const refreshShared = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/presets`)
      if (res.ok) setShared(await res.json())
    } catch { /* offline: keep what we have */ }
  }
  useEffect(() => { refreshShared() }, [])

  const look: LookCtx = {
    custom,
    setCustom: (patch) => writeCustom({ ...custom, ...patch }),
    reset: () => writeCustom({ ...DEFAULT_CUSTOM }),
    saved,
    saveCurrent: (name, anim) => {
      const clean = name.trim().slice(0, 40)
      if (!clean) return
      writeSaved([...saved.filter((s2) => s2.name !== clean), { ...custom, name: clean, savedAt: Date.now(), anim }])
    },
    applySaved: (name) => {
      const hit = saved.find((s2) => s2.name === name)
      if (!hit) return undefined
      const { name: _n, savedAt: _t, anim, ...look } = hit as any
      writeCustom({ ...DEFAULT_CUSTOM, ...look })
      return anim          // caller pushes this into the animation provider
    },
    deleteSaved: (name) => writeSaved(saved.filter((s2) => s2.name !== name)),
    shared,
    refreshShared,
    publishShared: async (name, anim) => {
      const token = getAccessToken()
      // A background image is UPLOADED first and shared as a URL, so every
      // visitor (including incognito / signed-out) can load it. Data URLs are
      // far too large to embed in the shared payload.
      let bgImage = custom.bgImage
      if (bgImage.startsWith('data:')) {
        const up = await fetch(`${API_BASE}/api/presets/image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ data_url: bgImage }),
        })
        if (!up.ok) throw new Error((await up.json().catch(() => ({}))).detail || 'image upload failed')
        bgImage = (await up.json()).url          // e.g. /api/presets/image/<hash>.jpg
      }
      const shareable = { ...custom, bgImage }
      const res = await fetch(`${API_BASE}/api/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: name.trim().slice(0, 40), payload: { ...shareable, anim } }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'publish failed')
      await refreshShared()
    },
    applyShared: (name) => {
      const hit = shared.find((s2) => s2.name === name)
      if (!hit) return undefined
      const { anim, ...lookPart } = hit.payload || {}
      writeCustom({ ...DEFAULT_CUSTOM, ...lookPart })   // includes the shared image URL
      return anim
    },
    deleteShared: async (name) => {
      const token = getAccessToken()
      await fetch(`${API_BASE}/api/presets/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      await refreshShared()
    },
  }

  useEffect(() => { ensureFontLoaded() }, [])
  useEffect(() => { ensureCustomFont(custom.font) }, [custom.font])

  const theme = useMemo(() => {
    const mode: 'light' | 'dark' = lightMode ? 'light' : 'dark'
    // Selected look → real MUI tokens.
    const FF = getFont(custom.font).stack
    const bg = getBg(custom.background)
    const [paletteBase] = mode === 'light' ? bg.light : bg.dark
    // Each region may use its OWN palette; '' follows the page palette.
    // A per-region CUSTOM colour wins over the palette. In dark mode the picked
    // colour keeps its hue but is darkened (see darkVariant) instead of being
    // greyed out, so the user's choice stays recognisable and readable.
    const regionSurface = (id: string, opacity: number, customHex?: string) => {
      if (highContrast) return mode === 'light' ? '#ffffff' : '#000000'
      const base = customHex
        ? (mode === 'light' ? customHex : darkVariant(customHex))
        : (mode === 'light' ? getBg(id || custom.background).light : getBg(id || custom.background).dark)[1]
      return withOpacity(base, opacity)
    }
    const cardBg = getBg(custom.cardBackground || custom.background)
    const surfaceBase = (mode === 'light' ? cardBg.light : cardBg.dark)[1]
    const cardSurface = regionSurface(custom.cardBackground, custom.surfaceOpacity, custom.cardColor || undefined)
    const headerSurface = regionSurface(custom.headerBackground, custom.headerOpacity, custom.headerColor || undefined)
    const navSurface = regionSurface(custom.navBackground, custom.navOpacity, custom.navColor || undefined)
    const neutralPaper = highContrast
      ? (mode === 'light' ? '#ffffff' : '#000000')
      : (mode === 'light' ? getBg(custom.background).light[1] : getBg(custom.background).dark[1])
    const palettePaint = bg.gradient ? (mode === 'light' ? bg.gradient[0] : bg.gradient[1]) : paletteBase
    const pageCustom = custom.pageColor
      ? (mode === 'light' ? custom.pageColor : darkVariant(custom.pageColor))
      : ''
    const pagePaint = highContrast
      ? (mode === 'light' ? '#ffffff' : '#000000')
      : (pageCustom || palettePaint)
    const surface = highContrast ? (mode === 'light' ? '#ffffff' : '#000000')
                                 : withOpacity(surfaceBase, custom.surfaceOpacity)

    return createTheme({
      palette: {
        mode,
        // White text on primary so contained buttons are never low-contrast.
        primary: { main: PRIMARY_MAIN, contrastText: '#ffffff' },
        ...(mode === 'light'
          ? {
              background: { default: pageCustom || paletteBase, paper: neutralPaper },
              text: {
                primary: highContrast ? '#000000' : '#0f172a',
                secondary: highContrast ? '#000000' : '#475569',
              },
              divider: highContrast ? 'rgba(0,0,0,0.6)' : 'rgba(15,23,42,0.10)',
            }
          : {
              background: {
                default: highContrast ? '#000000' : (pageCustom || paletteBase),
                paper: highContrast ? '#000000' : neutralPaper,
              },
              text: {
                primary: highContrast ? '#ffffff' : '#e2e8f0',
                secondary: highContrast ? '#ffffff' : '#94a3b8',
              },
              divider: highContrast ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.10)',
            }),
      },
      shape: { borderRadius: 12 },
      typography: {
        fontFamily: FF,
        h1: { fontFamily: FF, fontWeight: 700, letterSpacing: '0.01em' },
        h2: { fontFamily: FF, fontWeight: 700, letterSpacing: '0.01em' },
        h3: { fontFamily: FF, fontWeight: 600 },
        h4: { fontFamily: FF, fontWeight: 600 },
        h5: { fontFamily: FF, fontWeight: 600 },
        h6: { fontFamily: FF, fontWeight: 600 },
        overline: { fontFamily: FF },
        button: { fontWeight: 600 },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: {
              minHeight: '100vh',
              // Minimal: plain white in light, a subtle fixed gradient in dark.
              // A user-uploaded image replaces the palette paint; `cover`
              // stretches it across the viewport, `tile` repeats it.
              ...(custom.bgImage && !highContrast
                ? {
                    backgroundColor: pageCustom || paletteBase,
                    backgroundImage: `url(${custom.bgImage.startsWith('data:') ? custom.bgImage : API_BASE + custom.bgImage})`,
                    backgroundSize: custom.bgImageMode === 'tile' ? 'auto' : 'cover',
                    backgroundRepeat: custom.bgImageMode === 'tile' ? 'repeat' : 'no-repeat',
                    backgroundPosition: 'center',
                  }
                : { background: pagePaint }),
              backgroundAttachment: 'fixed',
              // Every text node inherits the selected typeface.
              fontFamily: FF,
            },
          },
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: { textTransform: 'none', minHeight: 44, borderRadius: 12 },
            containedPrimary: { color: '#ffffff' },
          },
        },
        MuiPaper: {
          defaultProps: { elevation: custom.cardStyle === 'elevated' ? 2 : 0 },
          styleOverrides: {
            root: {
              backgroundImage: 'none',
              ...(custom.surfaceOpacity < 100 ? { backdropFilter: 'blur(10px)' } : {}),
            },
            // glass    → hairline border, translucent, soft lift
            // elevated → no border, a slight raise
            // outlined → the classic 1px bordered card
            outlined: {
              // .MuiPaper-outlined.MuiPaper-rounded → the app's card container
              backgroundColor: cardSurface,
              ...(custom.surfaceOpacity < 100 ? { backdropFilter: 'blur(12px)' } : {}),
              ...(custom.cardStyle === 'glass'
                ? {
                    borderWidth: '0.5px',
                    borderColor: mode === 'light' ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.10)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: mode === 'light' ? '0 4px 20px rgba(15,23,42,.07)' : '0 4px 20px rgba(0,0,0,.35)',
                  }
                : custom.cardStyle === 'elevated'
                  ? {
                      border: 'none',
                      boxShadow: mode === 'light' ? '0 3px 12px rgba(15,23,42,.10)' : '0 3px 14px rgba(0,0,0,.45)',
                    }
                  : {}),
            },
          },
        },
        MuiAppBar: {
          defaultProps: { elevation: 0, color: 'default' },
          styleOverrides: {
            root: {
              backgroundColor: headerSurface,
              backgroundImage: 'none',
              ...(custom.headerOpacity < 100 ? { backdropFilter: 'blur(12px)' } : {}),
            },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: {
              backgroundColor: navSurface,
              backgroundImage: 'none',
              ...(custom.navOpacity < 100 ? { backdropFilter: 'blur(12px)' } : {}),
            },
          },
        },
        MuiTextField: {
          defaultProps: { size: 'small' },
        },
        MuiOutlinedInput: {
          styleOverrides: { root: { borderRadius: 12 } },
        },
        MuiChip: {
          styleOverrides: { root: { fontWeight: 500 } },
        },
        MuiListItemButton: {
          styleOverrides: { root: { borderRadius: 12 } },
        },
      },
    })
  }, [lightMode, highContrast, custom])

  return (
    <LookContext.Provider value={look}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </LookContext.Provider>
  )
}
