import React, { useEffect, useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Box, Stack, Typography, Button, Paper } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import { Card } from './ui'
import { useI18n, type I18nKey } from '../i18n'
import { api } from '../api/client'
import DisputeStatusBadge from './dispute-status-badge'

type ActiveDispute = { id: number; title: string; status: string }

// The five workflow phases, labelled with the dispute tab keys (already translated).
const PHASES: I18nKey[] = ['tabAgents', 'tabGoods', 'tabPreferences', 'tabProposals', 'tabMediation']

export default function WorkflowInfo({
  icon,
  title,
  intro,
  points,
  activeStep = 0,
}: {
  icon: React.ReactNode
  title: string
  intro: string
  points: string[]
  activeStep?: number
}) {
  const { t } = useI18n()
  const nav = useNavigate()

  const [disputes, setDisputes] = useState<ActiveDispute[] | null>(null)
  useEffect(() => {
    let alive = true
    api('/api/disputes')
      .then((rows: ActiveDispute[]) => {
        if (!alive) return
        setDisputes((rows || []).filter((d) => d.status !== 'abandoned'))
      })
      .catch(() => {
        if (alive) setDisputes([])
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <Card>
      <Box sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <Box
            sx={{
              height: 48, width: 48, flexShrink: 0, display: 'grid', placeItems: 'center',
              borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText',
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>{title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{intro}</Typography>
          </Box>
        </Stack>

        {/* Phase stepper */}
        <Paper variant="outlined" sx={{ mt: 3, p: 2, borderRadius: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>{t('workflow')}</Typography>
          <Stack direction="row" flexWrap="wrap" alignItems="center" sx={{ mt: 1, rowGap: 1.5 }}>
            {PHASES.map((key, i) => {
              const active = i === activeStep
              const done = i < activeStep
              return (
                <Stack key={key} direction="row" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box
                      sx={{
                        height: 28, width: 28, flexShrink: 0, display: 'grid', placeItems: 'center',
                        borderRadius: '50%', fontSize: 12, fontWeight: 700,
                        ...(active
                          ? { bgcolor: 'primary.main', color: 'primary.contrastText' }
                          : done
                            ? { bgcolor: 'success.main', color: 'success.contrastText' }
                            : { bgcolor: 'action.hover', color: 'text.secondary', border: 1, borderColor: 'divider' }),
                      }}
                    >
                      {done ? <CheckIcon sx={{ fontSize: 16 }} /> : i + 1}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: active ? 600 : 400, color: active ? 'text.primary' : 'text.secondary' }}>
                      {t(key)}
                    </Typography>
                  </Stack>
                  {i < PHASES.length - 1 ? (
                    <Box sx={{ mx: 1, width: 24, height: '1px', bgcolor: 'divider', display: { xs: 'none', sm: 'block' } }} aria-hidden />
                  ) : null}
                </Stack>
              )
            })}
          </Stack>
        </Paper>

        {/* Points */}
        <Box sx={{ mt: 2, flex: 1, display: 'grid', gap: 2, gridTemplateColumns: { sm: 'repeat(3, 1fr)' } }}>
          {points.map((p, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ height: 32, width: 32, display: 'grid', placeItems: 'center', borderRadius: 1.5, bgcolor: 'success.main', color: 'success.contrastText' }}>
                <CheckIcon sx={{ fontSize: 18 }} />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{p}</Typography>
            </Paper>
          ))}
        </Box>

        {/* Active disputes */}
        <Paper variant="outlined" sx={{ mt: 3, p: 2, borderRadius: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>{t('wfActiveDisputes')}</Typography>
          {disputes === null ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>…</Typography>
          ) : disputes.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{t('wfNoActiveDisputes')}</Typography>
          ) : (
            <Stack spacing={1} sx={{ mt: 1.5 }}>
              {disputes.map((d) => (
                <Paper
                  key={d.id}
                  component={RouterLink}
                  to={`/app/disputes/${d.id}`}
                  variant="outlined"
                  sx={{
                    p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 2, textDecoration: 'none', color: 'inherit', '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 500 }} noWrap>{d.title}</Typography>
                    <Typography variant="caption" color="text.secondary">ID {d.id}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <DisputeStatusBadge status={d.status} />
                    <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>{t('wfOpenDispute')}</Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Paper>

        {/* Actions */}
        <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 2 }}>
          <Stack direction="row" flexWrap="wrap" alignItems="center" spacing={1.5}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{t('wfNeedDispute')}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button variant="outlined" color="inherit" onClick={() => nav('/app/mediators')}>{t('mediatorsTitle')}</Button>
              <Button variant="outlined" color="inherit" onClick={() => nav('/app/faq')}>{t('navFaqs')}</Button>
              <Button variant="contained" onClick={() => nav('/app')}>{t('wfGoToDisputes')}</Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    </Card>
  )
}
