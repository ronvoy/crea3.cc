import React from "react";
import { Link, useLocation } from "react-router-dom";
import Background from "./background";
import SkipLink from "./skip-link";
import SiteFooter from "./site-footer";
import { Button } from "./ui";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const loc = useLocation();
  const { t } = useI18n();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SkipLink />
      <Background />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="px-4 pt-6">
          <div className="mx-auto w-full max-w-screen-2xl rounded-3xl border border-white/10 bg-slate-950/30 backdrop-blur px-5 py-4 text-white flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <img
                src="/crea3-logo.png"
                alt="CREA3"
                className="h-10 w-10 rounded-2xl bg-white/80 p-2 border border-white/20"
              />
              <div>
                <div className="font-semibold leading-tight">CREA3 Platform</div>
                <div className="text-xs text-white/60">Dispute resolution platform</div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Link to="/scope" className="hidden sm:block text-sm text-white/70 hover:text-white">Scope</Link>
              <Link to="/partners" className="hidden sm:block text-sm text-white/70 hover:text-white">Partners</Link>
              <Link to="/help" className="hidden sm:block text-sm text-white/70 hover:text-white">Help</Link>
              {user ? (
                <Link to="/app">
                  <Button className="px-4 py-2">Open app</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="ghost" className="px-4 py-2">Sign in</Button>
                  </Link>
                  <Link to="/register">
                    <Button className="px-4 py-2">Register</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-8">
          <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
        </main>

        <div className="px-4 pb-8">
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
