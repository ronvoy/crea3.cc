import React, { useMemo, useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./sidebar";
import Background from "./background";
import SkipLink from "./skip-link";
import SiteFooter from "./site-footer";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import { Button, Pill } from "./ui";

function titleFromPath(pathname: string, t: (k: any) => string) {
  if (pathname === "/app") return t('navMyDisputes');
  if (pathname.startsWith("/app/disputes/")) return t('dispute');
  const map: Record<string, string> = {
    "/app/mediators": t('navMediators'),
    "/app/account": t('navAccount'),
    "/app/faq": t('navFaqs'),
    "/app/scope": t('navScope'),
    "/app/partners": t('navPartners'),
    "/app/others": t('navOtherResources'),
  };
  return map[pathname] || t('dispute');
}

export default function Shell() {
  const loc = useLocation();
  const { user } = useAuth();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [loc.pathname]);
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const title = useMemo(() => titleFromPath(loc.pathname, t), [loc.pathname, t]);

  return (
    <div className="relative min-h-screen">
      <SkipLink />
      <Background />

      {/*
        ── Mobile hamburger / close ──────────────────────────────────────────
        position:fixed + z-[70]: lives in the ROOT stacking context with no
        ancestors that can create a lower-level stacking context above it.
        This guarantees it is always visible and clickable above the backdrop
        (z-40) and the sidebar drawer (z-50).
      */}
      <button
        type="button"
        className="fixed top-4 left-4 z-[70] md:hidden p-2 rounded-xl border border-white/20 bg-slate-900/90 text-white shadow-lg hover:bg-slate-800 transition"
        onClick={() => setSidebarOpen(v => !v)}
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={sidebarOpen}
      >
        {sidebarOpen ? (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Backdrop — z-40, in root stacking context */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/*
        ── Main wrapper — NO z-index ─────────────────────────────────────────
        Must not carry a z-index. Any z-index here would create a stacking
        context that traps the sidebar drawer (z-50) inside it, making it
        render below the backdrop (z-40) which is in the root stacking context.
      */}
      <div className="relative mx-auto w-[90vw] max-w-[90vw] p-4 md:p-6">
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

          <div className="flex min-h-[calc(100vh-3rem)] flex-col gap-6 min-w-0">
            {/*
              pl-14 on mobile: leaves room for the fixed hamburger button (44px)
              so the title doesn't slide under it.
            */}
            <header className="rounded-3xl border border-white/10 bg-slate-950/30 backdrop-blur px-5 py-4 text-white flex items-center gap-3 justify-between pl-14 md:pl-5">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/60 truncate">{t('appSubtitle')}</div>
                <div className="text-xl font-semibold tracking-tight truncate">{title}</div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {user ? (
                  <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-sm font-medium">{user.username}</div>
                    <Pill>{user.role ?? "user"}</Pill>
                  </div>
                ) : null}
                <Button
                  variant="ghost"
                  className="bg-white/5 border border-white/10 text-white hover:bg-white/10"
                  aria-label={t('refresh')}
                  onClick={() => window.location.reload()}
                >
                  Refresh
                </Button>
              </div>
            </header>

            <main id="main-content" tabIndex={-1} className="flex-1 rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-4 md:p-6">
              <Outlet />
            </main>

            <SiteFooter />
          </div>
        </div>
      </div>
    </div>
  );
}
