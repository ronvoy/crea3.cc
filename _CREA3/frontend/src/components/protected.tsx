import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../store/auth'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const hasToken = Boolean(localStorage.getItem('access_token'))
  if (!user && !hasToken) return <Navigate to="/login" replace />
  return <>{children}</>
}
