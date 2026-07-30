import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import Landing from './pages/landing'
import Register from './pages/register'
import VerifyEmail from './pages/verify-email'
import Login from './pages/login'
import Dashboard from './pages/dashboard'
import Dispute from './pages/dispute'
import Account from './pages/account'
import Mediators from './pages/mediators'
import Settings from './pages/settings'
import FAQ from './pages/faq'
import Others from './pages/others'
import Support from './pages/support'
import Scope from './pages/scope'
import Partners from './pages/partners'
import Help from './pages/help'
import Workflow from './pages/workflow'
import ForgotPasswordPage from './pages/forgot-password'
import ResetPasswordPage from './pages/reset-password'
import NotificationsAll from './pages/notifications-all'
import ArchiveAll from './pages/archive-all'
import PublicShell from './components/public-shell'

// These pages are referenced by routes and the sidebar.
// A missing import here can result in a blank screen without compile-time errors
// (it becomes a runtime ReferenceError during render).
import Strategy from './pages/strategy'
import Ready from './pages/ready'
import Mediation from './pages/mediation'
import AdminLoginPage from './pages/admin-login'
import AdminDashboardPage from './pages/admin-dashboard'
import { AdminProtected } from './components/admin-protected'

import Shell from './components/shell'
import ProtectedRoute from './components/protected'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/register" element={<Register />} />

      {/* Admin area (mock credentials; see AdminLoginPage) */}
      <Route path="/admin" element={<AdminLoginPage />} />
      <Route
        path="/admin/dashboard"
        element={<AdminProtected><AdminDashboardPage /></AdminProtected>}
      />
      <Route
        path="/admin-dashboard"
        element={<AdminProtected><AdminDashboardPage /></AdminProtected>}
      />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Public informational pages */}
      <Route path="/scope" element={<PublicShell><Scope /></PublicShell>} />
      <Route path="/partners" element={<PublicShell><Partners /></PublicShell>} />
      <Route path="/help" element={<PublicShell><Help /></PublicShell>} />
      <Route path="/workflow" element={<PublicShell><Workflow /></PublicShell>} />

      {/* App (authenticated) */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Shell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="disputes/:id" element={<Dispute />} />
        <Route path="notifications" element={<NotificationsAll />} />
        <Route path="archive" element={<ArchiveAll />} />
        <Route path="dispute" element={<Navigate to="/app" replace />} />
        <Route path="mediators" element={<Mediators />} />
        <Route path="account" element={<Account />} />
        <Route path="settings" element={<Settings />} />
        <Route path="scope" element={<Scope />} />
        <Route path="partners" element={<Partners />} />
        <Route path="strategy" element={<Strategy />} />
        <Route path="ready" element={<Ready />} />
        <Route path="mediation" element={<Mediation />} />
        <Route path="faq" element={<FAQ />} />
        <Route path="others" element={<Others />} />
        <Route path="support" element={<Support />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}