import React from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Box,
  AppBar,
  Toolbar,
  Container,
  Button,
  Stack,
  Typography,
  Link as MuiLink,
} from '@mui/material'
import SkipLink from './skip-link'
import SiteFooter from './site-footer'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  useLocation()
  const { t } = useI18n()

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'transparent' }}>
      <SkipLink />

      <AppBar
        position="sticky"
        sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Stack
            component={RouterLink}
            to="/"
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ textDecoration: 'none', color: 'text.primary' }}
          >
            <Box
              component="img"
              src="/crea3-logo.png"
              alt="CREA3"
              sx={{ height: 40, width: 40, borderRadius: 2, p: 0.5, bgcolor: 'action.hover' }}
            />
            <Box>
              <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{t('psPlatform')}</Typography>
              <Typography variant="caption" color="text.secondary">
                {t('psTagline')}
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={1} alignItems="center">
            <Box component="nav" aria-label={t('ariaPrimary')} sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
              {[
                { to: '/workflow', label: t('landingNavWorkflow') },
                { to: '/partners', label: t('landingNavPartners') },
                { to: '/scope', label: t('landingNavScope') },
                { to: '/help', label: t('landingNavHelp') },
              ].map((n) => (
                <RouterLink
                  key={n.to}
                  to={n.to}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  {n.label}
                </RouterLink>
              ))}
            </Box>
            {user ? (
              <Button component={RouterLink} to="/app" variant="contained">
                {t('psOpenApp')}
              </Button>
            ) : (
              <>
                <Button component={RouterLink} to="/login" variant="outlined">
                  {t('psSignIn')}
                </Button>
                <Button component={RouterLink} to="/register" variant="contained">
                  {t('psRegister')}
                </Button>
              </>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="lg" sx={{ flex: 1, py: 4 }}>
        {children}
      </Container>

      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <SiteFooter />
      </Container>
    </Box>
  )
}
