import React from 'react'
import { Box, Paper, Typography, Link as MuiLink, Chip, Stack, Divider } from '@mui/material'

const contactName = import.meta.env.VITE_PROJECT_CONTACT_NAME || 'Project contact'
const contactEmail = import.meta.env.VITE_PROJECT_CONTACT_EMAIL || ''
const contactOrg = import.meta.env.VITE_PROJECT_CONTACT_ORG || ''
const website = import.meta.env.VITE_PROJECT_WEBSITE || ''

// Optional override: comma-separated partner names in .env (VITE_PROJECT_PARTNERS="A,B,C")
const partnersFromEnv = (import.meta.env.VITE_PROJECT_PARTNERS || '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

const defaultPartners = [
  'Università degli Studi di Napoli Federico II',
  'Vrije Universiteit Brussel (VUB)',
  'University of Zagreb – Faculty of Law',
  'Vilnius University',
  'Università degli Studi Suor Orsola Benincasa',
  'TalTech – Tallinn University of Technology',
  'Adiconsum – Associazione Difesa Consumatori e Ambiente',
  "FBE – Federation des Barreaux d'Europe",
  'University of Ljubljana',
]

const partnerNames = partnersFromEnv.length ? partnersFromEnv : defaultPartners

export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <Paper
      component="footer"
      variant="outlined"
      sx={{ mt: compact ? 3 : 5, p: 3, borderRadius: 3 }}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { md: '1fr 1fr' },
          alignItems: 'flex-start',
        }}
      >
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Project contact
          </Typography>
          <Box sx={{ mt: 1 }}>
            {contactOrg ? (
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {contactOrg}
              </Typography>
            ) : null}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {contactEmail ? (
                <MuiLink href={`mailto:${contactEmail}`} underline="hover">
                  {contactName}
                  {contactName && contactEmail ? ' — ' : ''}
                  {contactEmail}
                </MuiLink>
              ) : (
                <span>{contactName}</span>
              )}
            </Typography>
            {website ? (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <MuiLink href={website} target="_blank" rel="noreferrer" underline="hover">
                  {website}
                </MuiLink>
              </Typography>
            ) : null}
          </Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
            Secure access via enterprise identity. Email verification required.
          </Typography>
        </Box>

        <Box>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Partners
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Recognized institutions
            </Typography>
          </Stack>

          <Paper variant="outlined" sx={{ mt: 1, p: 1.5, borderRadius: 2 }}>
            <Box
              component="img"
              src="/partners.png"
              alt="Project partners"
              loading="lazy"
              sx={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
            />
          </Paper>

          <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
            {partnerNames.map((name: string) => (
              <Chip key={name} label={name} size="small" variant="outlined" title={name} />
            ))}
          </Stack>
        </Box>
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ md: 'center' }}
        justifyContent="space-between"
        spacing={1}
      >
        <Typography variant="caption" color="text.secondary">
          © {new Date().getFullYear()} CREA3 Dispute Resolution Platform
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
          <Typography variant="caption" color="text.secondary">
            Mailpit local email enabled
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  )
}
