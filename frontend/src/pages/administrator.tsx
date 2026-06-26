import React, { useCallback, useEffect, useState } from 'react'
import {
  Box, Paper, Stack, Typography, TextField, Button, Alert, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, AppBar, Toolbar, IconButton, Table, TableHead, TableBody, TableRow,
  TableCell, Select, MenuItem, Switch, Chip, CircularProgress, Dialog, DialogTitle, DialogContent,
  Tooltip, InputAdornment,
} from '@mui/material'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead'
import StorageIcon from '@mui/icons-material/Storage'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import LogoutIcon from '@mui/icons-material/Logout'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import { api, ApiOptions, API_BASE } from '../api/client'

const TOKEN_KEY = 'admin_panel_token'
const RAG_TOKEN_KEY = 'rag_admin_token' // shared so the embedded RAG manager is pre-authed
const DRAWER_W = 240

function adminApi<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) || ''
  return api<T>(path, { ...opts, auth: false, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } })
}

type Section = 'users' | 'outbox' | 'database' | 'rag'

// ── Login gate ───────────────────────────────────────────────────────────────────
function PanelLogin({ onAuthed }: { onAuthed: () => void }) {
  const [username, setUsername] = useState('ADMIN')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await api('/api/admin-panel/login', { method: 'POST', body: { username, password }, auth: false })
      localStorage.setItem(TOKEN_KEY, res.access_token)
      localStorage.setItem(RAG_TOKEN_KEY, res.access_token)
      onAuthed()
    } catch (err: any) {
      setError(err?.message ?? 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, width: 360, maxWidth: '100%' }}>
        <Stack spacing={2} component="form" onSubmit={submit}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AdminPanelSettingsIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Administrator</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">Sign in with the master admin credentials.</Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus fullWidth />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
          <Button type="submit" variant="contained" size="large" disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}

// ── Users (Keycloak replacement) ───────────────────────────────────────────────────
type PanelUser = { id: number; email: string; username: string; role: string; email_verified: boolean; has_password: boolean; created_at: string | null }

function UsersSection() {
  const [users, setUsers] = useState<PanelUser[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setUsers(await adminApi(`/api/admin-panel/users${q ? `?q=${encodeURIComponent(q)}` : ''}`)) }
    catch (e: any) { setError(e?.message ?? 'Failed to load users') }
    finally { setLoading(false) }
  }, [q])

  useEffect(() => { load() }, [load])

  async function patch(id: number, body: Partial<Pick<PanelUser, 'role' | 'email_verified'>>) {
    try {
      const updated = await adminApi(`/api/admin-panel/users/${id}`, { method: 'PATCH', body })
      setUsers((us) => us.map((u) => (u.id === id ? updated : u)))
    } catch (e: any) { setError(e?.message ?? 'Update failed') }
  }

  async function remove(id: number, email: string) {
    if (!window.confirm(`Delete ${email}? This removes their account and data.`)) return
    try {
      await adminApi(`/api/admin-panel/users/${id}`, { method: 'DELETE' })
      setUsers((us) => us.filter((u) => u.id !== id))
    } catch (e: any) { setError(e?.message ?? 'Delete failed') }
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>Users &amp; identities</Typography>
        <TextField size="small" placeholder="Search email/username" value={q}
          onChange={(e) => setQ(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Tooltip title="Refresh"><IconButton onClick={load}><RefreshIcon /></IconButton></Tooltip>
      </Stack>
      {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}
      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box> : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell><TableCell>Email</TableCell><TableCell>Username</TableCell>
                <TableCell>Role</TableCell><TableCell>Verified</TableCell><TableCell>Password</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.id}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>
                    <Select size="small" value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} sx={{ minWidth: 110 }}>
                      {['agent', 'mediator', 'admin', 'user'].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </Select>
                  </TableCell>
                  <TableCell><Switch checked={u.email_verified} onChange={(e) => patch(u.id, { email_verified: e.target.checked })} /></TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={u.has_password ? 'set' : 'none (OAuth)'} color={u.has_password ? 'success' : 'default'} /></TableCell>
                  <TableCell align="right"><Tooltip title="Delete"><IconButton color="error" size="small" onClick={() => remove(u.id, u.email)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip></TableCell>
                </TableRow>
              ))}
              {users.length === 0 ? <TableRow><TableCell colSpan={7} sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>No users.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Box>
  )
}

