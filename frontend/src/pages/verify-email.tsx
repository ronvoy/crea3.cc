import AuthLayout from '../components/auth-layout'

export default function VerifyEmailPage() {
  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Verification is handled by Keycloak."
    >
      <div className="space-y-4 text-sm text-white/70">
        <p>
          After creating your account, Keycloak sends a verification email to the address you provided.
          Open that email and click the verification link.
        </p>

        <div className="rounded-lg border border-white/15 bg-white/5 p-3">
          <div className="font-semibold text-white/80">Local development (Mailpit)</div>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>Open the Mailpit inbox at <span className="font-mono text-white/80">http://localhost:8025</span></li>
            <li>Open the latest message from <span className="font-mono text-white/80">no-reply@crea.local</span></li>
            <li>Click the verification link inside the email</li>
          </ul>
        </div>

        <p>
          Once verified, go back to the Sign in page and log in.
        </p>
      </div>
    </AuthLayout>
  )
}
