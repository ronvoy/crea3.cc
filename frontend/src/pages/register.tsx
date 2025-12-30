import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/auth-layout";
import { keycloak } from "../keycloak";

export default function RegisterPage() {
  const [autoStarted, setAutoStarted] = useState(false);

  const doRegister = useMemo(
    () => () => keycloak.register({ redirectUri: window.location.origin + "/app" }),
    []
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      setAutoStarted(true);
      doRegister();
    }, 900);
    return () => window.clearTimeout(t);
  }, [doRegister]);

  return (
    <AuthLayout
      title="Create account"
      subtitle={autoStarted ? "Opening secure registration…" : "Email verification required"}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          Registration is open. You will receive an email verification link before you can access the platform.
        </div>

        <button
          onClick={doRegister}
          className="w-full rounded-2xl bg-white text-slate-900 font-semibold py-3 hover:bg-white/90 transition"
        >
          Continue to registration
        </button>

        <div className="flex items-center justify-between text-sm">
          <Link to="/login" className="text-white/80 hover:text-white underline underline-offset-4">
            Already have an account? Sign in
          </Link>
          <a
            href="http://localhost:8025"
            target="_blank"
            rel="noreferrer"
            className="text-white/60 hover:text-white underline underline-offset-4"
          >
            Open Mailpit inbox
          </a>
        </div>

        <div className="text-xs text-white/50">
          If you are not redirected automatically, click “Continue to registration”.
        </div>
      </div>
    </AuthLayout>
  );
}
