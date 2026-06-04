import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/auth-layout'
import { Button } from '../components/ui'
import { keycloak } from '../keycloak'

export default function RegisterPage() {
  const [autoStarted, setAutoStarted] = useState(false)

  const doRegister = useMemo(
    () => () => keycloak.register({ redirectUri: window.location.origin + '/app' }),
    []
  )

  useEffect(() => {
    const t = window.setTimeout(() => {
      setAutoStarted(true)
      doRegister()
    }, 650)
    return () => window.clearTimeout(t)
  }, [doRegister])

  return (
    <AuthLayout
      title="Create account"
      subtitle={autoStarted ? 'Opening secure registration…' : 'Email verification required'}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Registration is open. You will receive an email verification link before you can access the platform.
        </div>

        <Button
          onClick={doRegister}
          className="w-full justify-center"
          aria-label="Continue to registration"
        >
          Continue to registration
        </Button>

        <div className="text-xs text-slate-600">
          Already have an account?{' '}
          <Link className="underline underline-offset-4" to="/login">
            Sign in
          </Link>
          .
        </div>
      </div>
    </AuthLayout>
  )
}
