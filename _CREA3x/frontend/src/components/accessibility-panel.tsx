import React, { useState } from 'react'
import {
  Box, Stack, Typography, Switch, Paper, Button, IconButton,
  ToggleButton, ToggleButtonGroup, Tabs, Tab, Divider,
} from '@mui/material'
import TextIncreaseOutlinedIcon from '@mui/icons-material/TextIncreaseOutlined'
import TextDecreaseOutlinedIcon from '@mui/icons-material/TextDecreaseOutlined'
import RemoveIcon from '@mui/icons-material/Remove'
import AddIcon from '@mui/icons-material/Add'
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined'
import { useA11y, A11yPrefs } from './a11y-provider'
import { useI18n } from '../i18n'

type FontScale = 100 | 112 | 125 | 150
function nextUp(v: FontScale): FontScale { return v === 100 ? 112 : v === 112 ? 125 : 125 }
function nextDown(v: FontScale): FontScale { return v === 150 ? 125 : v === 125 ? 112 : v === 112 ? 100 : 100 }

// ── Reusable centred rows ──────────────────────────────────────────────────────
function Row({ label, desc, control }: { label: string; desc?: string; control: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between" spacing={1.25}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>{label}</Typography>
          {desc && <Typography variant="caption" color="text.secondary" component="div">{desc}</Typography>}
        </Box>
        <Box sx={{ flexShrink: 0 }}>{control}</Box>
      </Stack>
    </Paper>
  )
}

function ToggleRow({ label, desc, on, onChange }:
  { label: string; desc?: string; on: boolean; onChange: (v: boolean) => void }) {
  return <Row label={label} desc={desc} control={
    <Switch checked={on} onChange={(e) => onChange(e.target.checked)} inputProps={{ 'aria-label': label }} />
  } />
}

