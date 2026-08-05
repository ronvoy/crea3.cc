import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Drawer,
  IconButton,
  Tooltip,
  Typography,
  Stack,
  Switch,
  Button,
  Divider,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'
import AccessibilityNewOutlinedIcon from '@mui/icons-material/AccessibilityNewOutlined'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import TextIncreaseOutlinedIcon from '@mui/icons-material/TextIncreaseOutlined'
import TextDecreaseOutlinedIcon from '@mui/icons-material/TextDecreaseOutlined'
import CloseIcon from '@mui/icons-material/Close'
import { useLocation } from 'react-router-dom'
import { useA11y } from './a11y-provider'
import { useI18n, Lang } from '../i18n'

function nextUp(v: 100 | 112 | 125 | 150) {
  return v === 100 ? 112 : v === 112 ? 125 : v === 125 ? 150 : 150
}
function nextDown(v: 100 | 112 | 125 | 150) {
  return v === 150 ? 125 : v === 125 ? 112 : v === 112 ? 100 : 100
}

const LANG_OPTIONS: Array<{ code: Lang; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'sl', label: 'Slovenščina' },
  { code: 'et', label: 'Eesti' },
  { code: 'be', label: 'Français (Belgique)' },
  { code: 'lt', label: 'Lietuvių' },
  { code: 'hr', label: 'Hrvatski' },
]

