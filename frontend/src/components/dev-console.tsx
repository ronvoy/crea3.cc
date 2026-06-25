import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Paper,
  Stack,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  Tooltip,
} from '@mui/material'
import TerminalIcon from '@mui/icons-material/Terminal'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import { useAppConfig } from '../app-config'
import { useAuth } from '../store/auth'
import { getEntries, clearEntries, subscribe, NetEntry } from '../dev/net-log'

// Dev-only bottom console: realtime network requests, storage details, and app
// state (route, user, memory). Hidden entirely in production.
export default function DevConsole() {
  const { isDev, deploymentEnvironment, fontType, themeType } = useAppConfig()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(0)
  const [, force] = useState(0)

  useEffect(() => subscribe(() => force((n) => n + 1)), [])

  if (!isDev) return null

  const net: NetEntry[] = getEntries()

  if (!open) {
    return (
      <Tooltip title="Dev console" placement="top">
        <IconButton
          onClick={() => setOpen(true)}
          sx={{ position: 'fixed', bottom: 12, left: 12, zIndex: (t) => t.zIndex.drawer + 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
          aria-label="Open dev console"
        >
          <TerminalIcon />
        </IconButton>
      </Tooltip>
    )
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (t) => t.zIndex.drawer + 3,
        height: 260,
        display: 'flex',
        flexDirection: 'column',
        borderTop: 2,
        borderColor: 'divider',
        borderRadius: 0,
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <TerminalIcon fontSize="small" sx={{ mr: 1 }} />
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ minHeight: 40, flexGrow: 1 }}>
          <Tab label={`Network (${net.length})`} sx={{ minHeight: 40 }} />
          <Tab label="Storage" sx={{ minHeight: 40 }} />
          <Tab label="App state" sx={{ minHeight: 40 }} />
        </Tabs>
        {tab === 0 ? (
          <Button size="small" startIcon={<DeleteSweepIcon />} onClick={() => clearEntries()}>Clear</Button>
        ) : null}
        <IconButton size="small" onClick={() => setOpen(false)} aria-label="Collapse console"><ExpandMoreIcon /></IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {tab === 0 ? <NetworkTab entries={net} /> : null}
        {tab === 1 ? <StorageTab /> : null}
        {tab === 2 ? <AppStateTab env={deploymentEnvironment} fontType={fontType} themeType={themeType} user={user} /> : null}
      </Box>
    </Paper>
  )
}

function NetworkTab({ entries }: { entries: NetEntry[] }) {
  if (entries.length === 0) return <Empty>No requests captured yet.</Empty>
  return (
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          <TableCell>Status</TableCell><TableCell>Method</TableCell><TableCell>URL</TableCell><TableCell align="right">ms</TableCell><TableCell>Time</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.id} hover>
            <TableCell>
              <Chip size="small" label={e.error ? 'ERR' : e.status} color={e.ok ? 'success' : 'error'} variant="outlined" />
            </TableCell>
            <TableCell><code>{e.method}</code></TableCell>
            <TableCell sx={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <code>{e.url}</code>{e.error ? <Typography variant="caption" color="error"> — {e.error}</Typography> : null}
            </TableCell>
            <TableCell align="right">{e.ms}</TableCell>
            <TableCell>{new Date(e.ts).toLocaleTimeString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function StorageTab() {
  const rows = useMemo(() => {
    const out: { key: string; size: number; preview: string }[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!
        const v = localStorage.getItem(k) ?? ''
        out.push({ key: k, size: v.length, preview: v.length > 80 ? v.slice(0, 80) + '…' : v })
      }
    } catch { /* ignore */ }
    return out.sort((a, b) => b.size - a.size)
  }, [])
  const total = rows.reduce((s, r) => s + r.size, 0)
  if (rows.length === 0) return <Empty>localStorage is empty.</Empty>
  return (
    <>
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="caption" color="text.secondary">{rows.length} keys · ~{(total / 1024).toFixed(1)} KB total</Typography>
      </Box>
      <Table size="small" stickyHeader>
        <TableHead><TableRow><TableCell>Key</TableCell><TableCell align="right">Bytes</TableCell><TableCell>Value</TableCell></TableRow></TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key} hover>
              <TableCell><code>{r.key}</code></TableCell>
              <TableCell align="right">{r.size}</TableCell>
              <TableCell sx={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><code>{r.preview}</code></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}

function AppStateTab({ env, fontType, themeType, user }: { env: string; fontType: string; themeType: string; user: any }) {
  const mem = (performance as any)?.memory
  const rows: [string, string][] = [
    ['Deployment env', env || '(unknown)'],
    ['Route', window.location.pathname],
    ['Font', fontType],
    ['Theme', themeType],
    ['User', user ? `${user.username} (${user.role})` : '(anonymous)'],
    ['User email', user?.email ?? '—'],
    ['Viewport', `${window.innerWidth}×${window.innerHeight}`],
    ['Device pixel ratio', String(window.devicePixelRatio || 1)],
    ['JS heap (used/limit)', mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)} / ${(mem.jsHeapSizeLimit / 1048576).toFixed(0)} MB` : 'n/a'],
    ['User agent', navigator.userAgent],
  ]
  return (
    <Table size="small">
      <TableBody>
        {rows.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell sx={{ fontWeight: 600, width: 200 }}>{k}</TableCell>
            <TableCell sx={{ wordBreak: 'break-word' }}><code>{v}</code></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Box sx={{ p: 3, color: 'text.secondary' }}><Typography variant="body2">{children}</Typography></Box>
}
