import React from "react";
import Background from "./background";
import SiteFooter from "./site-footer";

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Background />

      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-5xl">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
              {/* Brand panel */}
              <div className="hidden lg:flex flex-col justify-between rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-10 shadow-2xl">
                <div>
                  <div className="flex items-center gap-4">
                    <img
                      src="/crea3-logo.png"
                      alt="CREA3"
                      className="h-16 w-16 rounded-2xl bg-white/80 p-2 border border-white/20"
                      loading="lazy"
                    />
                    <div>
                      <div className="text-2xl font-semibold text-white tracking-tight">
                        CREA3 Platform
                      </div>
                      <div className="text-sm text-white/70">
                        Dispute resolution • structured negotiation • mediation
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 space-y-3 text-sm text-white/75 leading-relaxed">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="font-medium text-white/90">Enterprise-ready access</div>
                      <div className="mt-1">
                        Sign in is handled by Keycloak (OIDC + PKCE). Accounts require email
                        verification before platform access is granted.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="font-medium text-white/90">Designed for collaboration</div>
                      <div className="mt-1">
                        Invite agents, collect preferences, generate proposals, and schedule mediation — all in one place.
                      </div>
                    </div>

                    <div className="text-xs text-white/50">
                      Tip: keep Mailpit open during local dev to view verification emails.
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <img
                    src="/partners.png"
                    alt="Partners"
                    className="w-full h-auto object-contain opacity-90"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Auth card */}
              <div className="rounded-3xl border border-white/10 bg-black/60 p-8 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-3">
                  <img
                    src="/crea3-logo.png"
                    alt="CREA3"
                    className="h-12 w-12 rounded-2xl bg-white/80 p-2 border border-white/20"
                    loading="lazy"
                  />
                  <div>
                    <h1 className="text-xl font-semibold text-white">{title}</h1>
                    {subtitle ? <p className="mt-1 text-sm text-white/70">{subtitle}</p> : null}
                  </div>
                </div>

                <div className="mt-6">{children}</div>

                <div className="mt-8 text-xs text-white/50">
                  By continuing you agree to the platform terms & privacy policy.
                </div>
              </div>
            </div>

            {/* Always-on footer */}
            <SiteFooter compact />
          </div>
        </div>
      </div>
    </div>
  );
}
