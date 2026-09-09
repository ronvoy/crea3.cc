import React from 'react'
import { Box, Paper, Typography, Link as MuiLink, Stack, Divider, Container, Button } from '@mui/material'
import { useI18n } from '../i18n'
import { openCookiePreferences } from './cookie-consent'

const website = import.meta.env.VITE_PROJECT_WEBSITE || ''

// Project coordinator email (overridable via .env). The display name is localized
// via i18n (footerContactName); an env override still wins when set.
const contactEmail = import.meta.env.VITE_PROJECT_CONTACT1_EMAIL || 'support@crea3.cc'
const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@crea3.cc'

// Render a name that may contain literal <br> tags as real line breaks.
function renderWithBreaks(text: string) {
  return text.split(/<br\s*\/?>/i).map((part, i, arr) => (
    <React.Fragment key={i}>
      {part.trim()}
      {i < arr.length - 1 ? <br /> : null}
    </React.Fragment>
  ))
}

function Contact({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <Box sx={{ mt: 1.5, '&:first-of-type': { mt: 0 } }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.06em' }}>
        {role}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{renderWithBreaks(name)}</Typography>
      <MuiLink href={`mailto:${email}`} underline="hover" variant="body2">
        {email}
      </MuiLink>
    </Box>
  )
}

export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  return (
    <Box component="footer" sx={{ mt: compact ? 3 : 5 }}>
      <Container maxWidth="xl" disableGutters>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { md: '1fr 1fr' }, alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('footerProjectContact')}</Typography>
              <Contact name={import.meta.env.VITE_PROJECT_CONTACT1_NAME || t('footerContactName')} email={contactEmail} role={t('footerCoordinatorRole')} />
              {website ? (
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  <MuiLink href={website} target="_blank" rel="noreferrer" underline="hover" color="text.secondary">
                    {website}
                  </MuiLink>
                </Typography>
              ) : null}

              {/* Help & support — sits under the project contacts so it is
                  reachable from every page, not only inside a dispute. */}
              <Paper variant="outlined" sx={{ mt: 2.5, p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('helpSupportTitle')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t('helpSupportSubtitle')}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <b>{t('helpSupportEmailLabel')}:</b>{' '}
                  <MuiLink href={`mailto:${supportEmail}`} underline="hover">{supportEmail}</MuiLink>
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>{t('helpSupportFaqHint')}</Typography>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                  {t('helpSupportKeyboardHint')}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
                  <Button size="small" variant="outlined" color="inherit"
                    onClick={() => window.dispatchEvent(new Event('crea3-open-settings'))}>
                    {t('openAccessibilitySettings')}
                  </Button>
                  <Button size="small" variant="outlined" color="inherit"
                    onClick={() => window.dispatchEvent(new Event('crea3-open-assistant'))}>
                    {t('launchLegalAssistant')}
                  </Button>
                </Stack>
              </Paper>
            </Box>

            <Box>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('footerPartners')}</Typography>
                <Typography variant="caption" color="text.secondary">{t('footerPartnersNote')}</Typography>
              </Stack>
              <Paper variant="outlined" sx={{ mt: 1.5, p: 2, borderRadius: 2 }}>
                <Box
                  component="img"
                  src="/partners.png"
                  alt="Partner institutions: Federico II, VUB, University of Zagreb, Vilnius University, Suor Orsola Benincasa, TalTech, Adiconsum, FBE, University of Ljubljana"
                  loading="lazy"
                  sx={{ mx: 'auto', width: '100%', maxWidth: 560, height: 'auto', objectFit: 'contain', display: 'block' }}
                />
              </Paper>
            </Box>
          </Box>

          <Divider sx={{ my: 2.5 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 2 }} alignItems={{ sm: 'center' }} justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              © {new Date().getFullYear()} {t('footerRights')}
            </Typography>
            <MuiLink
              component="button"
              type="button"
              onClick={openCookiePreferences}
              underline="hover"
              variant="caption"
              color="text.secondary"
              sx={{ textAlign: { xs: 'left', sm: 'right' } }}
            >
              🍪 {t('cookieSettingsLink')}
            </MuiLink>
          </Stack>
        </Paper>
      </Container>
    </Box>
  )
}
