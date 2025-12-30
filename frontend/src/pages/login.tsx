import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/auth-layout";
import { keycloak } from "../keycloak";

export default function LoginPage() {
  const [autoStarted, setAutoStarted] = useState(false);

  const doLogin = useMemo(
    () => () => keycloak.login({ redirectUri: window.location.origin + "/app" }),
    []
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      setAutoStarted(true);
      doLogin();
    }, 900); // fast, but still lets the UI paint
    return () => window.clearTimeout(t);
  }, [doLogin]);

  return (
    <AuthLayout
      title="Sign in"
      subtitle={autoStarted ? "Opening secure sign-in…" : "Secure access via Keycloak"}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          Use your verified account to access disputes, invite agents, and manage proposals.
        </div>

        <button
          onClick={doLogin}
          className="w-full rounded-2xl bg-white text-slate-900 font-semibold py-3 hover:bg-white/90 transition"
        >
          Continue to secure sign-in
        </button>

        <div className="flex items-center justify-between text-sm">
          <Link to="/register" className="text-white/80 hover:text-white underline underline-offset-4">
            Create an account
          </Link>
          <a
            href={import.meta.env.VITE_PROJECT_WEBSITE || "#"}
            target="_blank"
            rel="noreferrer"
            className="text-white/60 hover:text-white underline underline-offset-4"
          >
            Project page
          </a>
        </div>

        <div className="text-xs text-white/50">
          If you are not redirected automatically, click “Continue to secure sign-in”.
        </div>
      </div>
    </AuthLayout>
  );
}
