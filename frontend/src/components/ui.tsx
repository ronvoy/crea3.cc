import React from 'react'
import { Paper, Button as MuiButton, Chip, Alert, Box, Typography } from '@mui/material'

type Classy = { className?: string }

function cx(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(' ')
}

// ── Card ──────────────────────────────────────────────────────────────────────
// Flat, outlined Material surface. Replaces the previous glassmorphism card.
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
      <Box>
        <Typography variant="h6" sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {right}
    </Box>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────
// Same custom API as before (variant: primary | ghost | outline | danger),
// now backed by MUI Button. className passthrough is preserved for layout
// utilities (e.g. w-full, justify-start) used across pages.
type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'

export function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant } & Classy) {
  const map: Record<
    ButtonVariant,
    { variant: 'contained' | 'outlined' | 'text'; color: 'primary' | 'error' | 'inherit' }
  > = {
    primary: { variant: 'contained', color: 'primary' },
    outline: { variant: 'outlined', color: 'primary' },
    ghost: { variant: 'text', color: 'inherit' },
    danger: { variant: 'contained', color: 'error' },
  }
  const m = map[variant]
  return (
    <MuiButton
      {...props}
      type={props.type ?? 'button'}
      variant={m.variant}
      color={m.color}
      className={className}
    >
      {children}
    </MuiButton>
  )
}

// ── Form controls ─────────────────────────────────────────────────────────────
// Kept as native elements (preserving value/onChange and <option> children used
// throughout the pages) but restyled to match the minimal Material surfaces.
const fieldBase =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 min-h-[44px] text-[14.5px] text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus:border-blue-400 transition'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldBase, props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldBase, props.className)} />
}

// ── Pill / Chip ───────────────────────────────────────────────────────────────
export function Pill({ children, className }: { children: React.ReactNode } & Classy) {
  return <Chip label={children} size="small" variant="outlined" className={className} />
}

// ── Error / Alert ─────────────────────────────────────────────────────────────
export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <Alert severity="error" sx={{ borderRadius: 2 }}>
      {message}
    </Alert>
  )
}
