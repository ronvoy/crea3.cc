import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Dialog,
  DialogContent,
  useMediaQuery,
  Drawer,
  IconButton,
  Tooltip,
  Typography,
  Stack,
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
import CloseIcon from '@mui/icons-material/Close'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import { useLocation } from 'react-router-dom'
import { useA11y } from './a11y-provider'
import AccessibilityPanel from './accessibility-panel'
import { useI18n, Lang } from '../i18n'

const LANG_OPTIONS: Array<{ code: Lang; label: string; flag: string }> = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'sl', label: 'Slovenščina', flag: '🇸🇮' },
  { code: 'et', label: 'Eesti', flag: '🇪🇪' },
  { code: 'be', label: 'Belgium (French)', flag: '🇧🇪' },
  { code: 'nl', label: 'Belgium (Dutch)', flag: '🇧🇪' },
  { code: 'lt', label: 'Lietuvių', flag: '🇱🇹' },
  { code: 'hr', label: 'Hrvatski', flag: '🇭🇷' },
]

// Floating "Settings" rail (right edge). The OUTSIDE rail keeps only the settings
// gear + light/dark toggle; all the finer controls (high contrast, reduce motion,
// font size) live INSIDE the settings drawer.
export default function SettingsDock() {
  // The admin console has its own theme toggle — hide the global settings/theme
  // dock there so there is only one control.
  const location = useLocation()
  const { lightMode, setLightMode } = useA11y()
  const { lang, setLang, t } = useI18n()

  const [open, setOpen] = useState(false)
  const [a11yOpen, setA11yOpen] = useState(false)
  // Tutorial video: the vertical Shorts cut is used on phone-sized viewports,
  // the landscape one on tablet/desktop.
  const [videoOpen, setVideoOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width:600px)')
  const videoId = isMobile ? 'q6Du9fNiL6M' : 'RE3c2oEhjPg'

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
          aria-label={t('dockDrag')}
          title={t('dockDrag')}
          sx={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            cursor: 'grab', '&:active': { cursor: 'grabbing' },
            color: 'text.disabled', touchAction: 'none', py: 0.25,
          }}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
        <Tooltip title={t('accessibility')} placement="left">
          <IconButton aria-label={t('dockOpenA11y')} onClick={() => setA11yOpen(true)}>
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
        <Tooltip title={t('tutorialVideo')} placement="left">
          <IconButton aria-label={t('tutorialVideo')} onClick={() => setVideoOpen(true)}>
            <PlayCircleOutlineIcon />
          </IconButton>
        </Tooltip>
      </Paper>

      {/* Tutorial video — responsive embed (Shorts on mobile, standard elsewhere) */}
      <Dialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        fullWidth
        maxWidth={isMobile ? 'xs' : 'md'}
        sx={{
          zIndex: (th) => th.zIndex.drawer + 10,
          '& .MuiDialog-paper': { m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: '100%' }, borderRadius: 3, overflow: 'hidden' },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.25 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t('tutorialVideo')}</Typography>
          <IconButton size="small" aria-label={t('close')} onClick={() => setVideoOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <DialogContent sx={{ p: 0, pb: 2, px: 2 }}>
          <Box
            sx={{
              position: 'relative', width: '100%', borderRadius: 2, overflow: 'hidden', bgcolor: 'black',
              // 9:16 for the vertical Shorts cut, 16:9 for the landscape video.
              pt: isMobile ? '177.78%' : '56.25%',
            }}
          >
            {videoOpen ? (
              <Box
                component="iframe"
                src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
                title={t('tutorialVideo')}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              />
            ) : null}
          </Box>
        </DialogContent>
      </Dialog>

      {/* Accessibility panel — WCAG 2.2 / AgID, ~70% viewport, centred content */}
      <Drawer
        anchor="right"
        open={a11yOpen}
        onClose={() => setA11yOpen(false)}
        sx={{ zIndex: (th) => th.zIndex.drawer + 5 }}
      >
        <Box sx={{ width: { xs: '96vw', md: '70vw' }, maxWidth: 1040, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                {t('accessibility')}
              </Typography>
            </Box>
            <IconButton aria-label={t('close')} onClick={() => setA11yOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>
          <AccessibilityPanel onClose={() => setA11yOpen(false)} />
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
            {/* Language (with country flags) — kept at the top */}
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
                renderValue={(val) => {
                  const o = LANG_OPTIONS.find((x) => x.code === val)
                  return o ? `${o.flag}  ${o.label}` : String(val)
                }}
              >
                {LANG_OPTIONS.map((o) => (
                  <MenuItem key={o.code} value={o.code}>
                    <Box component="span" sx={{ mr: 1 }}>{o.flag}</Box>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              {t('dockLangNote')}
            </Typography>

            <Divider sx={{ my: 2.5 }} />

            {/* Support */}
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              {t('settingsSupportTitle')}
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                • {t('settingsSupportHelp')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                • {t('settingsSupportAssistant')}
              </Typography>
            </Paper>
          </Box>
        </Box>
      </Drawer>
    </>
  )
}
