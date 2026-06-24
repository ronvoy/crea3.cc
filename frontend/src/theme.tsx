import React, { useMemo } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import { useA11y } from './components/a11y-provider'

// ── Minimal Material UI theme ─────────────────────────────────────────────────
// Clean, flat, lots of whitespace. Reads accessibility state (light/dark mode,
// high-contrast, font scale) from the existing A11yProvider so the toggles in
// the settings dock keep working.
//
// Font scale is applied by a11y-provider via documentElement.style.fontSize (a
// percentage). MUI sizes in rem, so everything scales automatically — no extra
// wiring needed here.

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { lightMode, highContrast } = useA11y()

  const theme = useMemo(() => {
    const mode: 'light' | 'dark' = lightMode ? 'light' : 'dark'

    return createTheme({
      palette: {
        mode,
        primary: { main: '#2563eb' },
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
      typography: (() => {
        // "Classic robot" display font for headings/branding; clean sans for body.
        const robot = "'Orbitron', ui-sans-serif, system-ui, sans-serif"
        return {
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          h1: { fontFamily: robot, fontWeight: 700, letterSpacing: '0.01em' },
          h2: { fontFamily: robot, fontWeight: 700, letterSpacing: '0.01em' },
          h3: { fontFamily: robot, fontWeight: 600 },
          h4: { fontFamily: robot, fontWeight: 600 },
          h5: { fontFamily: robot, fontWeight: 600 },
          h6: { fontFamily: robot, fontWeight: 600 },
          overline: { fontFamily: robot },
          button: { fontWeight: 600 },
        }
      })(),
      components: {
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: { textTransform: 'none', minHeight: 44, borderRadius: 12 },
          },
        },
        MuiPaper: {
          defaultProps: { elevation: 0 },
          styleOverrides: {
            root: { backgroundImage: 'none' },
          },
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