// Floating "Settings" rail (right edge). The OUTSIDE rail keeps only the settings
// gear + light/dark toggle; all the finer controls (high contrast, reduce motion,
// font size) live INSIDE the settings drawer.
export default function SettingsDock() {
  // The admin console has its own theme toggle — hide the global settings/theme
  // dock there so there is only one control.
  const location = useLocation()
  const {
    reduceMotion,
    fontScale,
    lightMode,
    setReduceMotion,
    setFontScale,
    setLightMode,
    reset,
    announce,
  } = useA11y()
  const { lang, setLang, t } = useI18n()

  const [open, setOpen] = useState(false)
  const [a11yOpen, setA11yOpen] = useState(false)

  // Draggable rail: stays pinned to the right edge, moves only vertically.
  // Default position is ~30% down from the top; the last position is remembered.
  const paperRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ active: boolean; offset: number; latest: number }>({ active: false, offset: 0, latest: 0 })
  const [dockTop, setDockTop] = useState<number>(() => {
    const saved = Number(typeof localStorage !== 'undefined' ? localStorage.getItem('crea3-dock-top') : '')
    if (Number.isFinite(saved) && saved > 0) return saved
    return Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.3)
  })

  function clampTop(y: number) {
    const h = paperRef.current?.offsetHeight ?? 160
    const max = (typeof window !== 'undefined' ? window.innerHeight : 800) - h - 8
    return Math.max(8, Math.min(Math.max(8, max), y))
  }
  function onDragStart(e: React.PointerEvent) {
    dragRef.current.active = true
    dragRef.current.offset = e.clientY - dockTop
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    e.preventDefault()
  }
  function onDragMove(e: React.PointerEvent) {
    if (!dragRef.current.active) return
    const next = clampTop(e.clientY - dragRef.current.offset)
    dragRef.current.latest = next
    setDockTop(next)
  }
  function onDragEnd(e: React.PointerEvent) {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    try { localStorage.setItem('crea3-dock-top', String(dragRef.current.latest || dockTop)) } catch {}
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
  }

  // Keep it on-screen when the window is resized.
  useEffect(() => {
    const onResize = () => setDockTop((y) => clampTop(y))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentLabel = useMemo(() => {
    return LANG_OPTIONS.find((o) => o.code === lang)?.label || lang.toUpperCase()
  }, [lang])

  // Allow other UI (e.g., Sidebar) to open Settings via a custom event.
  // The assistant chatbot and these dock panels are mutually exclusive: when the
  // chatbot opens it fires 'crea3-close-a11y' to close BOTH the settings drawer
  // and the accessibility panel.
  useEffect(() => {
    const openSettings = () => setOpen(true)
    const closeDockPanels = () => { setOpen(false); setA11yOpen(false) }
    window.addEventListener('crea3-open-settings', openSettings as any)
    window.addEventListener('crea3-close-a11y', closeDockPanels as any)
    return () => {
      window.removeEventListener('crea3-open-settings', openSettings as any)
      window.removeEventListener('crea3-close-a11y', closeDockPanels as any)
    }
  }, [])

  // Opening EITHER dock panel closes the assistant chatbot.
  useEffect(() => {
    if (open || a11yOpen) window.dispatchEvent(new Event('crea3-close-assistant'))
  }, [open, a11yOpen])

  // Not on the admin console (it has its own theme control).
  if (location.pathname.startsWith('/admin')) return null

  return (
    <>
      {/* Quick-access rail: draggable vertically along the right edge */}
      <Paper
        ref={paperRef}
        elevation={3}
        sx={{
          position: 'fixed',
          right: 12,
          top: dockTop,
          zIndex: (th) => th.zIndex.drawer + 2,
          p: 0.5,
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        {/* Drag handle — grab here to move the rail up/down */}
        <Box
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          role="separator"
          aria-label="Drag to move"
          title="Drag to move"
          sx={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            cursor: 'grab', '&:active': { cursor: 'grabbing' },
            color: 'text.disabled', touchAction: 'none', py: 0.25,
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
        <Tooltip title="Accessibility" placement="left">
          <IconButton aria-label="Open accessibility panel" onClick={() => setA11yOpen(true)}>
            <AccessibilityNewOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('openSettings')} placement="left">
          <IconButton aria-label={t('openSettings')} onClick={() => setOpen(true)}>
            <SettingsOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={lightMode ? 'Switch to dark mode' : 'Switch to light mode'} placement="left">
          <IconButton
            aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-pressed={lightMode}
            onClick={() => setLightMode(!lightMode)}
          >
            {lightMode ? <DarkModeOutlinedIcon /> : <LightModeOutlinedIcon />}
          </IconButton>
        </Tooltip>
      </Paper>

      {/* Accessibility panel — blank for now (placeholder to be filled in). */}
      <Drawer
        anchor="right"
        open={a11yOpen}
        onClose={() => setA11yOpen(false)}
        sx={{ zIndex: (th) => th.zIndex.drawer + 5 }}
      >
        <Box sx={{ width: { xs: '92vw', sm: 360 }, maxWidth: 420, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Accessibility
            </Typography>
            <IconButton aria-label={t('close')} onClick={() => setA11yOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <Box sx={{ p: 2, overflow: 'auto', flex: 1 }} />
        </Box>
      </Drawer>

      {/* Full settings drawer — above the top app bar, but below MUI menus/popovers
          (Select dropdowns) so those still open on top of the panel. */}
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        sx={{ zIndex: (th) => th.zIndex.drawer + 5 }}
      >
        <Box sx={{ width: { xs: '92vw', sm: 360 }, maxWidth: 420, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                {t('settings')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {currentLabel}
              </Typography>
            </Box>
            <IconButton aria-label={t('close')} onClick={() => setOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
            {/* Accessibility */}
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              {t('accessibility')}
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <ToggleRow
                title="Light mode"
                desc="White background"
                checked={lightMode}
                onChange={() => setLightMode(!lightMode)}
              />
              <ToggleRow
                title={t('reduceMotion')}
                desc="Disables animated backgrounds"
                checked={reduceMotion}
                onChange={() => setReduceMotion(!reduceMotion)}
              />

              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>{t('fontSize')}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Stored on this device
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
                  <IconButton aria-label={t('decreaseFont')} onClick={() => setFontScale(nextDown(fontScale))}>
                    <TextDecreaseOutlinedIcon />
                  </IconButton>
                  <Typography sx={{ flex: 1, textAlign: 'center' }}>{fontScale}%</Typography>
                  <IconButton aria-label={t('increaseFont')} onClick={() => setFontScale(nextUp(fontScale))}>
                    <TextIncreaseOutlinedIcon />
                  </IconButton>
                </Stack>
                <Box sx={{ textAlign: 'right', mt: 1 }}>
                  <Button
                    size="small"
                    onClick={() => {
                      reset()
                      announce('Settings reset')
                    }}
                  >
                    {t('reset')}
                  </Button>
                </Box>
              </Paper>
            </Stack>

            <Divider sx={{ my: 2.5 }} />

            {/* Language */}
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              {t('language')}
            </Typography>
            <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
              <InputLabel id="langSelectLabel">{t('language')}</InputLabel>
              <Select
                labelId="langSelectLabel"
                id="langSelect"
                label={t('language')}
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
              >
                {LANG_OPTIONS.map((o) => (
                  <MenuItem key={o.code} value={o.code}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              Language can be changed without losing your session.
            </Typography>

            <Divider sx={{ my: 2.5 }} />

            {/* Support */}
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Support
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                • Use the Help page for procedural guidance.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                • In a dispute, the assistant can answer questions and guide you through steps.
              </Typography>
            </Paper>
          </Box>
        </Box>
      </Drawer>
    </>
  )
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string
  desc: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {desc}
          </Typography>
        </Box>
        <Switch checked={checked} onChange={onChange} inputProps={{ 'aria-label': title }} />
      </Stack>
    </Paper>
  )
}
