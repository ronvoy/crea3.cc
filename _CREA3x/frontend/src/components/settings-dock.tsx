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
  Slider,
  Switch,
  Button,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'
import AccessibilityNewOutlinedIcon from '@mui/icons-material/AccessibilityNewOutlined'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import CloseIcon from '@mui/icons-material/Close'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import { useLocation } from 'react-router-dom'
import { useA11y } from './a11y-provider'
import AccessibilityPanel from './accessibility-panel'
import { useI18n, Lang } from '../i18n'
import { useLook } from '../theme'
import { API_BASE } from '../api/client'
import { useAnimations, EFFECTS, EASES } from './animator'
import { FONTS, BACKGROUNDS, compressImage, hsvToHex, hexToHsv } from '../theme-custom'
import TextField from '@mui/material/TextField'

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
  const look = useLook()
  const [presetName, setPresetName] = useState('')
  const [imgErr, setImgErr] = useState<string | null>(null)
  const bgFileRef = useRef<HTMLInputElement | null>(null)

  async function pickBackgroundImage(file: File | undefined) {
    if (!file) return
    setImgErr(null)
    try {
      const dataUrl = await compressImage(file)
      look.setCustom({ bgImage: dataUrl })
    } catch {
      setImgErr(t('bgImageFailed'))
    }
  }

  // A preset stores the look AND the animation configuration together.
  function savePreset(name: string) {
    if (!name.trim()) return
    try {
      look.saveCurrent(name, anim.cfg)
      setPresetName('')
      setImgErr(null)
    } catch {
      setImgErr(t('presetTooLarge'))
    }
  }
  function applyPreset(name: string) {
    const savedAnim = look.applySaved(name)
    if (savedAnim) anim.applyConfig(savedAnim)
  }
  function applySharedPreset(name: string) {
    const a = look.applyShared(name)
    if (a) anim.applyConfig(a)
  }
  async function publishPreset(name: string) {
    if (!name.trim()) return
    setImgErr(null)
    try {
      await look.publishShared(name, anim.cfg)
      look.saveCurrent(name, anim.cfg)   // keep a local copy too
      setPresetName('')
    } catch (e: any) {
      setImgErr(e?.message || t('presetPublishFailed'))
    }
  }
  const anim = useAnimations()
  // A global preset pushed by the admin carries an animation config too; the
  // theme provider cannot reach the animation provider, so apply it here.
  useEffect(() => {
    if (look.pendingGlobalAnim) {
      anim.applyConfig(look.pendingGlobalAnim)
      look.clearPendingGlobalAnim()
    }
  }, [look.pendingGlobalAnim])

  const [open, setOpen] = useState(false)
  const [a11yOpen, setA11yOpen] = useState(false)
  // Tutorial video: the platform's own MP4 (public/crea3-tutorial.mp4) played
  // in the modal on every viewport — no third-party embed, works offline.
  const [videoOpen, setVideoOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width:600px)')
  const tutorialSrc = '/crea3-tutorial.mp4'

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
          {/* Globe — the drawer opens on the language picker */}
          <IconButton aria-label={t('openSettings')} onClick={() => setOpen(true)}>
            <LanguageOutlinedIcon />
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

      {/* Tutorial video — local MP4 in a responsive modal (phone, tablet, desktop) */}
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
              // 16:9 box; the player letterboxes inside it. On phones the box is
              // capped to the viewport height so the controls stay reachable.
              pt: '56.25%', maxHeight: isMobile ? '70vh' : undefined,
            }}
          >
            {videoOpen ? (
              <Box
                component="video"
                src={tutorialSrc}
                title={t('tutorialVideo')}
                controls
                autoPlay
                playsInline
                preload="metadata"
                controlsList="nodownload"
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', bgcolor: 'black' }}
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

            {/* Appearance / animation / presets — only when the admin master
                switch (Admin → Themes) and the build flag allow customisation.
                When off, the drawer is just the language picker and support. */}
            {look.customizationEnabled ? (
              <>
            <Divider sx={{ my: 2.5 }} />

            {/* ── Appearance ────────────────────────────────────────────── */}
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              {t('themeTitle')}
            </Typography>

            {/* Shared presets published by the team — available to everyone,
                including visitors who are not signed in. */}
            {look.shared.length ? (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600, mb: 0.75 }}>
                  {t('sharedPresets')}
                </Typography>
                <Stack spacing={0.75}>
                  {look.shared.map((p) => (
                    <Paper key={`sh-${p.name}`} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{p.name}</Typography>
                          {p.author ? (
                            <Typography variant="caption" color="text.secondary" noWrap component="div">
                              {t('presetBy')} {p.author}
                            </Typography>
                          ) : null}
                        </Box>
                        <Button size="small" onClick={() => applySharedPreset(p.name)}>{t('presetApply')}</Button>
                        {look.customizationEnabled ? (
                          <Button size="small" color="error" onClick={() => look.deleteShared(p.name)}>
                            {t('presetDelete')}
                          </Button>
                        ) : null}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            ) : null}

            {/* Saved presets — always available, even when the editor is hidden */}
            {look.saved.length ? (
              <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                <InputLabel id="savedThemeLabel">{t('savedThemes')}</InputLabel>
                <Select labelId="savedThemeLabel" label={t('savedThemes')} value=""
                  onChange={(e) => applyPreset(String(e.target.value))}>
                  {look.saved.map((p) => (
                    <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}

            {look.customizationEnabled ? (
              <>
                {/* Typeface — applies to every page and text node */}
                <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                  <InputLabel id="fontLabel">{t('fontFace')}</InputLabel>
                  <Select labelId="fontLabel" label={t('fontFace')} value={look.custom.font}
                    onChange={(e) => look.setCustom({ font: String(e.target.value) })}>
                    {FONTS.map((f) => (
                      <MenuItem key={f.id} value={f.id} sx={{ fontFamily: f.stack }}>{f.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Background palette */}
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 2, mb: 0.75 }}>
                  {t('bgPreset')}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1 }}>
                  {BACKGROUNDS.map((b) => {
                    const active = look.custom.background === b.id
                    return (
                      <Paper key={b.id} variant="outlined" component="button" type="button"
                        onClick={() => look.setCustom({ background: b.id })}
                        aria-pressed={active}
                        sx={{
                          p: 1, borderRadius: 2, cursor: 'pointer', font: 'inherit', textAlign: 'left',
                          borderColor: active ? 'primary.main' : 'divider', borderWidth: active ? 2 : 1,
                          display: 'flex', alignItems: 'center', gap: 1, minWidth: 0,
                        }}>
                        <Box sx={{ width: 20, height: 20, borderRadius: 1, flexShrink: 0, border: 1, borderColor: 'divider',
                                   background: `linear-gradient(135deg, ${b.light[0]} 50%, ${b.dark[0]} 50%)` }} />
                        <Typography variant="caption" noWrap sx={{ fontWeight: active ? 700 : 500 }}>{b.label}</Typography>
                      </Paper>
                    )
                  })}
                </Box>

                {/* Background image (overrides the palette) */}
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 1.5 }}>
                  <Typography sx={{ fontWeight: 600 }}>{t('bgImageTitle')}</Typography>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                    {t('bgImageHint')}
                  </Typography>
                  <input
                    ref={bgFileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => { pickBackgroundImage(e.target.files?.[0]); e.currentTarget.value = '' }}
                  />
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                    <Button size="small" variant="outlined" onClick={() => bgFileRef.current?.click()}>
                      {look.custom.bgImage ? t('bgImageReplace') : t('bgImageUpload')}
                    </Button>
                    {look.custom.bgImage ? (
                      <>
                        <Box component="img"
                          src={look.custom.bgImage.startsWith('data:') ? look.custom.bgImage : API_BASE + look.custom.bgImage}
                          alt=""
                          sx={{ width: 54, height: 34, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider' }} />
                        <Button size="small" color="inherit" onClick={() => look.setCustom({ bgImage: '' })}>
                          {t('bgImageRemove')}
                        </Button>
                      </>
                    ) : null}
                  </Stack>
                  {look.custom.bgImage ? (
                    <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                      <InputLabel id="bgModeLabel">{t('bgImageMode')}</InputLabel>
                      <Select labelId="bgModeLabel" label={t('bgImageMode')} value={look.custom.bgImageMode}
                        onChange={(e) => look.setCustom({ bgImageMode: e.target.value as any })}>
                        <MenuItem value="cover">{t('bgModeCover')}</MenuItem>
                        <MenuItem value="tile">{t('bgModeTile')}</MenuItem>
                      </Select>
                    </FormControl>
                  ) : null}
                  {imgErr ? <Typography variant="caption" color="error" component="div" sx={{ mt: 1 }}>{imgErr}</Typography> : null}
                </Paper>

                {/* Region palettes: cards, header bar, side navigation.
                    Each maps to a specific container in the DOM. */}
                <PaletteGroup
                  t={t} look={look}
                  title={t('cardPalette')} hint=".MuiPaper-outlined.MuiPaper-rounded"
                  paletteKey="cardBackground" opacityKey="surfaceOpacity" colorKey="cardColor"
                  opacityLabel={t('cardOpacity')}
                />
                <PaletteGroup
                  t={t} look={look}
                  title={t('headerPalette')} hint=".MuiAppBar-root"
                  paletteKey="headerBackground" opacityKey="headerOpacity" colorKey="headerColor"
                  opacityLabel={t('headerOpacity')}
                />
                <PaletteGroup
                  t={t} look={look}
                  title={t('navPalette')} hint=".MuiDrawer-paper"
                  paletteKey="navBackground" opacityKey="navOpacity" colorKey="navColor"
                  opacityLabel={t('navOpacity')}
                />

                {/* Card style */}
                <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                  <InputLabel id="cardStyleLabel">{t('cardStyle')}</InputLabel>
                  <Select labelId="cardStyleLabel" label={t('cardStyle')} value={look.custom.cardStyle}
                    onChange={(e) => look.setCustom({ cardStyle: e.target.value as any })}>
                    <MenuItem value="outlined">{t('cardOutlined')}</MenuItem>
                    <MenuItem value="glass">{t('cardGlass')}</MenuItem>
                    <MenuItem value="elevated">{t('cardElevated')}</MenuItem>
                  </Select>
                </FormControl>

                <Box sx={{ textAlign: 'right', mt: 1 }}>
                  <Button size="small" onClick={look.reset}>{t('appearanceReset')}</Button>
                </Box>
              </>
            ) : null}

            <Divider sx={{ my: 2.5 }} />

            {/* ── Animation (configured in public/animation.yaml) ────────── */}
            {look.customizationEnabled ? (
            <>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              {t('animTitle')}
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 1.5 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }}>{t('animMaster')}</Typography>
                  <Typography variant="caption" color="text.secondary" component="div">{t('animMasterHint')}</Typography>
                </Box>
                <Switch
                  checked={!!Number(anim.cfg.animation)}
                  onChange={(e) => anim.setMaster(e.target.checked)}
                  inputProps={{ 'aria-label': t('animMaster') }}
                />
              </Stack>
            </Paper>

            {Number(anim.cfg.animation) ? (
              <>
                {/* Global defaults */}
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 1.5 }}>
                  <Typography sx={{ fontWeight: 600, mb: 1 }}>{t('animDefaults')}</Typography>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 68 }}>{t('animDuration')}</Typography>
                    <Slider size="small" min={0.1} max={2} step={0.05} value={Number(anim.cfg.defaults.duration)}
                      onChange={(_e, v) => anim.setDefaults({ duration: v as number })} sx={{ flex: 1 }}
                      aria-label={t('animDuration')} />
                    <Typography variant="caption" sx={{ width: 34, textAlign: 'right' }}>{Number(anim.cfg.defaults.duration).toFixed(2)}s</Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 68 }}>{t('animStagger')}</Typography>
                    <Slider size="small" min={0} max={0.3} step={0.01} value={Number(anim.cfg.defaults.stagger)}
                      onChange={(_e, v) => anim.setDefaults({ stagger: v as number })} sx={{ flex: 1 }}
                      aria-label={t('animStagger')} />
                    <Typography variant="caption" sx={{ width: 34, textAlign: 'right' }}>{Number(anim.cfg.defaults.stagger).toFixed(2)}s</Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 68 }}>{t('animDistance')}</Typography>
                    <Slider size="small" min={0} max={80} step={2} value={Number(anim.cfg.defaults.distance)}
                      onChange={(_e, v) => anim.setDefaults({ distance: v as number })} sx={{ flex: 1 }}
                      aria-label={t('animDistance')} />
                    <Typography variant="caption" sx={{ width: 34, textAlign: 'right' }}>{Number(anim.cfg.defaults.distance)}px</Typography>
                  </Stack>
                  <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                    <InputLabel id="animEaseLabel">{t('animEase')}</InputLabel>
                    <Select labelId="animEaseLabel" label={t('animEase')} value={anim.cfg.defaults.ease}
                      onChange={(e) => anim.setDefaults({ ease: String(e.target.value) })}>
                      {EASES.map((e) => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Paper>

                {/* Per-target controls */}
                {Object.entries(anim.cfg.targets || {}).map(([name, tg]: any) => (
                  <Paper key={name} variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 1.5 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{name}</Typography>
                        <Typography variant="caption" color="text.secondary" component="div" sx={{ wordBreak: 'break-all' }}>
                          {tg.selector}
                        </Typography>
                      </Box>
                      <Switch checked={!!Number(tg.enabled)}
                        onChange={(e) => anim.setTarget(name, { enabled: e.target.checked ? 1 : 0 })}
                        inputProps={{ 'aria-label': name }} />
                    </Stack>
                    {Number(tg.enabled) ? (
                      <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
                        <InputLabel id={`fx-${name}`}>{t('animEffect')}</InputLabel>
                        <Select labelId={`fx-${name}`} label={t('animEffect')} value={tg.effect || 'fade'}
                          onChange={(e) => anim.setTarget(name, { effect: String(e.target.value) })}>
                          {EFFECTS.map((fx) => <MenuItem key={fx} value={fx}>{fx}</MenuItem>)}
                        </Select>
                      </FormControl>
                    ) : null}
                  </Paper>
                ))}

                <Box sx={{ textAlign: 'right', mt: 1 }}>
                  <Button size="small" onClick={anim.resetToFile}>{t('animResetFile')}</Button>
                </Box>
              </>
            ) : null}
            </>
            ) : null}

            {/* ── Presets: theme + animation saved together ──────────────── */}
            {look.customizationEnabled ? (
              <>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                  {t('presetsTitle')}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5, mb: 1.5 }}>
                  {t('presetsHint')}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <TextField size="small" sx={{ flex: 1, minWidth: 140 }} label={t('presetName')} value={presetName}
                    onChange={(e) => setPresetName(e.target.value.slice(0, 40))} />
                  <Button variant="outlined" disabled={!presetName.trim()} onClick={() => savePreset(presetName)}>
                    {t('saveTheme')}
                  </Button>
                  <Button variant="contained" disabled={!presetName.trim()} onClick={() => publishPreset(presetName)}>
                    {t('presetPublish')}
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                  {t('presetPublishHint')}
                </Typography>
                {look.saved.length ? (
                  <Stack spacing={1} sx={{ mt: 1.5 }}>
                    {look.saved.map((p) => (
                      <Paper key={p.name} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{p.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap component="div">
                              {new Date(p.savedAt).toLocaleDateString()} · {p.font} · {p.background}
                              {p.bgImage ? ` · ${t('bgImageTitle').toLowerCase()}` : ''}
                              {p.anim ? ` · ${t('animTitle').toLowerCase()}` : ''}
                            </Typography>
                          </Box>
                          <Button size="small" onClick={() => applyPreset(p.name)}>{t('presetApply')}</Button>
                          {/* Edit = load it into the editor, then Save with the
                              same name to overwrite. */}
                          <Button size="small" color="inherit"
                            onClick={() => { applyPreset(p.name); setPresetName(p.name) }}>
                            {t('presetEdit')}
                          </Button>
                          <Button size="small" color="error" onClick={() => look.deleteSaved(p.name)}>
                            {t('presetDelete')}
                          </Button>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                ) : null}
                {imgErr ? <Typography variant="caption" color="error" component="div" sx={{ mt: 1 }}>{imgErr}</Typography> : null}

                <Divider sx={{ my: 2.5 }} />
              </>
            ) : null}

              </>
            ) : null}

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


