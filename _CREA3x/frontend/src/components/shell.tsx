import React, { useMemo, useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Drawer,
  Chip,
  Button,
  Stack,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import RefreshIcon from '@mui/icons-material/Refresh'
import Sidebar from './sidebar'
import SkipLink from './skip-link'
import SiteFooter from './site-footer'
import NotificationsBell from './notifications'
import ArchiveButton from './archive'
import { CountryOnboarding } from './country'
import AssistantWidget from './assistant-widget'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'

const DRAWER_WIDTH = 300

function titleFromPath(pathname: string, t: (k: any) => string) {
  if (pathname === '/app') return t('navMyDisputes')
  if (pathname.startsWith('/app/disputes/')) return t('dispute')
  const map: Record<string, string> = {
    '/app/mediators': t('navMediators'),
    '/app/account': t('navAccount'),
    '/app/faq': t('navFaqs'),
    '/app/scope': t('navScope'),
    '/app/partners': t('navPartners'),
    '/app/others': t('navOtherResources'),
  }
  return map[pathname] || t('dispute')
}

export default function Shell() {
  const loc = useLocation()
  const { user } = useAuth()
  const { t } = useI18n()
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [loc.pathname])

  const title = useMemo(() => titleFromPath(loc.pathname, t), [loc.pathname, t])

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'transparent' }}>
      <CountryOnboarding />
      <SkipLink />

      {/* ── Top app bar ─────────────────────────────────────────────────────── */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (th) => th.zIndex.drawer + 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          {!isDesktop && (
            <IconButton
              edge="start"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileOpen}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {t('appSubtitle')}
            </Typography>
            <Typography variant="h6" noWrap sx={{ fontWeight: 600, lineHeight: 1.1 }}>
              {title}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center">
            {user ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: 'none', sm: 'flex' } }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {user.username}
                </Typography>
                <Chip label={user.role ?? 'user'} size="small" variant="outlined" />
              </Stack>
            ) : null}
            {user ? <NotificationsBell /> : null}
            {user ? <ArchiveButton /> : null}
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => window.location.reload()}
              aria-label={t('refresh')}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {t('refresh')}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* ── Navigation drawer (permanent on desktop, temporary on mobile) ────── */}
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }} aria-label={t('ariaNav')}>
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop ? true : mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              borderRight: 1,
              borderColor: 'divider',
            },
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: 'auto', height: '100%' }}>
            <Sidebar onNavClick={() => setMobileOpen(false)} />
          </Box>
        </Drawer>
      </Box>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Toolbar />
        <Box component="main" id="main-content" tabIndex={-1} sx={{ flex: 1, p: { xs: 2, md: 4 } }}>
          <Outlet />
        </Box>
        <Box sx={{ px: { xs: 2, md: 4 }, pb: 3 }}>
          <SiteFooter />
        </Box>
      </Box>

      {/* Floating AI assistant (Workflow + Legal AI), whole logged-in app */}
      <AssistantWidget />
    </Box>
  )
}
