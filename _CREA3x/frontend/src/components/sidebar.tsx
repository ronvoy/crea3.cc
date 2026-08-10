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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined'
import { useI18n } from '../i18n'
import { getRecentDisputes, removeRecentDispute, clearRecentDisputes } from '../utils/recent'
import DisputeStatusBadge from './dispute-status-badge'

export default function Sidebar({ onNavClick }: { onNavClick?: () => void }) {
  const { t } = useI18n()
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
          sx={{ mt: 1.5, mb: 2 }}
          onClick={() => go('/app/support')}
        >
          {t('sidebarContactSupport')}
        </Button>
      </Box>

      <Box sx={{ flexGrow: 1 }} />
    </Box>
  )
}
