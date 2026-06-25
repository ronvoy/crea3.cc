import React, { useState } from 'react'
import {
  Box,
  Paper,
  Stack,
  Typography,
  MenuItem,
  Select,
  IconButton,
  Button,
  Chip,
  Tooltip,
  Snackbar,
  Alert,
} from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'
import CloseIcon from '@mui/icons-material/Close'
import SaveIcon from '@mui/icons-material/Save'
import { useAppConfig, FONT_OPTIONS, THEME_PRESETS } from '../app-config'

// Dev-only floating toolbar: switch among 10+ themes and fonts on the fly, then
// "Apply to .env" to persist FONT_TYPE / THEME_TYPE (used in production).
export default function DevToolbar() {
  const { isDev, fontType, themeType, setFontType, setThemeType, persistToServer } = useAppConfig()
  const [open, setOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null)

  if (!isDev) return null

  async function apply() {
    setSaving(true)
    try {
      await persistToServer()
      setSnack({ msg: 'Saved FONT_TYPE / THEME_TYPE to .env', sev: 'success' })
    } catch (e: any) {
      setSnack({ msg: e?.message ?? 'Failed to write .env', sev: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Tooltip title="Dev theme tools" placement="left">
        <IconButton
          onClick={() => setOpen(true)}
          sx={{ position: 'fixed', top: 72, right: 12, zIndex: (t) => t.zIndex.drawer + 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
          aria-label="Open dev toolbar"
        >
          <TuneIcon />
        </IconButton>
      </Tooltip>
    )
  }

  return (
    <>
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          top: 72,
          right: 12,
          zIndex: (t) => t.zIndex.drawer + 3,
          p: 1.5,
          borderRadius: 3,
          width: 260,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <TuneIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flexGrow: 1 }}>Dev tools</Typography>
          <Chip label="dev" size="small" color="warning" variant="outlined" />
          <IconButton size="small" onClick={() => setOpen(false)} aria-label="Collapse"><CloseIcon fontSize="small" /></IconButton>
        </Stack>

        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary">Theme ({THEME_PRESETS.length})</Typography>
            <Select size="small" fullWidth value={themeType} onChange={(e) => setThemeType(e.target.value)}>
              {THEME_PRESETS.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  <Box component="span" sx={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', bgcolor: t.primary, mr: 1, verticalAlign: 'middle' }} />
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">Font ({FONT_OPTIONS.length})</Typography>
            <Select size="small" fullWidth value={fontType} onChange={(e) => setFontType(e.target.value)}>
              {FONT_OPTIONS.map((f) => (
                <MenuItem key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.label}</MenuItem>
              ))}
            </Select>
          </Box>

          <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={apply} disabled={saving}>
            {saving ? 'Saving…' : 'Apply to .env'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Live preview is instant. “Apply” persists to .env for production.
          </Typography>
        </Stack>
      </Paper>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {snack ? <Alert severity={snack.sev} onClose={() => setSnack(null)}>{snack.msg}</Alert> : undefined}
      </Snackbar>
    </>
  )
}
