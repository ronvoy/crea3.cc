import React from 'react'
import {
  Paper,
  Box,
  Typography,
  Button as MuiButton,
  Chip,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material'
import { styled } from '@mui/material/styles'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'

// Shared UI primitives — reimplemented on Material UI so the whole app (28 files
// import from here) picks up the CREA3 theme, dark-mode support and polish while
// keeping the exact same API the pages already use.

type Classy = { className?: string }

export function Card({ children, className }: { children: React.ReactNode } & Classy) {
  return (
    <Paper variant="outlined" className={className} sx={{ borderRadius: 3, overflow: 'hidden' }}>
      {children}
    </Paper>
  )
}

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: { title: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode } & Classy) {
  return (
    <Box
      className={className}
      sx={{
        p: 2.5,
        borderBottom: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>{title}</Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>
        ) : null}
      </Box>
      {right}
    </Box>
  )
}

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'

const BTN_MAP: Record<ButtonVariant, { variant: 'contained' | 'text' | 'outlined'; color: 'primary' | 'inherit' | 'error' }> = {
  primary: { variant: 'contained', color: 'primary' },
  ghost: { variant: 'text', color: 'inherit' },
  outline: { variant: 'outlined', color: 'inherit' },
  danger: { variant: 'contained', color: 'error' },
}

export function Button({
  children,
  variant = 'primary',
  className,
  type,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant } & Classy) {
  const m = BTN_MAP[variant]
  return (
    <MuiButton className={className} variant={m.variant} color={m.color} type={type ?? 'button'} {...(props as any)}>
      {children}
    </MuiButton>
  )
}

// ── Theme-aware native form controls ──────────────────────────────────────────
// Kept native (via styled elements) so all input types, <option> children,
// file/checkbox inputs etc. behave exactly as before — just themed + polished.
const StyledInput = styled('input')(({ theme }) => ({
  width: '100%',
  minHeight: 44,
  borderRadius: 12,
  border: `1px solid ${theme.palette.divider}`,
  background: theme.palette.background.paper,
  color: theme.palette.text.primary,
  padding: '10px 12px',
  fontSize: 14.5,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  '&::placeholder': { color: theme.palette.text.secondary, opacity: 1 },
  '&:focus': {
    borderColor: theme.palette.primary.main,
    boxShadow: `0 0 0 3px ${theme.palette.primary.main}22`,
  },
}))
const StyledSelect = StyledInput.withComponent('select')
const StyledTextarea = StyledInput.withComponent('textarea')

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  // Checkbox / radio / file keep their native rendering.
  if (props.type === 'checkbox' || props.type === 'radio' || props.type === 'file') {
    return <input className={className} {...props} />
  }
  return <StyledInput className={className} {...props} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <StyledSelect {...props} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <StyledTextarea {...(props as any)} />
}

export function Pill({ children, className }: { children: React.ReactNode } & Classy) {
  return <Chip label={children} className={className} size="small" variant="outlined" />
}

export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null
  return <Alert severity="error" sx={{ borderRadius: 2 }}>{message}</Alert>
}

// A small "?" affordance revealing a short explanation on hover/focus.
export function HelpTip({ text, className = '' }: { text: string; className?: string }) {
  return (
    <Tooltip title={text} arrow>
      <IconButton size="small" aria-label={text} className={className} sx={{ p: 0.25 }}>
        <HelpOutlineIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  )
}
