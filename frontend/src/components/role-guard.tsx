import React from 'react'

type Role = 'admin' | 'agent' | 'user' | 'mediator'

export function canAccessDisputeTab(role: Role | undefined, tab: string) {
  if (role === 'mediator') return tab === 'proposals'
  return true
}

export default function RoleGuard({
  role,
  allow,
  children,
  fallback = null,
}: {
  role: Role | undefined
  allow: (role: Role | undefined) => boolean
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  if (!allow(role)) return <>{fallback}</>
  return <>{children}</>
}
