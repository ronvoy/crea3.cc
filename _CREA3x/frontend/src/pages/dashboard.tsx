import React, { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box, Stack, Typography, Button, TextField, MenuItem, Paper, IconButton, Tooltip,
  Chip, Alert, InputAdornment,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AddIcon from '@mui/icons-material/Add'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import { useI18n } from '../i18n'
import { removeRecentDispute } from '../utils/recent'
import { Card, CardHeader, HelpTip } from '../components/ui'
import DisputeStatusBadge from '../components/dispute-status-badge'

type Dispute = { id: number; title: string; method: 'bids'|'rates'; status: string }

type Invitation = {
  agent_id: number
  dispute_id: number
  dispute_title: string
  invited_as: string
  invite_status: string
  entitlement_share: number
  invited_at: string
  invited_by_email?: string | null
  invited_by_username?: string | null
}

const STATUSES = ['draft', 'collecting', 'reconciling', 'proposed', 'accepted', 'mediation', 'finalized', 'abandoned']

export default function Dashboard() {
  const { t } = useI18n()
  const { user } = useAuth()

  const [items, setItems] = useState<Dispute[]>([])
  const [invites, setInvites] = useState<Invitation[]>([])
  const [inviteComments, setInviteComments] = useState<Record<number, string>>({})

  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [title, setTitle] = useState('')
  const method: 'rates' = 'rates' // single rating-based procedure
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(d => {
      if (statusFilter === 'all' && d.status === 'abandoned') return false
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (q && !(`${d.title} ${d.id}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [items, query, statusFilter])

  const nav = useNavigate()

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [d, i] = await Promise.all([
        api('/api/disputes'),
        api('/api/invitations').catch(() => [] as Invitation[]),
      ])
      setItems(d)
      setInvites(i)
    } catch (e: any) {
      setErr(e?.message ?? t('errorLoadDisputes'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function create() {
    setErr(null)
    try {
      const d = await api('/api/disputes', { method: 'POST', body: { title, method } })
      setTitle('')
      await load()
      nav(`/app/disputes/${d.id}`)
    } catch (e: any) {
      setErr(e?.message ?? t('errorCreateDispute'))
    }
  }

  async function respondInvite(disputeId: number, accept: boolean) {
    setErr(null)
    try {
      await api(`/api/invitations/${disputeId}/respond`, {
        method: 'POST',
        body: { accept, comment: inviteComments[disputeId] || null }
      })
      await load()
      if (accept) nav(`/app/disputes/${disputeId}`)
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to respond to invitation')
    }
  }

  const hasInvites = invites.length > 0

  async function deleteDispute(e: React.MouseEvent, disputeId: number) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(t('deleteDisputeConfirm'))) return
    setErr(null)
    try {
      await api(`/api/disputes/${disputeId}`, { method: 'DELETE' })
      removeRecentDispute(disputeId)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to delete dispute')
    }
  }

  async function archiveDispute(e: React.MouseEvent, disputeId: number) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(t('archiveDisputeConfirm'))) return
    setErr(null)
    try {
      await api(`/api/disputes/${disputeId}/archive`, { method: 'POST' })
      removeRecentDispute(disputeId)
      await load()
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to archive dispute')
    }
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardHeader
          title={t('dashboardTitle')}
          subtitle={t('dashboardSubtitle')}
          right={<Button variant="text" color="inherit" onClick={load} disabled={loading}>{loading ? t('refreshing') : t('refresh')}</Button>}
        />
        <Box sx={{ p: 2.5 }}>
          <Stack spacing={1.25} sx={{ width: '100%' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('dashboardCreateTitle')}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t('dashboardCreateHint')}
            </Typography>
            {err ? <Alert severity="error" sx={{ borderRadius: 2 }}>{err}</Alert> : null}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ xs: 'stretch', sm: 'center' }}
            >
              <TextField
                size="small"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('dashboardCreatePlaceholder')}
                fullWidth
                sx={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) { e.preventDefault(); create() } }}
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="contained" startIcon={<AddIcon />} onClick={create} disabled={!title.trim()}>
                  {t('dashboardCreateBtn')}
                </Button>
                <HelpTip text={t('helpCreateDispute')} />
              </Stack>
            </Stack>
          </Stack>
        </Box>
      </Card>

      {/* INVITES BANNER */}
      {hasInvites ? (
        <Card>
          <CardHeader
            title={t('dashInviteTitle')}
            subtitle={t('dashInviteSubtitle')}
          />
          <Stack spacing={1.5} sx={{ p: 2.5 }}>
            {invites.map(inv => (
              <Paper key={inv.dispute_id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} flexWrap="wrap">
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>{inv.dispute_title}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      Dispute #{inv.dispute_id} · ruolo: {inv.invited_as} · quota: {inv.entitlement_share}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                      Invitante: {inv.invited_by_username || '—'} {inv.invited_by_email ? `(${inv.invited_by_email})` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button variant="contained" onClick={() => respondInvite(inv.dispute_id, true)}>{t('dashInviteAccept')}</Button>
                    <Button variant="text" color="inherit" onClick={() => respondInvite(inv.dispute_id, false)}>{t('dashInviteDecline')}</Button>
                  </Stack>
                </Stack>
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                    {t('dashCommentLabel')}
                  </Typography>
                  <TextField
                    multiline
                    minRows={3}
                    fullWidth
                    size="small"
                    value={inviteComments[inv.dispute_id] || ''}
                    onChange={(e) => setInviteComments(prev => ({ ...prev, [inv.dispute_id]: e.target.value }))}
                    placeholder={t('dashCommentPlaceholder')}
                  />
                </Box>
              </Paper>
            ))}
          </Stack>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t('dashboardManageCardTitle')} subtitle={t('dashboardManageCardSubtitle')} />
        <Box sx={{ p: 2.5 }}>
          {items.length > 0 ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
              <TextField
                size="small"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchDisputesPlaceholder')}
                sx={{ flex: 1 }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              />
              <TextField
                size="small"
                select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="all">{t('filterAllStatuses')}</MenuItem>
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Stack>
          ) : null}

          {items.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('dashNoDisputes')}</Typography>
          ) : filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{t('noMatchingDisputes')}</Typography>
          ) : (
            <Stack spacing={1}>
              {filtered.map(d => (
                <Paper
                  key={d.id}
                  component={RouterLink}
                  to={`/app/disputes/${d.id}`}
                  variant="outlined"
                  sx={{
                    p: 1.75, borderRadius: 2, display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 2, textDecoration: 'none', color: 'inherit',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 500 }} noWrap>{d.title}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>ID {d.id}</Typography>
                      <DisputeStatusBadge status={d.status} showSteps />
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                    <Tooltip title={t('archiveDisputeTitle')}>
                      <IconButton size="small" onClick={(e) => archiveDispute(e, d.id)} aria-label={t('archiveDisputeTitle')}>
                        <Inventory2OutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <HelpTip text={t('helpArchiveAction')} />
                    <Tooltip title={t('deleteDisputeTitle')}>
                      <IconButton size="small" color="error" onClick={(e) => deleteDispute(e, d.id)} aria-label={t('deleteDisputeTitle')}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <HelpTip text={t('helpDeleteAction')} />
                    <ArrowForwardIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
      </Card>
    </Stack>
  )
}
