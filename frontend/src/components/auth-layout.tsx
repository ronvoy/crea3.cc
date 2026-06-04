import React from 'react'
import NetworkBackground from './background'
import SiteFooter from './site-footer'
import SkipLink from './skip-link'

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-screen gap-6 bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <SkipLink />

      {/* “Hero” container matches Landing page background */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/40 shadow-2xl backdrop-blur">
        <NetworkBackground fixed={false} />

        <div className="relative p-7 md:p-10 text-white">
          {/* Header matches Landing look & feel */}
          <div className="flex items-center gap-3">
            <img
              src="/crea3.logo.png"
              alt="CREA3 logo"
              className="h-12 w-12 rounded-2xl bg-white/70 border border-white/40 object-contain"
              loading="lazy"
              onError={(e) => {
                // Fallback for unusual asset paths
                ;(e.currentTarget as HTMLImageElement).src = '/crea3-logo.png'
              }}
            />
            <div className="min-w-0">
              <div className="text-sm text-white/80">Online dispute resolution platform</div>
              <div className="text-2xl md:text-3xl font-semibold leading-tight">CREA3</div>
            </div>

            <div className="ml-auto hidden md:flex gap-2" aria-hidden="true">
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs border border-white/15">Bids</span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs border border-white/15">Rates</span>
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs border border-white/15">Mediation</span>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-stretch">
            {/* Brand / guidance panel */}
            <div className="hidden lg:flex flex-col justify-between rounded-3xl border border-white/10 bg-black/20 p-8 shadow-2xl backdrop-blur">
              <div>
                <div className="text-xs font-extrabold tracking-wider text-white/70 uppercase">Secure access</div>
                <div className="mt-2 text-2xl font-semibold">{title}</div>
                {subtitle ? <div className="mt-2 text-white/70">{subtitle}</div> : null}

                <div className="mt-8 space-y-3 text-sm text-white/75">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="font-semibold text-white">Accessibility</div>
                    <div className="mt-1 text-white/70">
                      Use the Settings bar on the left to enable high-contrast mode, adjust font size, and reduce motion.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="font-semibold text-white">Email verification</div>
                    <div className="mt-1 text-white/70">
                      New accounts receive a verification email. Open Mailpit locally to review messages during development.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 text-xs text-white/50">
                By continuing you agree to the platform terms & privacy policy.
              </div>
            </div>

            {/* Form / action panel */}
            <main
              id="main-content"
              tabIndex={-1}
              className="rounded-3xl border border-white/10 bg-white/90 p-8 shadow-2xl backdrop-blur text-slate-900"
            >
              <div className="lg:hidden">
                <div className="text-sm text-slate-600">Secure access</div>
                <div className="text-2xl font-semibold">{title}</div>
                {subtitle ? <div className="mt-1 text-slate-600">{subtitle}</div> : null}
              </div>

              <div className="mt-6">{children}</div>

              <div className="mt-8 text-xs text-slate-600">
                Need help? Use the Help page or the dispute assistant once you enter a case.
              </div>
            </main>
          </div>

          {/* Always-on footer */}
          <SiteFooter compact />
        </div>
      </div>
    </div>
  )
}
