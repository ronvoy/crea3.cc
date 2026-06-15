import React, { useMemo } from "react";
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

  // Include `t` so the title updates when language changes.
  const title = useMemo(() => titleFromPath(loc.pathname, t), [loc.pathname, t]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SkipLink />
      <Background />

      <div className="relative z-10 mx-auto w-[90vw] max-w-[90vw] p-4 md:p-6">
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <Sidebar />

          <div className="flex min-h-[calc(100vh-3rem)] flex-col gap-6">
            <header className="rounded-3xl border border-white/10 bg-slate-950/30 backdrop-blur px-5 py-4 text-white flex items-center justify-between">
              <div>
                <div className="text-sm text-white/60">{t('appSubtitle')}</div>
                <div className="text-xl font-semibold tracking-tight">{title}</div>
              </div>

              <div className="flex items-center gap-3">
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
