import React, { useMemo, useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate, Link as RouterLink } from 'react-router-dom'
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
  Divider,
  Menu,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import RefreshIcon from '@mui/icons-material/Refresh'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
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
  const nav = useNavigate()
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const isPhone = useMediaQuery('(max-width:949.95px)') // < 950px
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userAnchor, setUserAnchor] = useState<null | HTMLElement>(null)

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
        <Toolbar disableGutters sx={{ pr: { xs: 1, sm: 2 } }}>
          {!isDesktop && (
            <IconButton
              edge="start"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileOpen}
              sx={{ ml: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* Brand — on desktop it spans exactly the sidebar width so the divider
              lines up with the sidebar's right border into one seamless line. */}
          <Stack
            component={RouterLink}
            to="/"
            aria-label={t('ariaHome')}
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              textDecoration: 'none', color: 'inherit', flexShrink: 0,
              width: { md: DRAWER_WIDTH - 1 }, pl: { xs: 1.5, md: 3 }, pr: 1.5,
              '&:hover': { opacity: 0.85 },
            }}
          >
            <Box
              component="img"
              src="/crea3-logo.png"
              alt="CREA3"
              sx={{ height: 36, width: 36, borderRadius: 1.5, objectFit: 'contain', bgcolor: 'action.hover', flexShrink: 0 }}
              onError={(e: any) => { e.currentTarget.style.display = 'none' }}
            />
            <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 700, lineHeight: 1.1, color: 'text.primary' }}>CREA3</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{t('sbTagline')}</Typography>
            </Box>
          </Stack>

          <Divider orientation="vertical" flexItem sx={{ my: 0, borderColor: 'divider' }} />

          <Box sx={{ flex: 1, minWidth: 0, pl: { xs: 1.5, md: 2 } }}>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {t('appSubtitle')}
            </Typography>
            <Typography variant="h6" noWrap sx={{ fontWeight: 600, lineHeight: 1.1 }}>
              {title}
            </Typography>
          </Box>

          {/* Actions stay inline in the navbar (their dropdowns anchor here, so
              they never clip). Under 600px, Refresh/Logout collapse to icon-only. */}
          <Stack direction="row" spacing={{ xs: 0.5, sm: 1.5 }} alignItems="center">
            {user ? (
              <>
                {/* ≥950px: "username (email)" + role chip */}
                {!isPhone ? (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                      {user.username} ({user.email})
                    </Typography>
                    <Chip label={user.role ?? 'user'} size="small" variant="outlined" />
                  </Stack>
                ) : null}
                {/* <950px: user icon → details dropdown */}
                {isPhone ? (
                  <>
                    <IconButton color="inherit" onClick={(e) => setUserAnchor(e.currentTarget)} aria-label={user.username}>
                      <PersonOutlineIcon />
                    </IconButton>
                    <Menu anchorEl={userAnchor} open={!!userAnchor} onClose={() => setUserAnchor(null)}>
                      <Box sx={{ px: 2, py: 1, minWidth: 200, maxWidth: 280 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>{user.username}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{user.email}</Typography>
                        <Chip label={user.role ?? 'user'} size="small" variant="outlined" sx={{ mt: 1 }} />
                      </Box>
                    </Menu>
                  </>
                ) : null}
              </>
            ) : null}
            {user ? <NotificationsBell /> : null}
            {user ? <ArchiveButton /> : null}
            {isPhone ? (
              <IconButton color="inherit" onClick={() => window.location.reload()} aria-label={t('refresh')}>
                <RefreshIcon />
              </IconButton>
            ) : (
              <Button
                variant="outlined" color="inherit" size="small" startIcon={<RefreshIcon />}
                onClick={() => window.location.reload()} aria-label={t('refresh')}
              >
                {t('refresh')}
              </Button>
            )}
            {user ? (
              isPhone ? (
                <IconButton color="inherit" onClick={() => { logout(); nav('/') }} aria-label={t('sbLogout')}>
                  <LogoutOutlinedIcon />
                </IconButton>
              ) : (
                <Button
                  variant="outlined" color="inherit" size="small" startIcon={<LogoutOutlinedIcon />}
                  onClick={() => { logout(); nav('/') }} aria-label={t('sbLogout')}
                >
                  {t('sbLogout')}
                </Button>
              )
            ) : null}
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