/**
 * Palette + opacity control for ONE region of the UI (cards, header bar, side
 * nav). "Follow background" makes the region inherit the page palette.
 */
function PaletteGroup({
  t, look, title, hint, paletteKey, opacityKey, opacityLabel, colorKey,
}: {
  t: (k: any) => string
  look: ReturnType<typeof useLook>
  title: string
  hint: string
  paletteKey: 'cardBackground' | 'headerBackground' | 'navBackground'
  opacityKey: 'surfaceOpacity' | 'headerOpacity' | 'navOpacity'
  opacityLabel: string
  colorKey: 'cardColor' | 'headerColor' | 'navColor'
}) {
  const current = (look.custom as any)[paletteKey] as string
  const opacity = (look.custom as any)[opacityKey] as number
  const customHex = ((look.custom as any)[colorKey] as string) || ''
  const hsv = hexToHsv(customHex || '#dde8f3')
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.disabled" component="div" sx={{ mb: 0.75, fontSize: 11 }}>
        {hint}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1 }}>
        <Paper
          variant="outlined" component="button" type="button"
          onClick={() => look.setCustom({ [paletteKey]: '' } as any)}
          aria-pressed={!current}
          sx={{ p: 1, borderRadius: 2, cursor: 'pointer', font: 'inherit', textAlign: 'left', minWidth: 0,
                borderColor: !current ? 'primary.main' : 'divider', borderWidth: !current ? 2 : 1 }}
        >
          <Typography variant="caption" noWrap sx={{ fontWeight: !current ? 700 : 500 }}>
            {t('cardPaletteAuto')}
          </Typography>
        </Paper>
        {BACKGROUNDS.map((b) => {
          const active = current === b.id
          return (
            <Paper
              key={`${paletteKey}-${b.id}`} variant="outlined" component="button" type="button"
              onClick={() => look.setCustom({ [paletteKey]: b.id } as any)}
              aria-pressed={active}
              sx={{ p: 1, borderRadius: 2, cursor: 'pointer', font: 'inherit', textAlign: 'left', minWidth: 0,
                    borderColor: active ? 'primary.main' : 'divider', borderWidth: active ? 2 : 1,
                    display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <Box sx={{ width: 20, height: 20, borderRadius: 1, flexShrink: 0, border: 1, borderColor: 'divider',
                         background: `linear-gradient(135deg, ${b.light[1]} 50%, ${b.dark[1]} 50%)` }} />
              <Typography variant="caption" noWrap sx={{ fontWeight: active ? 700 : 500 }}>{b.label}</Typography>
            </Paper>
          )
        })}
      </Box>
      {/* Custom colour (HSV) — overrides the palette above. In dark mode the
          hue is kept and only the brightness is adapted. */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.25 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{t('customColor')}</Typography>
        {customHex ? (
          <>
            <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: customHex, border: 1, borderColor: 'divider' }} />
            <Typography variant="caption" color="text.secondary">{customHex}</Typography>
            <Button size="small" onClick={() => look.setCustom({ [colorKey]: '' } as any)}>{t('customColorClear')}</Button>
          </>
        ) : (
          <Button size="small" onClick={() => look.setCustom({ [colorKey]: hsvToHex(hsv) } as any)}>
            {t('customColorUse')}
          </Button>
        )}
      </Stack>
      {customHex ? (
        <Box sx={{ mb: 0.5 }}>
          {([['h', 360, 'H'], ['s', 100, 'S'], ['v', 100, 'V']] as const).map(([ch, max, label]) => (
            <Stack key={ch} direction="row" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 18 }}>{label}</Typography>
              <Slider size="small" min={0} max={max as number} value={(hsv as any)[ch]}
                onChange={(_e, v) => look.setCustom({ [colorKey]: hsvToHex({ ...hsv, [ch]: v as number }) } as any)}
                aria-label={`${title} ${label}`} sx={{ flex: 1 }} />
              <Typography variant="caption" sx={{ width: 28, textAlign: 'right' }}>{(hsv as any)[ch]}</Typography>
            </Stack>
          ))}
        </Box>
      ) : null}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ width: 74 }}>{opacityLabel}</Typography>
        <Slider
          size="small" min={40} max={100} step={5} value={opacity}
          onChange={(_e, v) => look.setCustom({ [opacityKey]: v as number } as any)}
          aria-label={opacityLabel} sx={{ flex: 1 }}
        />
        <Typography variant="caption" sx={{ width: 34, textAlign: 'right' }}>{opacity}%</Typography>
      </Stack>
    </Box>
  )
}