function Segmented<T extends string>({ value, options, onChange, label }:
  { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <ToggleButtonGroup exclusive size="small" value={value}
      onChange={(_e, v) => { if (v) onChange(v as T) }} aria-label={label} sx={{ flexWrap: 'wrap' }}>
      {options.map((o) => (
        <ToggleButton key={o.value} value={o.value} sx={{ textTransform: 'none', px: 1.5 }}>{o.label}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

// ── Groups of controls ─────────────────────────────────────────────────────────
function ContentControls() {
  const { prefs, setPref, fontScale, setFontScale } = useA11y()
  const { t } = useI18n()
  return (
    <Stack spacing={1.5}>
      <ToggleRow label={t('a11yReadableFont')} desc={t('a11yReadableFontDesc')}
        on={prefs.readableFont} onChange={(v) => setPref('readableFont', v)} />
      <ToggleRow label={t('a11yHighlightHeadings')} desc={t('a11yHighlightHeadingsDesc')}
        on={prefs.highlightHeadings} onChange={(v) => setPref('highlightHeadings', v)} />
      <ToggleRow label={t('a11yMagnifier')} desc={t('a11yMagnifierDesc')}
        on={prefs.magnifier} onChange={(v) => setPref('magnifier', v)} />
      <Row label={t('a11yFontSizing')} desc={t('a11yFontSizingDesc')} control={
        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton size="small" aria-label={t('decreaseFont')} onClick={() => setFontScale(nextDown(fontScale as FontScale))}>
            <TextDecreaseOutlinedIcon />
          </IconButton>
          <Typography sx={{ width: 52, textAlign: 'center' }}>{fontScale}%</Typography>
          <IconButton size="small" aria-label={t('increaseFont')} onClick={() => setFontScale(nextUp(fontScale as FontScale))}>
            <TextIncreaseOutlinedIcon />
          </IconButton>
        </Stack>
      } />
      <Row label={t('a11yScaleContent')} desc={t('a11yScaleContentDesc')} control={
        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton size="small" aria-label="-" disabled={prefs.contentScale <= 90}
            onClick={() => setPref('contentScale', Math.max(90, prefs.contentScale - 10))}>
            <RemoveIcon />
          </IconButton>
          <Typography sx={{ width: 52, textAlign: 'center' }}>{prefs.contentScale}%</Typography>
          <IconButton size="small" aria-label="+" disabled={prefs.contentScale >= 130}
            onClick={() => setPref('contentScale', Math.min(130, prefs.contentScale + 10))}>
            <AddIcon />
          </IconButton>
        </Stack>
      } />
      <Row label={t('a11yLetterSpacing')} desc={t('a11yLetterSpacingDesc')} control={
        <Segmented label={t('a11yLetterSpacing')} value={prefs.letterSpacing}
          onChange={(v) => setPref('letterSpacing', v as A11yPrefs['letterSpacing'])}
          options={[
            { value: 'normal', label: t('a11yNormal') },
            { value: 'wide', label: t('a11yWide') },
            { value: 'xwide', label: t('a11yXWide') },
            { value: 'ultra', label: t('a11yUltra') },
          ]} />
      } />
      <Row label={t('a11yLineHeight')} desc={t('a11yLineHeightDesc')} control={
        <Segmented label={t('a11yLineHeight')} value={prefs.lineHeight}
          onChange={(v) => setPref('lineHeight', v as A11yPrefs['lineHeight'])}
          options={[
            { value: 'normal', label: t('a11yNormal') },
            { value: 'generous', label: t('a11yGenerous') },
            { value: 'double', label: t('a11yDouble') },
          ]} />
      } />
    </Stack>
  )
}

function ColorControls() {
  const { prefs, setPref } = useA11y()
  const { t } = useI18n()
  const colorInput = (key: 'textColor' | 'headingColor' | 'bgColor', label: string) => (
    <Stack alignItems="center" spacing={0.5}>
      <Box component="input" type="color" aria-label={label}
        value={prefs[key] || (key === 'bgColor' ? '#ffffff' : '#000000')}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPref(key, e.target.value)}
        sx={{ width: 44, height: 34, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0, cursor: 'pointer' }} />
      <Typography variant="caption">{label}</Typography>
    </Stack>
  )
  return (
    <Stack spacing={1.5}>
      <Row label={t('a11yScheme')} desc={t('a11ySchemeDesc')} control={
        <Segmented label={t('a11yScheme')} value={prefs.scheme}
          onChange={(v) => setPref('scheme', v as A11yPrefs['scheme'])}
          options={[
            { value: 'default', label: t('a11ySchemeDefault') },
            { value: 'dark', label: t('a11ySchemeDark') },
            { value: 'light', label: t('a11ySchemeLight') },
            { value: 'hc', label: t('a11ySchemeHc') },
          ]} />
      } />
      <Row label={t('a11ySaturation')} desc={t('a11ySaturationDesc')} control={
        <Segmented label={t('a11ySaturation')} value={prefs.saturation}
          onChange={(v) => setPref('saturation', v as A11yPrefs['saturation'])}
          options={[
            { value: 'normal', label: t('a11ySatNormal') },
            { value: 'high', label: t('a11ySatHigh') },
            { value: 'low', label: t('a11ySatLow') },
            { value: 'mono', label: t('a11ySatMono') },
          ]} />
      } />
      <Row label={t('a11yCustomColors')} desc={t('a11yCustomColorsDesc')} control={
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {colorInput('textColor', t('a11yColorText'))}
          {colorInput('headingColor', t('a11yColorHeading'))}
          {colorInput('bgColor', t('a11yColorBg'))}
          <Button size="small" onClick={() => { setPref('textColor', ''); setPref('headingColor', ''); setPref('bgColor', '') }}>
            {t('a11yClearColors')}
          </Button>
        </Stack>
      } />
    </Stack>
  )
}

function OrientationControls() {
  const { prefs, setPref } = useA11y()
  const { t } = useI18n()
  return (
    <Stack spacing={1.5}>
      <ToggleRow label={t('a11yMuteSounds')} desc={t('a11yMuteSoundsDesc')}
        on={prefs.muteSounds} onChange={(v) => setPref('muteSounds', v)} />
      <ToggleRow label={t('a11yReadingGuide')} desc={t('a11yReadingGuideDesc')}
        on={prefs.readingGuide} onChange={(v) => setPref('readingGuide', v)} />
      <ToggleRow label={t('a11yReadingMask')} desc={t('a11yReadingMaskDesc')}
        on={prefs.readingMask} onChange={(v) => setPref('readingMask', v)} />
      <ToggleRow label={t('a11yStopAnimations')} desc={t('a11yStopAnimationsDesc')}
        on={prefs.stopAnimations} onChange={(v) => setPref('stopAnimations', v)} />
      <ToggleRow label={t('a11yHoverHighlight')} desc={t('a11yHoverHighlightDesc')}
        on={prefs.hoverHighlight} onChange={(v) => setPref('hoverHighlight', v)} />
      <ToggleRow label={t('a11yFocusHighlight')} desc={t('a11yFocusHighlightDesc')}
        on={prefs.focusHighlight} onChange={(v) => setPref('focusHighlight', v)} />
      <Row label={t('a11yPointer')} desc={t('a11yPointerDesc')} control={
        <Segmented label={t('a11yPointer')} value={prefs.cursor}
          onChange={(v) => setPref('cursor', v as A11yPrefs['cursor'])}
          options={[
            { value: 'default', label: t('a11yPointerDefault') },
            { value: 'black', label: t('a11yPointerBlack') },
            { value: 'white', label: t('a11yPointerWhite') },
          ]} />
      } />
      <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
        <Typography sx={{ fontWeight: 600 }}>{t('a11ySpeech')}</Typography>
        <Typography variant="caption" color="text.secondary" component="div">{t('a11ySpeechDesc')}</Typography>
      </Paper>
    </Stack>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mt: 1 }}>{children}</Typography>
}

// ── The panel body (rendered inside the settings-dock Drawer) ───────────────────
export default function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  const { reset, announce } = useA11y()
  const { t } = useI18n()
  const [tab, setTab] = useState(0) // 0 All, 1 Content, 2 Colour, 3 Orientation

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider', px: 1, flexShrink: 0 }}>
        <Tab label={t('a11yTabAll')} sx={{ textTransform: 'none' }} />
        <Tab label={t('a11yTabContent')} sx={{ textTransform: 'none' }} />
        <Tab label={t('a11yTabColor')} sx={{ textTransform: 'none' }} />
        <Tab label={t('a11yTabOrient')} sx={{ textTransform: 'none' }} />
      </Tabs>

      <Box sx={{ overflow: 'auto', flex: 1, p: { xs: 2, md: 3 } }}>
        {/* Centred column */}
        <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto' }}>
          {tab === 0 && (
            <Stack spacing={2}>
              <Box><SectionTitle>{t('a11yTabContent')}</SectionTitle><Box sx={{ mt: 1 }}><ContentControls /></Box></Box>
              <Divider />
              <Box><SectionTitle>{t('a11yTabColor')}</SectionTitle><Box sx={{ mt: 1 }}><ColorControls /></Box></Box>
              <Divider />
              <Box><SectionTitle>{t('a11yTabOrient')}</SectionTitle><Box sx={{ mt: 1 }}><OrientationControls /></Box></Box>
            </Stack>
          )}
          {tab === 1 && <ContentControls />}
          {tab === 2 && <ColorControls />}
          {tab === 3 && <OrientationControls />}

          {/* AgID / WCAG note card — always at the end */}
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mt: 3, bgcolor: 'action.hover' }}>
            <Stack direction="row" spacing={1.25} alignItems="flex-start">
              <VerifiedUserOutlinedIcon color="success" sx={{ mt: 0.25 }} />
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{t('a11yNoteTitle')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('a11yNoteBody')}</Typography>
              </Box>
            </Stack>
          </Paper>

          <Box sx={{ textAlign: 'center', mt: 3 }}>
            <Button variant="outlined" onClick={() => { reset(); announce(t('dockSettingsReset')) }}>{t('a11yResetAll')}</Button>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
