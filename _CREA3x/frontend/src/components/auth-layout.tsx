import React from 'react'
import { Link } from 'react-router-dom'
import NetworkBackground from './background'
import SiteFooter from './site-footer'
import SkipLink from './skip-link'
import HelpWidget from './help-widget'
import { useI18n } from '../i18n'

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="grid min-h-screen gap-6 bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <SkipLink />

      {/* “Hero” container matches Landing page background */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/40 shadow-2xl backdrop-blur">
        <NetworkBackground fixed={false} />

        <div className="relative p-7 md:p-10 text-white">
          {/* Header matches Landing look & feel */}
          <div className="flex items-center gap-3">
            <Link to="/" aria-label={t('authBackHome')} className="flex items-center gap-3 rounded-2xl transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
              <img
                src="/crea3.logo.png"
                alt="CREA3 logo"
                className="h-14 w-14 rounded-2xl bg-white/80 border border-white/40 object-contain p-1"
                loading="lazy"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = '/crea3-logo.png'
                }}
              />
              <div className="min-w-0">
                <div className="text-sm text-white/80">Online dispute resolution platform</div>
                <div className="text-2xl md:text-3xl font-semibold leading-tight">CREA3</div>
              </div>
            </Link>

            <Link to="/" className="ml-auto hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/85 hover:bg-white/15">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              {t('authBackHome')}
            </Link>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-stretch">
            {/* Brand / guidance panel */}
            <div className="hidden lg:flex flex-col justify-between rounded-3xl border border-white/10 bg-black/20 p-8 shadow-2xl backdrop-blur">
              <div>
                <div className="text-xs font-extrabold tracking-wider text-white/70 uppercase">Secure access</div>
                <div className="mt-2 text-2xl font-semibold">{title}</div>
                {subtitle ? <div className="mt-2 text-white/70">{subtitle}</div> : null}

                <div className="mt-8 grid grid-cols-2 gap-3">
                  <Link to="/" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-medium text-white transition hover:bg-white/10">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7M5 10v10h14V10" /></svg>
                    {t('authBackHome')}
                  </Link>
                  <Link to="/workflow" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-medium text-white transition hover:bg-white/10">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5m0 14h16M8 16l3-4 3 2 4-6" /></svg>
                    {t('landingNavWorkflow')}
                  </Link>
                  <Link to="/scope" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-medium text-white transition hover:bg-white/10">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 4-9 4-9-4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4" /></svg>
                    {t('landingNavScope')}
                  </Link>
                  <Link to="/help" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-medium text-white transition hover:bg-white/10">
                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg>
                    {t('landingNavHelp')}
                  </Link>
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

      <HelpWidget />
    </div>
  )
}
