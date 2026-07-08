import React from 'react'
import AuthLayout from '../components/auth-layout'

export default function VerifyEmailPage() {
  return (
    <AuthLayout title="Verify your email" subtitle="Verification is handled by Keycloak.">
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          After creating your account, Keycloak sends a verification email to the address you provided. Open that email
          and click the verification link.
        </p>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="font-semibold text-slate-900">Local development (Mailpit)</div>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>
              Open the Mailpit inbox at <span className="font-mono">http://localhost:8025</span>
            </li>
            <li>
              Open the latest message and click the verification link.
            </li>
          </ul>
        </div>

        <div className="text-xs text-slate-600">
          If you do not see the email, check your spam folder (in production) or confirm SMTP settings.
        </div>
      </div>
    </AuthLayout>
  )
}
