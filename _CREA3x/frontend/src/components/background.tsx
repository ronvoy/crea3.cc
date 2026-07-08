import React from 'react'

// The animated particle/network background has been removed in favour of a
// minimal look: plain white in light mode and a subtle dark gradient in dark
// mode (applied globally via the MUI theme's CssBaseline, see theme.tsx).
// This component is kept as a no-op so existing imports keep working.
export default function NetworkBackground(_props: { fixed?: boolean }) {
  return null
}
