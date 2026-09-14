import React, { useEffect, useState } from 'react'
import {
  Box, Paper, Stack, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Switch, Divider, Link as MuiLink,
} from '@mui/material'
import CookieOutlinedIcon from '@mui/icons-material/CookieOutlined'
import { api, API_BASE, getAccessToken } from '../api/client'
import { useI18n } from '../i18n'

import { CONSENT_KEY as LS_KEY, CONSENT_EVENT, getConsent } from '../consent'
export { getConsent }
const LS_VISITOR = 'crea3_visitor_id'

type Choice = { preferences: boolean; analytics: boolean; marketing: boolean }
const NONE: Choice = { preferences: false, analytics: false, marketing: false }
const ALL: Choice = { preferences: true, analytics: true, marketing: true }

/** Stable random visitor id so an anonymous visitor's consent is auditable
 *  without identifying them (no personal data in the id itself). */
function visitorId(): string {
  try {
    let v = localStorage.getItem(LS_VISITOR)
    if (!v) {
      v = (crypto?.randomUUID?.() || `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`)
      localStorage.setItem(LS_VISITOR, v)
    }
    return v
  } catch { return '' }
}

/** Open the preferences modal from anywhere (footer link fires this). */
export function openCookiePreferences() {
  window.dispatchEvent(new Event('crea3-open-cookie-consent'))
}

export default function CookieConsent() {
  const { t } = useI18n()
  const [banner, setBanner] = useState(false)   // first-visit bar
  const [open, setOpen] = useState(false)       // full preferences modal
  const [choice, setChoice] = useState<Choice>(NONE)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const existing = getConsent()
    if (existing) setChoice({ preferences: existing.preferences, analytics: existing.analytics, marketing: existing.marketing })
    else setBanner(true)   // no decision yet → ask (opt-in, nothing enabled meanwhile)
    const onOpen = () => { setChoice(getConsent() ?? NONE); setOpen(true) }
    window.addEventListener('crea3-open-cookie-consent', onOpen)
    return () => window.removeEventListener('crea3-open-cookie-consent', onOpen)
  }, [])

  async function persist(next: Choice, action: 'accept_all' | 'reject_all' | 'save') {
    setBusy(true)
    try { localStorage.setItem(LS_KEY, JSON.stringify({ ...next, at: Date.now() })) } catch { /* ignore */ }
    try {
      // Recorded server-side as an append-only proof of consent (GDPR Art. 7(1)).
      const token = getAccessToken()
      await fetch(`${API_BASE}/api/consent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ visitor_id: visitorId(), ...next, action }),
      })
    } catch { /* local choice still applies */ }
    setChoice(next); setBanner(false); setOpen(false); setBusy(false)
    // Let listeners (language persistence, analytics loaders…) react at once.
    try { window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: next })) } catch { /* ignore */ }
  }

  const Row = ({ k, required = false }: { k: 'necessary' | 'preferences' | 'analytics' | 'marketing'; required?: boolean }) => (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>{t(`cookieCat_${k}` as any)}</Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            {t(`cookieCat_${k}_desc` as any)}
          </Typography>
        </Box>
        <Switch
          checked={required ? true : (choice as any)[k]}
          disabled={required}
          onChange={(e) => setChoice((c) => ({ ...c, [k]: e.target.checked }))}
          inputProps={{ 'aria-label': t(`cookieCat_${k}` as any) }}
        />
      </Stack>
    </Paper>
  )

  return (
    <>
      {/* First-visit banner — nothing non-essential runs until a choice is made.
          A dimmed scrim (like the modal backdrop) puts it in the spotlight. */}
      {banner && !open ? (
        <Box
          aria-hidden
          sx={{
            position: 'fixed', inset: 0,
            bgcolor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: (th) => th.zIndex.modal + 49,
          }}
        />
      ) : null}
      {banner && !open ? (
        <Paper
          elevation={8}
          role="dialog"
          aria-label={t('cookieTitle')}
          sx={{
            position: 'fixed', zIndex: (th) => th.zIndex.modal + 50,
            left: { xs: 8, md: 16 }, right: { xs: 8, md: 16 }, bottom: { xs: 8, md: 16 },
            p: { xs: 2, md: 2.5 }, borderRadius: 3, maxWidth: 900, mx: 'auto',
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <CookieOutlinedIcon color="primary" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>{t('cookieTitle')}</Typography>
              <Typography variant="body2" color="text.secondary">{t('cookieBannerText')}</Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
              <Button variant="outlined" disabled={busy} onClick={() => persist(NONE, 'reject_all')}>{t('cookieRejectAll')}</Button>
              <Button variant="text" disabled={busy} onClick={() => { setChoice(getConsent() ?? NONE); setOpen(true) }}>{t('cookieCustomize')}</Button>
              <Button variant="contained" disabled={busy} onClick={() => persist(ALL, 'accept_all')}>{t('cookieAcceptAll')}</Button>
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {/* Full preferences modal */}
      <Dialog
        open={open}
        onClose={() => (!busy ? setOpen(false) : null)}
        fullWidth
        maxWidth="sm"
        sx={{ zIndex: (th) => th.zIndex.modal + 60, '& .MuiDialog-paper': { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: '100%' }, borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <CookieOutlinedIcon color="primary" fontSize="small" />
            <span>{t('cookieTitle')}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('cookieModalIntro')}</Typography>
          <Stack spacing={1.5}>
            <Row k="necessary" required />
            <Row k="preferences" />
            <Row k="analytics" />
            <Row k="marketing" />
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography variant="caption" color="text.secondary" component="div">
            {t('cookieLegalNote')}{' '}
            <MuiLink href="/help" underline="hover">{t('cookieMoreInfo')}</MuiLink>
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={() => persist(NONE, 'reject_all')} disabled={busy}>{t('cookieRejectAll')}</Button>
          <Button onClick={() => persist(choice, 'save')} disabled={busy} variant="outlined">{t('cookieSaveChoices')}</Button>
          <Button onClick={() => persist(ALL, 'accept_all')} disabled={busy} variant="contained">{t('cookieAcceptAll')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
