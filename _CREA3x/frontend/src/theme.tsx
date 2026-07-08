import React, { useEffect, useMemo } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { useA11y } from './components/a11y-provider'

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

  useEffect(() => { ensureFontLoaded() }, [])

  const theme = useMemo(() => {
    const mode: 'light' | 'dark' = lightMode ? 'light' : 'dark'

    return createTheme({
      palette: {
        mode,
        // White text on primary so contained buttons are never low-contrast.
        primary: { main: PRIMARY_MAIN, contrastText: '#ffffff' },
        ...(mode === 'light'
          ? {
              background: {
                default: highContrast ? '#ffffff' : '#f5f7fa',
                paper: '#ffffff',
              },
              text: {
                primary: highContrast ? '#000000' : '#0f172a',
                secondary: highContrast ? '#000000' : '#475569',
              },
              divider: highContrast ? 'rgba(0,0,0,0.6)' : 'rgba(15,23,42,0.10)',
            }
          : {
              background: {
                default: highContrast ? '#000000' : '#0b1220',
                paper: highContrast ? '#000000' : '#111a2b',
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
        fontFamily: FONT_FAMILY,
        h1: { fontFamily: FONT_FAMILY, fontWeight: 700, letterSpacing: '0.01em' },
        h2: { fontFamily: FONT_FAMILY, fontWeight: 700, letterSpacing: '0.01em' },
        h3: { fontFamily: FONT_FAMILY, fontWeight: 600 },
        h4: { fontFamily: FONT_FAMILY, fontWeight: 600 },
        h5: { fontFamily: FONT_FAMILY, fontWeight: 600 },
        h6: { fontFamily: FONT_FAMILY, fontWeight: 600 },
        overline: { fontFamily: FONT_FAMILY },
        button: { fontWeight: 600 },
      },
      components: {
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: { textTransform: 'none', minHeight: 44, borderRadius: 12 },
            containedPrimary: { color: '#ffffff' },
          },
        },
        MuiPaper: {
          defaultProps: { elevation: 0 },
          styleOverrides: { root: { backgroundImage: 'none' } },
        },
        MuiAppBar: {
          defaultProps: { elevation: 0, color: 'default' },
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
  }, [lightMode, highContrast])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
