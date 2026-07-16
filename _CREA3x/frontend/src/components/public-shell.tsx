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
  useI18n()

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
              <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>CREA3 Platform</Typography>
              <Typography variant="caption" color="text.secondary">
                Dispute resolution platform
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={1} alignItems="center">
            <MuiLink
              component={RouterLink}
              to="/scope"
              color="text.secondary"
              underline="hover"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              Scope
            </MuiLink>
            <MuiLink
              component={RouterLink}
              to="/partners"
              color="text.secondary"
              underline="hover"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              Partners
            </MuiLink>
            <MuiLink
              component={RouterLink}
              to="/help"
              color="text.secondary"
              underline="hover"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              Help
            </MuiLink>
            {user ? (
              <Button component={RouterLink} to="/app" variant="contained">
                Open app
              </Button>
            ) : (
              <>
                <Button component={RouterLink} to="/login" variant="outlined">
                  Sign in
                </Button>
                <Button component={RouterLink} to="/register" variant="contained">
                  Register
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
