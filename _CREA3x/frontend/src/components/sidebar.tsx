import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Button,
  Chip,
  Divider,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined'
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined'
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import AddOutlinedIcon from '@mui/icons-material/AddOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { getRecentDisputes, removeRecentDispute, clearRecentDisputes } from '../utils/recent'
import DisputeStatusBadge from './dispute-status-badge'

function Logo() {
  const { t } = useI18n()
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box
        component="img"
        src="/crea3-logo.png"
        alt="CREA3"
        sx={{ height: 36, width: 36, borderRadius: 2, objectFit: 'contain', bgcolor: 'action.hover' }}
        onError={(e: any) => { e.currentTarget.style.display = 'none' }}
      />
      <Box>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>CREA3</Typography>
        <Typography variant="caption" color="text.secondary">{t('sbTagline')}</Typography>
      </Box>
    </Stack>
  )
}

export default function Sidebar({ onNavClick }: { onNavClick?: () => void }) {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()

  const [recents, setRecents] = React.useState(() => {
    try { return getRecentDisputes() } catch { return [] }
  })
  React.useEffect(() => {
    try { setRecents(getRecentDisputes()) } catch { setRecents([]) }
  }, [loc.pathname])
  const removeRecent = (id: number) => setRecents(removeRecentDispute(id))
  const clearRecents = () => { clearRecentDisputes(); setRecents([]) }
  const activeId = (() => {
    const m = loc.pathname.match(/\/app\/disputes\/(\d+)/)
    return m ? Number(m[1]) : null
  })()

  const go = (path: string) => { onNavClick?.(); nav(path) }

  const items: Array<{ to: string; label: string; icon: React.ReactNode; end?: boolean }> = [
    { to: '/app', label: t('navMyDisputes'), icon: <GavelOutlinedIcon fontSize="small" />, end: true },
    { to: '/app/mediators', label: t('navMediators'), icon: <PeopleOutlinedIcon fontSize="small" /> },
    { to: '/app/faq', label: t('navFaqs'), icon: <HelpOutlineOutlinedIcon fontSize="small" /> },
    { to: '/app/scope', label: t('navScope'), icon: <DescriptionOutlinedIcon fontSize="small" /> },
    { to: '/app/partners', label: t('navPartners'), icon: <HandshakeOutlinedIcon fontSize="small" /> },
    { to: '/app/account', label: t('navAccount'), icon: <PersonOutlineOutlinedIcon fontSize="small" /> },
    { to: '/app/others', label: t('navOtherResources'), icon: <FolderOutlinedIcon fontSize="small" /> },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Box sx={{ px: 1, py: 1 }}><Logo /></Box>

      <List sx={{ mt: 1 }}>
        {items.map((it) => (
          <ListItemButton
            key={it.to}
            component={NavLink}
            to={it.to}
            end={it.end as any}
            onClick={onNavClick}
            sx={{ mb: 0.25, '&.active': { bgcolor: 'action.selected', fontWeight: 600 } }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{it.icon}</ListItemIcon>
            <ListItemText primary={it.label} primaryTypographyProps={{ fontSize: '0.9rem' }} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ my: 1.5 }} />

      {/* Quick actions */}
      <Box sx={{ px: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('sbQuickActions')}</Typography>
          <Button size="small" startIcon={<SettingsOutlinedIcon />} onClick={() => window.dispatchEvent(new Event('crea3-open-settings'))}>
            {t('sbSettings')}
          </Button>
        </Stack>
        <Stack spacing={1}>
          <Button variant="outlined" color="inherit" size="small" startIcon={<AddOutlinedIcon />} sx={{ justifyContent: 'flex-start' }} onClick={() => go('/app')}>
            {t('sbCreateOpen')}
          </Button>
          <Button variant="outlined" color="inherit" size="small" startIcon={<HelpOutlineOutlinedIcon />} sx={{ justifyContent: 'flex-start' }} onClick={() => go('/app/faq')}>
            {t('sbHelp')}
          </Button>
        </Stack>
      </Box>

      {/* Recent disputes */}
      {recents.length > 0 && (
        <Box sx={{ px: 1, mt: 2 }}>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('recentDisputesTitle')}</Typography>
            <Button size="small" onClick={clearRecents} sx={{ minWidth: 0, fontSize: 11 }}>{t('recentClearAll')}</Button>
          </Stack>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {recents.slice(0, 4).map((d) => (
              <Stack
                key={d.id}
                direction="row"
                alignItems="center"
                sx={{
                  borderRadius: 2, border: 1,
                  borderColor: activeId === d.id ? 'primary.main' : 'transparent',
                  bgcolor: activeId === d.id ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ListItemButton
                  component={NavLink}
                  to={`/app/disputes/${d.id}`}
                  onClick={onNavClick}
                  sx={{ borderRadius: 2, py: 0.75 }}
                  title={d.title || `Dispute #${d.id}`}
                >
                  <ListItemText
                    primary={d.title || `Dispute #${d.id}`}
                    primaryTypographyProps={{ noWrap: true, fontSize: '0.85rem' }}
                    secondary={<DisputeStatusBadge status={d.status} />}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItemButton>
                <Tooltip title={t('recentRemove')}>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeRecent(d.id) }}
                    aria-label={t('recentRemove')}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {/* Support */}
      <Box sx={{ px: 1, mt: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('sidebarSupportTitle')}</Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>{t('sidebarSupportBody')}</Typography>
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          size="small"
          startIcon={<SupportAgentOutlinedIcon />}
          sx={{ mt: 1.5, justifyContent: 'flex-start' }}
          onClick={() => go('/app/support')}
        >
          {t('sidebarContactSupport')}
        </Button>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Chip label={t('navFaqs')} size="small" variant="outlined" onClick={() => go('/app/faq')} />
          <Chip label={t('navMediators')} size="small" variant="outlined" onClick={() => go('/app/mediators')} />
        </Stack>
      </Box>

      {/* Signed in / logout */}
      <Box sx={{ flexGrow: 1 }} />
      <Divider sx={{ my: 1.5 }} />
      <Box sx={{ px: 1 }}>
        <Typography variant="caption" color="text.secondary">{t('sbSignedInAs')}</Typography>
        <Typography sx={{ fontWeight: 600 }}>{user?.username}</Typography>
        <Typography variant="caption" color="text.secondary" component="div">{user?.email}</Typography>
        <Chip label={user?.role ?? 'user'} size="small" variant="outlined" sx={{ mt: 1 }} />
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          startIcon={<LogoutOutlinedIcon />}
          sx={{ mt: 2, justifyContent: 'flex-start' }}
          onClick={() => { logout(); nav('/') }}
        >
          {t('sbLogout')}
        </Button>
      </Box>
    </Box>
  )
}
