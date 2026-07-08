import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type AccessLog = {
  id: number;
  ts: string;
  method: string;
  path: string;
  status_code: number;
  ip: string;
  user_agent: string;
  user_email?: string | null;
  duration_ms?: number | null;
};

function getAdminToken(): string | null {
  return localStorage.getItem("admin_token");
}

export default function AdminDashboardPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const total = logs.length;
    const uniqueIps = new Set(logs.map((l) => l.ip).filter(Boolean)).size;
    const uniqueUsers = new Set(logs.map((l) => l.user_email || "").filter(Boolean)).size;
    const topPaths = new Map<string, number>();
    for (const l of logs) topPaths.set(l.path, (topPaths.get(l.path) || 0) + 1);
    const top = [...topPaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { total, uniqueIps, uniqueUsers, top };
  }, [logs]);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const token = getAdminToken();
      const r = await fetch("/api/admin/access-logs?limit=200&only_api=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const msg = await r.text();
        throw new Error(msg || "Failed to load logs");
      }
      const data = (await r.json()) as AccessLog[];
      setLogs(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    localStorage.removeItem("admin_token");
    window.location.href = "/admin";
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Control room</h1>
            <p className="text-sm text-white/70">
              Admin-only dashboard with request/access logs and quick tools.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadLogs}
              disabled={loading}
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-70"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={logout}
              className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10"
            >
              Log out
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-100 ring-1 ring-red-300/30">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-sm text-white/70">Requests (last fetch)</div>
            <div className="mt-1 text-3xl font-bold">{summary.total}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-sm text-white/70">Unique IPs</div>
            <div className="mt-1 text-3xl font-bold">{summary.uniqueIps}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-sm text-white/70">Unique users (email claim)</div>
            <div className="mt-1 text-3xl font-bold">{summary.uniqueUsers}</div>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Top endpoints</h2>
            <div className="text-sm text-white/60">
              <Link to="/" className="underline">
                Open the app
              </Link>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {summary.top.length === 0 ? (
              <span className="text-sm text-white/60">No data yet.</span>
            ) : (
              summary.top.map(([path, count]) => (
                <span
                  key={path}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs text-white ring-1 ring-white/10"
                >
                  {count}× {path}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Access / request logs</h2>
          <p className="mt-1 text-sm text-white/70">
            This list is populated by a backend middleware that writes into a SQLite table (<code>AccessLog</code>).
          </p>

          <div className="mt-4 overflow-auto rounded-lg ring-1 ring-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-white/80">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Path</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">ms</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-white/10">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(l.ts).toLocaleString()}</td>
                    <td className="px-3 py-2">{l.method}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.path}</td>
                    <td className="px-3 py-2">{l.status_code}</td>
                    <td className="px-3 py-2">{l.user_email || "-"}</td>
                    <td className="px-3 py-2">{l.ip || "-"}</td>
                    <td className="px-3 py-2">{l.duration_ms ?? "-"}</td>
                  </tr>
                ))}
                {logs.length === 0 && !loading && (
                  <tr>
                    <td className="px-3 py-4 text-white/60" colSpan={7}>
                      No logs yet. Trigger some API requests and refresh.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-sm text-white/70">
            <div className="font-semibold">Quick tools</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                API health:{" "}
                <a className="underline" href="/api/ready" target="_blank" rel="noreferrer">
                  /api/ready
                </a>
              </li>
              <li>
                API docs:{" "}
                <a className="underline" href="/docs" target="_blank" rel="noreferrer">
                  /docs
                </a>
              </li>
              <li>Tip: extend this dashboard with “users”, “disputes”, “reports” views as you expose admin endpoints.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
