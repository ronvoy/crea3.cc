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
  Link as MuiLink,
  Stack,
} from '@mui/material'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined'
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined'
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import AddOutlinedIcon from '@mui/icons-material/AddOutlined'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { getRecentDisputes } from '../utils/recent'

function Logo() {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Box
        component="img"
        src="/crea3-logo.png"
        alt="CREA3"
        sx={{ height: 36, width: 36, borderRadius: 2, objectFit: 'contain', bgcolor: 'action.hover' }}
        onError={(e: any) => {
          e.currentTarget.style.display = 'none'
        }}
      />
      <Box>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>CREA3</Typography>
        <Typography variant="caption" color="text.secondary">
          Dispute resolution platform
        </Typography>
      </Box>
    </Stack>
  )
}

// ── Sidebar nav content ───────────────────────────────────────────────────────
// Rendered inside the MUI Drawer hosted by <Shell>. No fixed positioning here;
// the Drawer handles responsiveness.
export default function Sidebar({ onNavClick }: { onNavClick?: () => void }) {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()

  const recents = React.useMemo(() => {
    try {
      return getRecentDisputes()
    } catch {
      return []
    }
  }, [loc.pathname])

  const go = (path: string) => {
    onNavClick?.()
    nav(path)
  }

  const items: Array<{ to: string; label: string; icon: React.ReactNode; end?: boolean }> = [
    { to: '/app', label: t('navMyDisputes'), icon: <GavelOutlinedIcon fontSize="small" />, end: true },
    { to: '/app/mediators', label: t('navMediators'), icon: <PeopleOutlinedIcon fontSize="small" /> },
    { to: '/app/rag', label: 'Legal knowledge base', icon: <MenuBookOutlinedIcon fontSize="small" /> },
    { to: '/app/faq', label: t('navFaqs'), icon: <HelpOutlineOutlinedIcon fontSize="small" /> },
    { to: '/app/scope', label: t('navScope'), icon: <DescriptionOutlinedIcon fontSize="small" /> },
    { to: '/app/partners', label: t('navPartners'), icon: <HandshakeOutlinedIcon fontSize="small" /> },
    { to: '/app/account', label: t('navAccount'), icon: <PersonOutlineOutlinedIcon fontSize="small" /> },
    { to: '/app/others', label: t('navOtherResources'), icon: <FolderOutlinedIcon fontSize="small" /> },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2 }}>
      <Box sx={{ px: 1, py: 1 }}>
        <Logo />
      </Box>

      <List sx={{ mt: 1 }}>
        {items.map((it) => (
          <ListItemButton
            key={it.to}
            component={NavLink}
            to={it.to}
            end={it.end as any}
            onClick={onNavClick}
            sx={{
              mb: 0.25,
              '&.active': { bgcolor: 'action.selected', fontWeight: 600 },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{it.icon}</ListItemIcon>
            <ListItemText primary={it.label} primaryTypographyProps={{ fontSize: '0.9rem' }} />
          </ListItemButton>
        ))}
      </List>

      <Divider sx={{ my: 1.5 }} />

      {/* Quick actions */}
      <Box sx={{ px: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Quick actions
        </Typography>
        <Stack spacing={1}>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            startIcon={<AddOutlinedIcon />}
            sx={{ justifyContent: 'flex-start' }}
            onClick={() => go('/app')}
          >
            Create / open a dispute
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            startIcon={<HelpOutlineOutlinedIcon />}
            sx={{ justifyContent: 'flex-start' }}
            onClick={() => go('/app/faq')}
          >
            Help &amp; procedural guidance
          </Button>
        </Stack>
      </Box>

      {/* Recent disputes */}
      {recents.length > 0 && (
        <Box sx={{ px: 1, mt: 2 }}>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between">
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Recent disputes
            </Typography>
            <Typography variant="caption" color="text.secondary">
              last opened
            </Typography>
          </Stack>
          <List dense>
            {recents.slice(0, 4).map((d) => (
              <ListItemButton
                key={d.id}
                component={NavLink}
                to={`/app/disputes/${d.id}`}
                onClick={onNavClick}
                title={d.title}
              >
                <ListItemText
                  primary={d.title || `Dispute #${d.id}`}
                  secondary={`ID ${d.id}`}
                  primaryTypographyProps={{ noWrap: true, fontSize: '0.85rem' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      )}

      {/* Support */}
      <Box sx={{ px: 1, mt: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Support
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          For assistance, contact
        </Typography>
        <MuiLink href="mailto:albertomoccardi@gmail.com" variant="caption" underline="hover">
          albertomoccardi@gmail.com
        </MuiLink>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Chip label="WCAG AA" size="small" variant="outlined" />
          <Chip label="Keyboard" size="small" variant="outlined" />
          <Chip label="Screen reader" size="small" variant="outlined" />
        </Stack>
      </Box>

      {/* Partners */}
      <Box sx={{ px: 1, mt: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          {t('navPartners')}
        </Typography>
        <Box
          component="img"
          src="/partners.png"
          alt="Project partners"
          loading="lazy"
          sx={{ width: '100%', height: 'auto', borderRadius: 2, opacity: 0.95 }}
          onError={(e: any) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      </Box>

      {/* Signed in / logout */}
      <Box sx={{ flexGrow: 1 }} />
      <Divider sx={{ my: 1.5 }} />
      <Box sx={{ px: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Signed in as
        </Typography>
        <Typography sx={{ fontWeight: 600 }}>{user?.username}</Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {user?.email}
        </Typography>
        <Chip label={user?.role ?? 'user'} size="small" variant="outlined" sx={{ mt: 1 }} />
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          startIcon={<LogoutOutlinedIcon />}
          sx={{ mt: 2, justifyContent: 'flex-start' }}
          onClick={() => {
            logout()
            nav('/')
          }}
        >
          Logout
        </Button>
      </Box>
    </Box>
  )
}
