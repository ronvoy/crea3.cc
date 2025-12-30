import React, { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./sidebar";
import Background from "./background";
import SiteFooter from "./site-footer";
import { useAuth } from "../store/auth";
import { Button, Pill } from "./ui";

function titleFromPath(pathname: string) {
  if (pathname === "/app") return "My disputes";
  if (pathname.startsWith("/app/disputes/")) return "Dispute";
  const map: Record<string, string> = {
    "/app/mediators": "Mediators",
    "/app/account": "Account",
    "/app/settings": "Settings",
    "/app/scope": "Scope",
    "/app/partners": "Partners",
    "/app/strategy": "Strategy",
    "/app/ready": "Readiness",
    "/app/mediation": "Mediation",
    "/app/faq": "FAQs",
    "/app/others": "Other resources",
  };
  return map[pathname] || "CREA3";
}

export default function Shell() {
  const loc = useLocation();
  const { user } = useAuth();

  const title = useMemo(() => titleFromPath(loc.pathname), [loc.pathname]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Background />

      <div className="relative z-10 mx-auto max-w-7xl p-4 md:p-6">
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <Sidebar />

          <div className="flex min-h-[calc(100vh-3rem)] flex-col gap-6">
            <header className="rounded-3xl border border-white/10 bg-slate-950/30 backdrop-blur px-5 py-4 text-white flex items-center justify-between">
              <div>
                <div className="text-sm text-white/60">CREA3 Dispute Resolution</div>
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
                  onClick={() => window.location.reload()}
                >
                  Refresh
                </Button>
              </div>
            </header>

            <main className="flex-1 rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-4 md:p-6">
              <Outlet />
            </main>

            <SiteFooter />
          </div>
        </div>
      </div>
    </div>
  );
}
