import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "../components/auth-layout";

export default function AdminLoginPage() {
  const nav = useNavigate();
  // Never prefill credentials: they would ship to every visitor in the bundle.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!r.ok) {
        const msg = await r.text();
        throw new Error(msg || "Login failed");
      }

      const data = await r.json();
      localStorage.setItem("admin_token", data.access_token);
      nav("/admin-dashboard");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Admin control room">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-white/80">Email</label>
          <input
            className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white placeholder-white/50 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/30"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div>
          <label className="block text-sm text-white/80">Password</label>
          <input
            className="mt-1 w-full rounded-md bg-white/10 px-3 py-2 text-white placeholder-white/50 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/30"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-100 ring-1 ring-red-300/30">
            {error}
          </div>
        )}

        <button
          disabled={loading}
          className="w-full rounded-md bg-slate-50 px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <div className="text-center text-sm text-white/70">
          <Link to="/" className="underline text-white">
            Back to app
          </Link>
        </div>

        <div className="text-xs text-white/60">
          Restricted area. Credentials are configured server-side
          (ADMIN_EMAIL / ADMIN_PASSWORD in the backend environment).
        </div>
      </form>
    </AuthLayout>
  );
}