// ── Outbox (Mailpit replacement) ───────────────────────────────────────────────────
type EmailRow = { id: number; to_email: string; subject: string; body: string; kind: string; ok: boolean; error: string; created_at: string | null }

function OutboxSection() {
  const [rows, setRows] = useState<EmailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<EmailRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await adminApi('/api/admin-panel/emails?limit=200')) }
    catch (e: any) { setError(e?.message ?? 'Failed to load outbox') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>Mail outbox</Typography>
        <Tooltip title="Refresh"><IconButton onClick={load}><RefreshIcon /></IconButton></Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every email the app sends (verification + reset codes, invitations). Open one to read its contents — handy when there's no live inbox.
      </Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}
      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box> : (
          <Table size="small">
            <TableHead><TableRow><TableCell>When</TableCell><TableCell>Kind</TableCell><TableCell>To</TableCell><TableCell>Subject</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover sx={{ cursor: 'pointer' }} onClick={() => setOpen(r)}>
                  <TableCell>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</TableCell>
                  <TableCell><Chip size="small" label={r.kind} variant="outlined" /></TableCell>
                  <TableCell>{r.to_email}</TableCell>
                  <TableCell>{r.subject}</TableCell>
                  <TableCell><Chip size="small" label={r.ok ? 'sent' : 'failed'} color={r.ok ? 'success' : 'error'} variant="outlined" /></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>No emails sent yet.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        )}
      </Paper>
      <Dialog open={!!open} onClose={() => setOpen(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{open?.subject}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary">To: {open?.to_email} · {open?.kind} · {open?.ok ? 'sent' : `failed: ${open?.error}`}</Typography>
          <Box component="pre" sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14 }}>{open?.body}</Box>
        </DialogContent>
      </Dialog>
    </Box>
  )
}

function FrameSection({ src, title }: { src: string; title: string }) {
  return (
    <Box sx={{ position: 'absolute', inset: 0, top: 64, left: { xs: 0, md: DRAWER_W } }}>
      <iframe title={title} src={src} style={{ width: '100%', height: '100%', border: 0 }} />
    </Box>
  )
}

// ── Shell ───────────────────────────────────────────────────────────────────────
const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'users', label: 'Users (identity)', icon: <PeopleAltIcon /> },
  { id: 'outbox', label: 'Mail outbox', icon: <MarkEmailReadIcon /> },
  { id: 'database', label: 'Database (/dbms)', icon: <StorageIcon /> },
  { id: 'rag', label: 'Knowledge base (/rag)', icon: <MenuBookIcon /> },
]

export default function AdministratorPage() {
  const [authed, setAuthed] = useState(!!localStorage.getItem(TOKEN_KEY))
  const [section, setSection] = useState<Section>('users')

  if (!authed) return <PanelLogin onAuthed={() => setAuthed(true)} />

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setAuthed(false)
  }

  const isFrame = section === 'database' || section === 'rag'

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <AdminPanelSettingsIcon sx={{ mr: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>CREA3 Administrator</Typography>
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={logout}>Logout</Button>
        </Toolbar>
      </AppBar>

      <Drawer variant="permanent" sx={{ width: DRAWER_W, flexShrink: 0, display: { xs: 'none', md: 'block' }, [`& .MuiDrawer-paper`]: { width: DRAWER_W, boxSizing: 'border-box' } }}>
        <Toolbar />
        <List>
          {NAV.map((n) => (
            <ListItemButton key={n.id} selected={section === n.id} onClick={() => setSection(n.id)}>
              <ListItemIcon>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      {isFrame ? (
        <FrameSection
          src={section === 'database' ? `${API_BASE || ''}/dbms` : '/rag'}
          title={section === 'database' ? 'Database browser' : 'Knowledge base'}
        />
      ) : (
        <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
          {section === 'users' ? <UsersSection /> : null}
          {section === 'outbox' ? <OutboxSection /> : null}
        </Box>
      )}
    </Box>
  )
}
