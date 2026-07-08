import React from 'react'
import { Box, Paper, Typography, Chip, Stack, Container } from '@mui/material'
import SiteFooter from './site-footer'
import SkipLink from './skip-link'
import HelpWidget from './help-widget'

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 3, md: 5 } }}>
      <SkipLink />
      <Container maxWidth="lg">
        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 4 }}>
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
              Online dispute resolution platform
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
              CREA3
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', md: 'flex' } }} aria-hidden>
            <Chip label="Bids" size="small" variant="outlined" />
            <Chip label="Rates" size="small" variant="outlined" />
            <Chip label="Mediation" size="small" variant="outlined" />
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
                Secure access
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
                  <Typography sx={{ fontWeight: 600 }}>Accessibility</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Use the Settings bar on the right to switch light/dark mode, enable high-contrast,
                    adjust font size, and reduce motion.
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography sx={{ fontWeight: 600 }}>Email verification</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    New accounts receive a verification email. Open Mailpit locally to review messages
                    during development.
                  </Typography>
                </Paper>
              </Stack>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 4 }}>
              By continuing you agree to the platform terms &amp; privacy policy.
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
                Secure access
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
              Need help? Use the Help page or the dispute assistant once you enter a case.
            </Typography>
          </Paper>
        </Box>

        <SiteFooter compact />
      </Container>

      <HelpWidget />
    </Box>
  )
}
