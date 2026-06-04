import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/auth-layout'
import { Button } from '../components/ui'
import { keycloak } from '../keycloak'

export default function LoginPage() {
  const [autoStarted, setAutoStarted] = useState(false)

  const doLogin = useMemo(
    () => () => keycloak.login({ redirectUri: window.location.origin + '/app' }),
    []
  )

  useEffect(() => {
    const t = window.setTimeout(() => {
      setAutoStarted(true)
      doLogin()
    }, 650)
    return () => window.clearTimeout(t)
  }, [doLogin])

  return (
    <AuthLayout
      title="Sign in"
      subtitle={autoStarted ? 'Opening secure sign-in…' : 'Use your organization account to continue'}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          You will be redirected to the secure identity provider (Keycloak). If your account is new, use{' '}
          <Link className="underline underline-offset-4" to="/register">
            registration
          </Link>{' '}
          first.
        </div>

        <Button
          onClick={doLogin}
          className="w-full justify-center"
          aria-label="Continue to secure sign-in"
        >
          Continue to secure sign-in
        </Button>

        <div className="text-xs text-slate-600">
          Need help? Visit{' '}
          <Link className="underline underline-offset-4" to="/help">
            Help
          </Link>{' '}
          or contact your project reference in the footer below.
        </div>
      </div>
    </AuthLayout>
  )
}
