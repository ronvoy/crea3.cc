import React from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Paper, Typography, Chip, Stack, Container } from '@mui/material'
import SiteFooter from './site-footer'
import SkipLink from './skip-link'
import HelpWidget from './help-widget'
import { useI18n } from '../i18n'

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', py: { xs: 3, md: 5 } }}>
      <SkipLink />
      <Container maxWidth="lg">
        {/* Header — logo + title link back to the landing page */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
          <Stack
            component={RouterLink}
            to="/"
            aria-label={t('ariaHome')}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ textDecoration: 'none', color: 'inherit', borderRadius: 2, '&:hover': { opacity: 0.85 } }}
          >
            <Box
              component="img"
              src="/crea3.logo.png"
              alt="CREA3 logo"
              loading="lazy"
              sx={{ height: 48, width: 48, borderRadius: 2, objectFit: 'contain', bgcolor: 'action.hover' }}
              onError={(e: any) => {
                e.currentTarget.src = '/crea3-logo.png'
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                {t('authTagline')}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
                CREA3
              </Typography>
            </Box>
          </Stack>
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' } }} aria-hidden>
            <Chip label={t('authBids')} size="small" variant="outlined" />
            <Chip label={t('authRates')} size="small" variant="outlined" />
            <Chip label={t('authMediation')} size="small" variant="outlined" />
          </Stack>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: { lg: '1fr 1fr' },
            alignItems: 'stretch',
          }}
        >
          {/* Guidance panel */}
          <Paper
            variant="outlined"
            sx={{
              p: 4,
              borderRadius: 3,
              display: { xs: 'none', lg: 'flex' },
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ fontWeight: 700, letterSpacing: '0.08em' }}
              >
                {t('authSecureAccess')}
              </Typography>
              <Typography variant="h5" sx={{ mt: 1, fontWeight: 600 }}>
                {title}
              </Typography>
              {subtitle ? (
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {subtitle}
                </Typography>
              ) : null}

              <Stack spacing={2} sx={{ mt: 4 }}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography sx={{ fontWeight: 600 }}>{t('authA11y')}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {t('authA11yBody')}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography sx={{ fontWeight: 600 }}>{t('authEmailVerif')}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {t('authMailpitNote')}
                  </Typography>
                </Paper>
              </Stack>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 4 }}>
              {t('authTerms')}
            </Typography>
          </Paper>

          {/* Form panel */}
          <Paper
            component="main"
            id="main-content"
            tabIndex={-1}
            variant="outlined"
            sx={{ p: 4, borderRadius: 3 }}
          >
            <Box sx={{ display: { lg: 'none' }, mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {t('authSecureAccess')}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {title}
              </Typography>
              {subtitle ? (
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {subtitle}
                </Typography>
              ) : null}
            </Box>

            <Box sx={{ mt: 2 }}>{children}</Box>

            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 4 }}>
              {t('authNeedHelp')}
            </Typography>
          </Paper>
        </Box>

        <SiteFooter compact />
      </Container>

      <HelpWidget />
    </Box>
  )
}
