import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  Title, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

// Backend admin console: Users (Keycloak replacement), Mail (Mailpit
// replacement) and Database (DBMS browser). All calls carry the admin_token
// issued by /api/admin/login (admin/admin from backend/.env).

function adminToken(): string | null {
  return localStorage.getItem("admin_token");
}
async function adminApi(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken() ?? ""}`, ...(init.headers || {}) },
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error((data && data.detail) || `Request failed (${res.status})`);
  return data;
}

// ── theme ───────────────────────────────────────────────────────────────────
type Theme = "dark" | "light";
function palette(th: Theme) {
  return th === "dark"
    ? { bg: "#0b1120", panel: "#111827", panel2: "#0b1120", border: "#1f2937", border2: "#334155", text: "#e2e8f0", muted: "#94a3b8", faint: "#64748b", accent: "#2563eb", danger: "#fca5a5", ok: "#86efac", rowHi: "#1e3a5f" }
    : { bg: "#f1f5f9", panel: "#ffffff", panel2: "#f8fafc", border: "#e2e8f0", border2: "#cbd5e1", text: "#0f172a", muted: "#475569", faint: "#94a3b8", accent: "#2563eb", danger: "#dc2626", ok: "#16a34a", rowHi: "#dbeafe" };
}
type C = ReturnType<typeof palette>;

const PAGE_SIZES = [10, 25, 50, 100];

export default function AdminDashboardPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"users" | "stats" | "mail" | "database" | "knowledge" | "consent" | "themes">("stats");
  const [theme, setTheme] = useState<Theme>((localStorage.getItem("admin_theme") as Theme) || "dark");
  const [refreshTick, setRefreshTick] = useState(0);
  const c = palette(theme);

  useEffect(() => { localStorage.setItem("admin_theme", theme); }, [theme]);

  function logout() { localStorage.removeItem("admin_token"); nav("/admin"); }

  const tb = (active: boolean): React.CSSProperties => ({
    background: active ? c.accent : c.panel, color: active ? "#fff" : c.muted,
    border: `1px solid ${active ? c.accent : c.border2}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 14,
  });

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: `1px solid ${c.border}`, flexWrap: "wrap", gap: 10 }}>
        <strong style={{ fontSize: 18 }}>CREA3 — Admin console</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(["stats", "mail", "users", "consent", "database", "knowledge", "themes"] as const).map((tt) => (
            <button key={tt} onClick={() => setTab(tt)} style={tb(tab === tt)}>{tt === "knowledge" ? "Knowledge Base" : tt[0].toUpperCase() + tt.slice(1)}</button>
          ))}
          <button onClick={() => setRefreshTick((n) => n + 1)} title="Refresh current tab" style={{ ...tb(false), background: c.accent, color: "#fff", borderColor: c.accent }}>⟳ Refresh</button>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" style={tb(false)}>{theme === "dark" ? "☀ Light" : "🌙 Dark"}</button>
          <button onClick={logout} style={{ ...tb(false), color: c.danger }}>Sign out</button>
        </div>
      </header>
      <main style={{ padding: 22 }}>
        {tab === "users" && <UsersTab c={c} refreshTick={refreshTick} />}
        {tab === "stats" && <StatsTab c={c} refreshTick={refreshTick} />}
        {tab === "mail" && <MailTab c={c} refreshTick={refreshTick} />}
        {tab === "database" && <DatabaseTab c={c} refreshTick={refreshTick} />}
        {tab === "knowledge" && <KnowledgeBaseTab c={c} refreshTick={refreshTick} />}
        {tab === "consent" && <ConsentTab c={c} refreshTick={refreshTick} />}
        {tab === "themes" && <ThemesTab c={c} refreshTick={refreshTick} />}
      </main>
    </div>
  );
}

// ── shared style helpers ───────────────────────────────────────────────────────
const S = (c: C) => ({
  card: { background: c.panel, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, marginBottom: 16 } as React.CSSProperties,
  th: { textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${c.border2}`, color: c.muted, fontWeight: 600, fontSize: 13, cursor: "pointer", userSelect: "none" } as React.CSSProperties,
  td: { padding: "8px 10px", borderBottom: `1px solid ${c.border}`, fontSize: 13, verticalAlign: "top" } as React.CSSProperties,
  input: { background: c.panel2, color: c.text, border: `1px solid ${c.border2}`, borderRadius: 6, padding: "6px 8px", fontSize: 13 } as React.CSSProperties,
  btn: { background: c.accent, color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 } as React.CSSProperties,
  ghost: { background: "transparent", color: c.text, border: `1px solid ${c.border2}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 } as React.CSSProperties,
  err: { background: c.panel2, color: c.danger, border: `1px solid ${c.danger}`, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 } as React.CSSProperties,
});

function Pager({ c, page, pageSize, total, setPage, setPageSize }: { c: C; page: number; pageSize: number; total: number; setPage: (n: number) => void; setPageSize: (n: number) => void }) {
  const s = S(c);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
      <span style={{ color: c.muted }}>Rows:</span>
      <select style={s.input} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button style={s.ghost} disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ prev</button>
      <span>{page} / {pages}</span>
      <button style={s.ghost} disabled={page >= pages} onClick={() => setPage(page + 1)}>next ›</button>
      <span style={{ color: c.faint }}>({total} total)</span>
    </div>
  );
}

// ── USERS ──────────────────────────────────────────────────────────────────────
function UsersTab({ c, refreshTick }: { c: C; refreshTick: number }) {
  const s = S(c);
  const [all, setAll] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [nu, setNu] = useState({ email: "", username: "", password: "", role: "agent" });
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<string>("id");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  async function load() {
    setErr(null);
    try {
      setAll(await adminApi("/api/admin/users"));
      setActivity(await adminApi("/api/admin/activity?limit=50"));
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [refreshTick]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = q ? all.filter((u) => ["email", "username", "role"].some((k) => String(u[k] ?? "").toLowerCase().includes(q))) : all.slice();
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
    });
    return rows;
  }, [all, query, sortKey, sortDir]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function sortBy(k: string) { if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(1); } }
  const arrow = (k: string) => (sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : "");

  async function patch(id: number, body: any) { try { await adminApi(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }); load(); } catch (e: any) { setErr(e.message); } }
  async function del(id: number) { if (!confirm("Delete this user?")) return; try { await adminApi(`/api/admin/users/${id}`, { method: "DELETE" }); load(); } catch (e: any) { setErr(e.message); } }
  async function create() { try { await adminApi("/api/admin/users", { method: "POST", body: JSON.stringify(nu) }); setNu({ email: "", username: "", password: "", role: "agent" }); load(); } catch (e: any) { setErr(e.message); } }

  const cols: [string, string][] = [["id", "ID"], ["email", "Email"], ["username", "Username"], ["role", "Role"], ["email_verified", "Verified"], ["last_login_at", "Last login"]];

  return (
    <div>
      {err && <div style={s.err}>{err}</div>}

      <div style={s.card}>
        <h3 style={{ marginTop: 0 }}>Create user</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={s.input} placeholder="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
          <input style={s.input} placeholder="username" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
          <input style={s.input} placeholder="password (min 8)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          <select style={s.input} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
            <option value="agent">agent</option><option value="mediator">mediator</option>
          </select>
          <button style={s.btn} onClick={create}>Create</button>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Users</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ ...s.input, minWidth: 220 }} placeholder="search email / username / role…" value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setQuery(rawQuery); setPage(1); } }} />
            <button style={s.btn} onClick={() => { setQuery(rawQuery); setPage(1); }}>Search User</button>
            {query && <button style={s.ghost} onClick={() => { setRawQuery(""); setQuery(""); }}>clear</button>}
          </div>
        </div>
        <div style={{ margin: "10px 0" }}><Pager c={c} page={page} pageSize={pageSize} total={filtered.length} setPage={setPage} setPageSize={setPageSize} /></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{cols.map(([k, label]) => <th key={k} style={s.th} onClick={() => sortBy(k)}>{label}{arrow(k)}</th>)}<th style={s.th}>Actions</th></tr></thead>
            <tbody>
              {pageRows.map((u) => (
                <tr key={u.id}>
                  <td style={s.td}>{u.id}</td>
                  <td style={s.td}>{u.email}</td>
                  <td style={s.td}>{u.username}</td>
                  <td style={s.td}>
                    <select style={s.input} value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                      <option value="agent">agent</option><option value="mediator">mediator</option>
                    </select>
                  </td>
                  <td style={s.td}>{u.email_verified ? "✓" : <button style={s.ghost} onClick={() => patch(u.id, { email_verified: true })}>verify</button>}</td>
                  <td style={s.td}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}</td>
                  <td style={s.td}><button style={{ ...s.ghost, color: c.danger }} onClick={() => del(u.id)}>delete</button></td>
                </tr>
              ))}
              {pageRows.length === 0 && <tr><td style={s.td} colSpan={7}>No matching users.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div style={s.card}>
        <h3 style={{ marginTop: 0 }}>Recent activity</h3>
        <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["When", "Event", "Email", "IP"].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>{activity.map((a) => (
              <tr key={a.id}><td style={s.td}>{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</td><td style={s.td}>{a.event}</td><td style={s.td}>{a.email}</td><td style={s.td}>{a.ip}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── MAIL ─────────────────────────────────────────────────────────────────────
// ── Stats tab ──────────────────────────────────────────────────────────────────
const RANGES: [string, string][] = [
  ["1d", "Today"], ["3d", "Last 3 days"], ["7d", "Last week"], ["15d", "Last 15 days"],
  ["30d", "Last month"], ["180d", "Last 6 months"], ["365d", "Last year"],
  ["730d", "Last 2 years"], ["1095d", "3 years"], ["1825d", "5 years"], ["all", "All time"],
];
const METRICS: [string, string][] = [["users", "Users"], ["disputes", "Disputes"], ["queries", "Queries"]];
const QUERY_GROUPS: [string, string][] = [["channel", "Public vs Legal AI"], ["intent", "Query type"]];
const GROUP_COLOR: Record<string, string> = {
  user: "#3b82f6", agent: "#10b981", mediator: "#f59e0b", admin: "#8b5cf6",
  active: "#3b82f6", resolved: "#10b981", dormant: "#f59e0b",
  public: "#14b8a6", inapp: "#6366f1",
  workflow: "#3b82f6", legal_statutes: "#8b5cf6", past_cases: "#f59e0b", general: "#64748b",
};
const GROUP_LABEL: Record<string, string> = {
  user: "Users", agent: "Agents", mediator: "Mediators", admin: "Admins",
  active: "Active (ongoing)", resolved: "Resolved", dormant: "Dormant / abandoned",
  public: "Public chatbot", inapp: "Legal AI (in-app)",
  workflow: "Workflow", legal_statutes: "Legal", past_cases: "Past cases", general: "General",
};

function StatsTab({ c, refreshTick }: { c: C; refreshTick: number }) {
  const s = S(c);
  const DEFAULT_RANGE_IDX = Math.max(0, RANGES.findIndex(([v]) => v === "30d"));
  const [metric, setMetric] = useState("users");
  const [group, setGroup] = useState("channel");        // only used for queries
  const [rangeIdx, setRangeIdx] = useState(DEFAULT_RANGE_IDX);
  const [frm, setFrm] = useState("");                   // custom range: from (YYYY-MM-DD)
  const [to, setTo] = useState("");                     // custom range: to   (YYYY-MM-DD)
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const custom = frm.trim() !== "";                     // a from-date switches to custom mode
  const preset = RANGES[rangeIdx]?.[0] || "30d";

  async function load() {
    setLoading(true); setErr(null);
    try {
      const q = new URLSearchParams({ metric });
      if (metric === "queries") q.set("group", group);
      if (custom) { q.set("from", frm); if (to.trim()) q.set("to", to); }
      else q.set("range", preset);
      setData(await adminApi(`/api/admin/stats?${q.toString()}`));
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [metric, group, rangeIdx, frm, to, refreshTick]);

  const groups: string[] = data?.groups || [];
  const labels: string[] = data?.labels || [];
  const series: Record<string, number[]> = data?.series || {};
  const totals: Record<string, number> = data?.totals || {};
  const grand: number = data?.total || 0;

  const chartData = {
    labels,
    datasets: groups.map((g) => ({
      label: GROUP_LABEL[g] || g,
      data: labels.map((_, i) => series[g]?.[i] || 0),
      backgroundColor: GROUP_COLOR[g] || c.muted,
      borderColor: GROUP_COLOR[g] || c.muted,
      borderWidth: 0,
      stack: "s",
      maxBarThickness: 46,
    })),
  };
  const chartOptions: any = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: c.text, boxWidth: 12, font: { size: 12 } } },
      tooltip: {
        callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}` },
      },
    },
    scales: {
      x: { stacked: true, ticks: { color: c.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 14 }, grid: { color: c.border } },
      y: {
        stacked: true, beginAtZero: true,
        ticks: { color: c.muted, precision: 0 },
        grid: { color: c.border },
      },
    },
  };

  return (
    <div>
      {/* Metric tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {METRICS.map(([v, l]) => {
          const active = metric === v;
          return (
            <button key={v} onClick={() => setMetric(v)} style={{
              padding: "9px 18px", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 700,
              border: `1px solid ${active ? c.accent : c.border}`,
              background: active ? c.accent : "transparent",
              color: active ? "#fff" : c.text,
            }}>{l}</button>
          );
        })}
      </div>

      {/* Controls: queries breakdown + time-range slider + custom calendar */}
      <div style={{ ...s.card, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        {metric === "queries" && (
          <label style={{ display: "grid", gap: 4, fontSize: 12, color: c.muted }}>
            Breakdown
            <select style={s.input} value={group} onChange={(e) => setGroup(e.target.value)}>
              {QUERY_GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}

        {/* Preset dropdown (Today … All time) */}
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: c.muted, opacity: custom ? 0.4 : 1 }}>
          Time range
          <select style={s.input} value={rangeIdx} disabled={custom}
            onChange={(e) => setRangeIdx(Number(e.target.value))}>
            {RANGES.map(([v, l], i) => <option key={v} value={i}>{l}</option>)}
          </select>
        </label>

        {/* Custom calendar range */}
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: c.muted }}>
          From
          <input type="date" style={s.input} value={frm} max={to || undefined}
            onChange={(e) => setFrm(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12, color: c.muted }}>
          To
          <input type="date" style={s.input} value={to} min={frm || undefined} disabled={!custom}
            onChange={(e) => setTo(e.target.value)} />
        </label>
        {custom && (
          <button onClick={() => { setFrm(""); setTo(""); }} style={{ ...s.ghost, alignSelf: "flex-end" }}>
            Clear dates
          </button>
        )}

        <span style={{ color: c.faint, fontSize: 12, marginLeft: "auto" }}>
          {loading ? "Loading…" : data ? `bucket: ${data.bucket} · ${grand} total` : ""}
        </span>
      </div>

      {err && <div style={s.err}>{err}</div>}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        {groups.map((g) => (
          <div key={g} style={{ ...s.card, marginBottom: 0, borderLeft: `4px solid ${GROUP_COLOR[g] || c.muted}` }}>
            <div style={{ color: c.muted, fontSize: 12 }}>{GROUP_LABEL[g] || g}</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{totals[g] || 0}</div>
            <div style={{ color: c.faint, fontSize: 12 }}>{grand > 0 ? Math.round(((totals[g] || 0) / grand) * 100) : 0}% of total</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ ...s.card }}>
        <div style={{ height: 380 }}>
          {labels.length ? <Bar data={chartData} options={chartOptions} /> : <div style={{ color: c.faint, padding: 40, textAlign: "center" }}>No data for this range.</div>}
        </div>
      </div>

      {/* Per-user usage (queries only) */}
      {metric === "queries" && data?.top_users?.length ? (
        <div style={{ ...s.card }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Usage per user (Public vs Legal AI)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={s.th}>User</th>
                <th style={{ ...s.th, textAlign: "right" }}>Public chatbot</th>
                <th style={{ ...s.th, textAlign: "right" }}>Legal AI (in-app)</th>
                <th style={{ ...s.th, textAlign: "right" }}>Total</th>
              </tr></thead>
              <tbody>
                {data.top_users.map((u: any, i: number) => (
                  <tr key={i}>
                    <td style={s.td}>{u.user}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>{u.public}</td>
                    <td style={{ ...s.td, textAlign: "right" }}>{u.inapp}</td>
                    <td style={{ ...s.td, textAlign: "right", fontWeight: 600 }}>{u.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MailTab({ c, refreshTick }: { c: C; refreshTick: number }) {
  const [account, setAccount] = useState<string>("info"); // which mailbox: info | support
  const s = S(c);
  const [cfg, setCfg] = useState<any>(null);
  const [all, setAll] = useState<any[]>([]);        // messages from DB (current filter)
  const [selId, setSelId] = useState<number | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "read" | "inbox" | "archived" | "spam" | "deleted">("all");
  const [box, setBox] = useState<"inbox" | "sent" | "junk">("inbox");   // Inbox / Sent / Junk sub-tab
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [fetchN, setFetchN] = useState(100);
  const [sortKey, setSortKey] = useState<string>("id");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [send, setSend] = useState({ to: "", cc: "", bcc: "", subject: "", body: "" });
  const [atts, setAtts] = useState<{ filename: string; content_b64: string }[]>([]);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Junk spans every mailbox (status=junk); Inbox/Sent map to a server folder.
  const serverMailbox = box === "sent" ? (cfg?.sent_mailbox || "INBOX.Sent") : box === "junk" ? (cfg?.junk_mailbox || "INBOX.Junk") : "INBOX";
  const listMailbox = box === "junk" ? "ALL" : serverMailbox;
  // Only the Inbox tab uses the filter dropdown; Sent shows all, Junk shows junk.
  const listFilter = box === "junk" ? "junk" : box === "sent" ? "all" : filter;

  async function loadCfg() { try { setCfg(await adminApi(`/api/admin/mail/config?account=${account}`)); } catch (e: any) { setErr(e.message); } }
  async function loadDb() {
    setErr(null);
    try {
      const r = await adminApi(`/api/admin/mail/messages?account=${account}&filter=${listFilter}&mailbox=${encodeURIComponent(listMailbox)}`);
      setAll(r.messages || []); setPage(1); setOpen(null); setSelId(null);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { loadCfg(); }, [account]);
  useEffect(() => { loadDb(); }, [account, filter, box, cfg?.sent_mailbox, cfg?.junk_mailbox]);
  useEffect(() => { if (refreshTick) loadDb(); }, [refreshTick]);

  // 'Fetch Mail' = sync IMAP -> DB (once), then load from the DB cache.
  async function fetchMail() {
    setErr(null); setNote(null); setBusy(true);
    try {
      const ds = box === "junk" ? "&default_status=junk" : "";
      // The backend time-budgets each sync call (tunnel-safe); keep calling
      // while it reports more pending, so a large mailbox drains in short hops.
      let tot = { new: 0, updated: 0, removed: 0 };
      let guard = 0;
      let r: any;
      do {
        r = await adminApi(`/api/admin/mail/sync?account=${account}&limit=${fetchN}&mailbox=${encodeURIComponent(serverMailbox)}${ds}`, { method: "POST" });
        tot = { new: tot.new + (r.new || 0), updated: tot.updated + (r.updated || 0), removed: tot.removed + (r.removed || 0) };
        setNote(`Syncing ${box}… ${tot.new} new so far`);
      } while (r?.more && ++guard < 30);
      setNote(`Synced ${box} — ${tot.new} new, ${tot.updated} updated, ${tot.removed} removed.`);
      await loadDb();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function permanentDelete(id: number) {
    if (!confirm("Permanently delete this message from the database AND the mail server? This cannot be undone.")) return;
    try {
      const r = await adminApi(`/api/admin/mail/messages/${id}/permanent`, { method: "DELETE" });
      setNote(r.server_deleted ? "Deleted from server + database." : "Deleted from database (no server copy found).");
      if (open && open.id === id) { setOpen(null); setSelId(null); }
      await loadDb();
    } catch (e: any) { setErr(e.message); }
  }

  function downloadAttachment(attId: number, filename: string) {
    fetch(`/api/admin/mail/attachments/${attId}/download`, { headers: { Authorization: `Bearer ${adminToken() ?? ""}` } })
      .then((res) => { if (!res.ok) throw new Error("download failed"); return res.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
        a.remove(); URL.revokeObjectURL(url);
      })
      .catch((e) => setErr(String(e.message || e)));
  }

  // ── bulk selection ──
  function toggleSel(id: number) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const clearSel = () => setSelected(new Set());
  async function bulkStatus(body: any) {
    if (selected.size === 0) return;
    try { await adminApi("/api/admin/mail/bulk-status", { method: "POST", body: JSON.stringify({ ids: [...selected], ...body }) }); clearSel(); await loadDb(); }
    catch (e: any) { setErr(e.message); }
  }
  async function bulkPermanent() {
    if (selected.size === 0) return;
    if (!confirm(`Permanently delete ${selected.size} message(s) from the database AND the mail server?`)) return;
    try { const r = await adminApi("/api/admin/mail/bulk-permanent", { method: "POST", body: JSON.stringify({ ids: [...selected] }) }); setNote(`Deleted ${r.deleted} (server: ${r.server_deleted}).`); clearSel(); await loadDb(); }
    catch (e: any) { setErr(e.message); }
  }
  // reset selection when the view changes
  useEffect(() => { clearSel(); }, [box, filter]);

  function sortBy(k: string) { if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(1); } }
  const arrow = (k: string) => (sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : "");

  async function openMsg(id: number) {
    setSelId(id);
    try {
      const m = await adminApi(`/api/admin/mail/messages/${id}`);
      setOpen({ ...m });
      // reflect read status locally
      setAll((prev) => prev.map((x) => (x.id === id ? { ...x, seen: true } : x)));
    } catch (e: any) { setErr(e.message); }
  }

  async function setStatus(id: number, body: any) {
    try {
      await adminApi(`/api/admin/mail/messages/${id}/status`, { method: "POST", body: JSON.stringify(body) });
      await loadDb();
      if (open && open.id === id && body.status && body.status !== "inbox") { setOpen(null); setSelId(null); }
    } catch (e: any) { setErr(e.message); }
  }

  function onFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => { const b64 = String(reader.result).split(",")[1] || ""; setAtts((prev) => [...prev, { filename: f.name, content_b64: b64 }]); };
      reader.readAsDataURL(f);
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function doSend() {
    setSendMsg(null); setErr(null);
    try {
      const r = await adminApi(`/api/admin/mail/send?account=${account}`, { method: "POST", body: JSON.stringify({ ...send, attachments: atts }) });
      setSendMsg(`Sent to ${r.recipients} recipient(s) ✓`);
      setSend({ to: "", cc: "", bcc: "", subject: "", body: "" }); setAtts([]);
    } catch (e: any) { setErr(e.message); }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = q ? all.filter((m) => ["from", "to", "subject", "date", "status"].some((k) => String(m[k] ?? "").toLowerCase().includes(q))) : all.slice();
    // Sort the WHOLE list (across the entire DB result for this box+filter).
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      const an = typeof av === "string" ? av.toLowerCase() : av;
      const bn = typeof bv === "string" ? bv.toLowerCase() : bv;
      return (an > bn ? 1 : an < bn ? -1 : 0) * sortDir;
    });
    return rows;
  }, [all, query, sortKey, sortDir]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  // 'Deleted' removed — the Junk tab handles removal. 'Spam' folded into Junk too.
  const FILTERS: [typeof filter, string][] = [["all", "All"], ["unread", "Unread"], ["read", "Read"], ["inbox", "Inbox"], ["archived", "Archived"]];
  const personKey = box === "sent" ? "to" : "from";
  const personLabel = box === "sent" ? "To" : "From";

  return (
    <div>
      {err && <div style={s.err}>{err}</div>}
      {cfg && <div style={{ ...s.card, fontSize: 13, color: c.muted }}>SMTP: <b style={{ color: c.text }}>{cfg.smtp_user}</b> @ {cfg.smtp_host} · IMAP {cfg.imap_available ? "connected" : "unavailable"}</div>}

      {/* Send with cc/bcc/attachments */}
      <div style={s.card}>
        <h3 style={{ marginTop: 0 }}>Send email</h3>
        {sendMsg && <div style={{ color: c.ok, marginBottom: 8 }}>{sendMsg}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={s.input} placeholder="to (comma-separated)" value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })} />
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...s.input, flex: 1 }} placeholder="cc (optional)" value={send.cc} onChange={(e) => setSend({ ...send, cc: e.target.value })} />
            <input style={{ ...s.input, flex: 1 }} placeholder="bcc (optional)" value={send.bcc} onChange={(e) => setSend({ ...send, bcc: e.target.value })} />
          </div>
          <input style={s.input} placeholder="subject" value={send.subject} onChange={(e) => setSend({ ...send, subject: e.target.value })} />
          <textarea style={{ ...s.input, minHeight: 90 }} placeholder="message" value={send.body} onChange={(e) => setSend({ ...send, body: e.target.value })} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" multiple onChange={(e) => onFiles(e.target.files)} style={{ fontSize: 12, color: c.muted }} />
            {atts.map((a, i) => <span key={i} style={{ fontSize: 12, background: c.panel2, border: `1px solid ${c.border2}`, borderRadius: 6, padding: "2px 8px" }}>{a.filename} <span style={{ cursor: "pointer", color: c.danger }} onClick={() => setAtts(atts.filter((_, j) => j !== i))}>✕</span></span>)}
          </div>
          <div><button style={s.btn} onClick={doSend}>Send</button></div>
        </div>
      </div>

      {/* Inbox */}
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: c.muted, fontSize: 13 }}>Mailbox:</span>
            <select style={s.input} value={account} onChange={(e) => setAccount(e.target.value)} title="Mailbox account">
              {(cfg?.accounts || [{ account: "info", email: cfg?.smtp_user || "info@crea3.cc", available: true }]).map((a: any) => (
                <option key={a.account} value={a.account} disabled={!a.available}>
                  {(a.email || a.account)}{a.available ? "" : " (no creds)"}
                </option>
              ))}
            </select>
            {(["inbox", "sent", "junk"] as const).map((bb) => (
              <button key={bb} onClick={() => setBox(bb)}
                style={{ ...(box === bb ? s.btn : s.ghost), textTransform: "capitalize" }}>{bb}</button>
            ))}
            {box === "inbox" && <>
              <span style={{ color: c.muted, fontSize: 13, marginLeft: 6 }}>Filter:</span>
              <select style={s.input} value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                {FILTERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: c.muted, fontSize: 13 }}>Fetch</span>
            <select style={s.input} value={fetchN} onChange={(e) => setFetchN(Number(e.target.value))}>
              {[50, 100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button style={s.btn} disabled={busy} onClick={fetchMail}>{busy ? "Fetching…" : "Fetch Mail"}</button>
            <input style={{ ...s.input, minWidth: 180 }} placeholder="search…" value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setQuery(rawQuery); setPage(1); } }} />
            <button style={s.btn} onClick={() => { setQuery(rawQuery); setPage(1); }}>Search</button>
            {query && <button style={s.ghost} onClick={() => { setRawQuery(""); setQuery(""); }}>clear</button>}
          </div>
        </div>
        {note && <div style={{ color: c.ok, fontSize: 13, marginTop: 8 }}>{note}</div>}

        {all.length === 0 ? <div style={{ color: c.faint, marginTop: 10 }}>No messages for this filter. Click “Fetch Mail” to sync the inbox.</div> : (
          <>
            <div style={{ margin: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <Pager c={c} page={page} pageSize={pageSize} total={filtered.length} setPage={setPage} setPageSize={setPageSize} />
              {selected.size > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: c.muted, fontSize: 13 }}>{selected.size} selected:</span>
                  <button style={s.ghost} onClick={() => bulkStatus({ seen: true })}>Mark read</button>
                  <button style={s.ghost} onClick={() => bulkStatus({ seen: false })}>Mark unread</button>
                  {box === "junk"
                    ? <button style={{ ...s.ghost, color: c.danger }} onClick={bulkPermanent}>Delete permanently</button>
                    : <button style={{ ...s.ghost, color: c.danger }} onClick={() => bulkStatus({ status: "junk" })}>Delete</button>}
                  <button style={s.ghost} onClick={clearSel}>clear</button>
                </div>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={s.th}><input type="checkbox"
                    checked={pageRows.length > 0 && pageRows.every((m) => selected.has(m.id))}
                    onChange={(e) => setSelected((prev) => { const n = new Set(prev); pageRows.forEach((m) => e.target.checked ? n.add(m.id) : n.delete(m.id)); return n; })} /></th>
                  <th style={s.th} onClick={() => sortBy("seen")}>•{arrow("seen")}</th>
                  <th style={s.th} onClick={() => sortBy(personKey)}>{personLabel}{arrow(personKey)}</th>
                  <th style={s.th} onClick={() => sortBy("subject")}>Subject{arrow("subject")}</th>
                  <th style={s.th} onClick={() => sortBy("date")}>Date{arrow("date")}</th>
                  <th style={s.th} onClick={() => sortBy("status")}>Status{arrow("status")}</th>
                  <th style={s.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {pageRows.map((m) => {
                    const unread = !m.seen;
                    const rowSel = selId === m.id;
                    const isOpen = open && open.id === m.id;
                    return (
                      <Fragment key={m.id}>
                        <tr style={{ background: rowSel ? c.rowHi : "transparent", fontWeight: unread ? 700 : 400 }}>
                          <td style={s.td}><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSel(m.id)} onClick={(e) => e.stopPropagation()} /></td>
                          <td style={{ ...s.td, cursor: "pointer" }} onClick={() => (isOpen ? (setOpen(null), setSelId(null)) : openMsg(m.id))}>{isOpen ? "▾" : unread ? "●" : ""}</td>
                          <td style={{ ...s.td, cursor: "pointer" }} onClick={() => (isOpen ? (setOpen(null), setSelId(null)) : openMsg(m.id))}>{m[personKey]}</td>
                          <td style={{ ...s.td, cursor: "pointer" }} onClick={() => (isOpen ? (setOpen(null), setSelId(null)) : openMsg(m.id))}>{m.subject}</td>
                          <td style={s.td}>{m.date}</td>
                          <td style={s.td}><span style={{ fontSize: 11, color: c.muted }}>{m.status}</span></td>
                          <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                            <button title="toggle read" style={s.ghost} onClick={() => setStatus(m.id, { seen: !m.seen })}>{m.seen ? "unread" : "read"}</button>{" "}
                            {box !== "junk" ? (
                              <>
                                <button title="archive" style={s.ghost} onClick={() => setStatus(m.id, { status: "archived" })}>arch</button>{" "}
                                {m.status !== "inbox" && <button title="move to inbox" style={s.ghost} onClick={() => setStatus(m.id, { status: "inbox" })}>inbox</button>}{" "}
                                <button title="move to junk" style={{ ...s.ghost, color: c.danger }} onClick={() => setStatus(m.id, { status: "junk" })}>del</button>
                              </>
                            ) : (
                              <>
                                <button title="restore to inbox" style={s.ghost} onClick={() => setStatus(m.id, { status: "inbox" })}>restore</button>{" "}
                                <button title="delete permanently (DB + server)" style={{ ...s.ghost, color: c.danger }} onClick={() => permanentDelete(m.id)}>delete permanently</button>
                              </>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${c.border}` }}>
                              <div style={{ margin: "0 8px 12px", border: `1px solid ${c.border2}`, borderRadius: 10, padding: 14, background: c.panel2 }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <h4 style={{ margin: 0 }}>{open.subject} <span style={{ fontSize: 12, color: c.ok }}>(read)</span></h4>
                                  <button style={s.ghost} onClick={() => { setOpen(null); setSelId(null); }}>collapse ▲</button>
                                </div>
                                <div style={{ fontSize: 12, color: c.muted, margin: "6px 0", overflowWrap: "anywhere" }}>
                                  <div><b>From:</b> {open.from || "—"}</div>
                                  <div><b>To:</b> {open.to || "—"}</div>
                                  {open.cc ? <div><b>Cc:</b> {open.cc}</div> : null}
                                  <div><b>Date:</b> {open.date || "—"}</div>
                                </div>
                                {open.attachments?.length > 0 && (
                                  <div style={{ fontSize: 12, marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ color: c.muted }}>Attachments:</span>
                                    {open.attachments.map((a: any, i: number) => a.downloadable ? (
                                      <button key={i} onClick={() => downloadAttachment(a.id, a.filename)}
                                        style={{ ...s.ghost, fontSize: 12, padding: "2px 8px" }} title={`${a.content_type} · ${a.size ?? "?"} bytes`}>📎 {a.filename} ⬇</button>
                                    ) : (
                                      <span key={i} style={{ background: c.panel, border: `1px solid ${c.border2}`, borderRadius: 6, padding: "2px 8px", color: c.faint }} title="stored before download support — re-fetch to enable">📎 {a.filename}</span>
                                    ))}
                                  </div>
                                )}
                                <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", fontSize: 13, background: c.panel, padding: 12, borderRadius: 8, maxHeight: 360, overflowY: "auto", overflowX: "hidden", margin: 0, maxWidth: "100%" }}>{open.body}</pre>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {pageRows.length === 0 && <tr><td style={s.td} colSpan={7}>No matching messages.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── DATABASE ───────────────────────────────────────────────────────────────────
function DatabaseTab({ c, refreshTick }: { c: C; refreshTick: number }) {
  const s = S(c);
  const [tables, setTables] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  async function loadTables() { try { setTables(await adminApi("/api/admin/db/tables")); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { loadTables(); if (sel) loadRows(sel, page); }, [refreshTick]);

  async function loadRows(t: string, p: number) {
    setErr(null);
    try { setData(await adminApi(`/api/admin/db/tables/${t}?page=${p}&page_size=50`)); setSel(t); setPage(p); }
    catch (e: any) { setErr(e.message); }
  }
  async function delRow(row: any) {
    if (!data?.primary_key?.length || !confirm("Delete this row?")) return;
    const values: any = {}; data.primary_key.forEach((k: string) => (values[k] = row[k]));
    try { await adminApi(`/api/admin/db/tables/${sel}`, { method: "DELETE", body: JSON.stringify({ values }) }); loadRows(sel!, page); } catch (e: any) { setErr(e.message); }
  }
  async function editRow(row: any) {
    if (!data?.primary_key?.length) { alert("Table has no primary key — cannot edit."); return; }
    const col = prompt("Column to edit:"); if (!col) return;
    const val = prompt(`New value for "${col}":`, String(row[col] ?? "")); if (val === null) return;
    const values: any = { [col]: val }; data.primary_key.forEach((k: string) => (values[k] = row[k]));
    try { await adminApi(`/api/admin/db/tables/${sel}`, { method: "PATCH", body: JSON.stringify({ values }) }); loadRows(sel!, page); } catch (e: any) { setErr(e.message); }
  }

  return (
    <div>
      {err && <div style={s.err}>{err}</div>}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ ...s.card, minWidth: 200, maxHeight: "70vh", overflowY: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Tables</h3>
          {tables.map((t) => (
            <div key={t.name} onClick={() => loadRows(t.name, 1)} style={{ padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: sel === t.name ? c.accent : "transparent", color: sel === t.name ? "#fff" : c.text, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
              <span>{t.name}</span><span style={{ color: sel === t.name ? "#dbeafe" : c.faint }}>{t.rows}</span>
            </div>
          ))}
        </div>
        <div style={{ ...s.card, flex: 1, overflowX: "auto" }}>
          {!data ? <div style={{ color: c.faint }}>Select a table.</div> : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ marginTop: 0 }}>{data.table} <span style={{ color: c.faint, fontWeight: 400 }}>({data.total} rows, pk={JSON.stringify(data.primary_key)})</span></h3>
                <div>
                  <button style={s.ghost} disabled={page <= 1} onClick={() => loadRows(sel!, page - 1)}>‹ prev</button>
                  <span style={{ margin: "0 8px", fontSize: 13 }}>page {data.page}</span>
                  <button style={s.ghost} disabled={page * data.page_size >= data.total} onClick={() => loadRows(sel!, page + 1)}>next ›</button>
                </div>
              </div>
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr>{data.columns.map((col: any) => <th key={col.name} style={s.th}>{col.name}</th>)}<th style={s.th}>actions</th></tr></thead>
                <tbody>
                  {data.rows.map((r: any, i: number) => (
                    <tr key={i}>
                      {data.columns.map((col: any) => <td key={col.name} style={{ ...s.td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r[col.name] ?? "")}</td>)}
                      <td style={s.td}><button style={s.ghost} onClick={() => editRow(r)}>edit</button>{" "}<button style={{ ...s.ghost, color: c.danger }} onClick={() => delRow(r)}>del</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KNOWLEDGE BASE ───────────────────────────────────────────────────────────
async function adminUpload(path: string, form: FormData): Promise<any> {
  // Multipart: do NOT set Content-Type (the browser adds the boundary).
  const res = await fetch(path, { method: "POST", body: form, headers: { Authorization: `Bearer ${adminToken() ?? ""}` } });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error((data && data.detail) || `Request failed (${res.status})`);
  return data;
}

const KB_SECTIONS: Array<{ id: string; title: string; hint: string }> = [
  { id: "workflow", title: "Workflow", hint: "CREA3 process & how-to docs (RAG source for platform questions)." },
  { id: "past_cases", title: "Past Legal Dispute Cases", hint: "Precedents / resolved-case write-ups (masked at query time)." },
  { id: "legal_statutes", title: "Legal Statutes", hint: "Country law & statutes the assistant can cite." },
];
const KB_ACCEPT = ".pdf,.docx,.txt,.md,.json,.odt,.csv,text/*,application/pdf,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text";

function KnowledgeBaseTab({ c, refreshTick }: { c: C; refreshTick: number }) {
  const s = S(c);
  const [status, setStatus] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function loadStatus() {
    try { setStatus(await adminApi("/api/admin/kb/status")); setErr(null); }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { loadStatus(); /* eslint-disable-next-line */ }, [refreshTick]);

  return (
    <div>
      {err && <div style={s.err}>{err}</div>}
      {note && <div style={{ ...s.err, color: c.ok, borderColor: c.ok }}>{note}</div>}
      <div style={{ ...s.card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: c.muted }}>
          Upload documents the chatbot can ground its answers on. Semantic (FAISS) indexing is{" "}
          <strong style={{ color: status?.embeddings_available ? c.ok : c.danger }}>
            {status?.embeddings_available ? "available (OpenRouter embeddings)" : "unavailable — using BM25 keyword search"}
          </strong>.
        </div>
        <button style={s.ghost} onClick={loadStatus}>⟳ Refresh status</button>
      </div>
      {KB_SECTIONS.map((sec) => (
        <KbSection key={sec.id} c={c} sec={sec} stat={status?.sections?.[sec.id]} onChanged={loadStatus} setNote={setNote} setErr={setErr} />
      ))}
    </div>
  );
}

function KbSection({ c, sec, stat, onChanged, setNote, setErr }:
  { c: C; sec: { id: string; title: string; hint: string }; stat: any; onChanged: () => void; setNote: (v: string | null) => void; setErr: (v: string | null) => void }) {
  const s = S(c);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [cfg, setCfg] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [d, cf] = await Promise.all([
        adminApi(`/api/admin/kb/documents?section=${sec.id}`),
        adminApi(`/api/admin/kb/config?section=${sec.id}`),
      ]);
      setDocs(d); setCfg(cf);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sec.id, stat?.documents]);

  async function onUpload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const form = new FormData();
      form.append("section", sec.id);
      Array.from(files).forEach((f) => form.append("files", f));
      const r = await adminUpload("/api/admin/kb/upload", form);
      setNote(`Uploaded ${r.uploaded} document(s) to ${sec.title}.`);
      if (fileRef.current) fileRef.current.value = "";
      await load(); onChanged();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveCfg(next: Partial<{ engine: string; preset: string; params: any }>) {
    if (!cfg) return;
    setBusy(true); setErr(null);
    try {
      const body = { section: sec.id, engine: next.engine ?? cfg.engine, preset: next.preset ?? cfg.preset, params: next.params ?? cfg.params };
      const r = await adminApi("/api/admin/kb/config", { method: "POST", body: JSON.stringify(body) });
      setCfg({ ...cfg, ...r });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function reindex() {
    setBusy(true); setErr(null); setNote(null);
    try { const r = await adminApi(`/api/admin/kb/reindex?section=${sec.id}`, { method: "POST" }); setNote(`Reindexed ${sec.title}: ${r.chunks_embedded} chunk(s) embedded.`); await load(); onChanged(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function del(id: number) {
    if (!confirm("Delete this document from the knowledge base?")) return;
    setBusy(true); setErr(null);
    try { await adminApi(`/api/admin/kb/documents/${id}`, { method: "DELETE" }); await load(); onChanged(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const params = cfg?.params ?? {};
  const setParam = (k: string, v: number) => saveCfg({ params: { ...params, [k]: v } });

  return (
    <div style={s.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{sec.title}</div>
          <div style={{ fontSize: 12, color: c.faint, marginTop: 2 }}>{sec.hint}</div>
        </div>
        <div style={{ fontSize: 12, color: c.muted }}>
          {stat ? `${stat.documents} docs · ${stat.chunks} chunks · ${stat.indexed ? "indexed" : "not indexed"}` : "—"}
        </div>
      </div>

      {/* Controls: engine / preset / params */}
      {cfg && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>
          <label style={{ fontSize: 12, color: c.muted }}>Engine</label>
          <select style={s.input} value={cfg.engine} onChange={(e) => saveCfg({ engine: e.target.value })}>
            {(cfg.engines || ["faiss", "bm25", "hybrid"]).map((en: string) => <option key={en} value={en}>{en.toUpperCase()}</option>)}
          </select>
          <label style={{ fontSize: 12, color: c.muted }}>Preset</label>
          <select style={s.input} value={cfg.preset} onChange={(e) => saveCfg({ preset: e.target.value, params: undefined })}>
            {["optimal", "balanced", "creative", "custom"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
          <NumField c={c} label="top_k" value={params.top_k} onSet={(v) => setParam("top_k", v)} step={1} />
          <NumField c={c} label="min_score" value={params.min_score} onSet={(v) => setParam("min_score", v)} step={0.05} />
          <NumField c={c} label="temp" value={params.temperature} onSet={(v) => setParam("temperature", v)} step={0.05} />
          <NumField c={c} label="chunk" value={params.chunk_size} onSet={(v) => setParam("chunk_size", v)} step={100} />
          <NumField c={c} label="overlap" value={params.chunk_overlap} onSet={(v) => setParam("chunk_overlap", v)} step={25} />
          <button style={s.ghost} disabled={busy} onClick={reindex}>Reindex</button>
        </div>
      )}

      {/* Upload */}
      <div style={{ marginTop: 12 }}>
        <input ref={fileRef} type="file" multiple accept={KB_ACCEPT} onChange={(e) => onUpload(e.target.files)} style={{ fontSize: 13, color: c.text }} />
        {busy && <span style={{ marginLeft: 8, fontSize: 12, color: c.muted }}>working…</span>}
      </div>

      {/* Documents */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
          <thead><tr>
            <th style={s.th}>File</th><th style={s.th}>Type</th><th style={s.th}>Size</th><th style={s.th}>Chunks</th><th style={s.th}>Indexed</th><th style={s.th}></th>
          </tr></thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td style={{ ...s.td, color: c.faint }} colSpan={6}>No documents yet.</td></tr>
            ) : docs.map((d) => (
              <tr key={d.id}>
                <td style={s.td}>{d.filename}{d.seeded ? <span style={{ color: c.faint }}> (seeded)</span> : null}</td>
                <td style={s.td}>{(d.content_type || "").split("/").pop()}</td>
                <td style={s.td}>{(d.size / 1024).toFixed(1)} KB</td>
                <td style={s.td}>{d.chunk_count}</td>
                <td style={{ ...s.td, color: d.indexed ? c.ok : c.faint }}>{d.indexed ? "✓" : "—"}</td>
                <td style={s.td}><button style={{ ...s.ghost, color: c.danger }} onClick={() => del(d.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NumField({ c, label, value, onSet, step }: { c: C; label: string; value: any; onSet: (v: number) => void; step: number }) {
  const s = S(c);
  const [v, setV] = useState<string>(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <label style={{ fontSize: 12, color: c.muted }}>{label}</label>
      <input
        style={{ ...s.input, width: 72 }} type="number" step={step} value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = Number(v); if (!Number.isNaN(n) && n !== Number(value)) onSet(n); }}
      />
    </span>
  );
}


// ── CONSENT (GDPR Art. 7(1) evidence log) ─────────────────────────────────────
function ConsentTab({ c, refreshTick }: { c: C; refreshTick: number }) {
  const s = S(c);
  const [data, setData] = useState<any>({ summary: null, rows: [] });
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load() {
    setErr(null);
    try { setData(await adminApi(`/api/admin/consent?limit=1000`)); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [refreshTick]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const all = data.rows || [];
    return ql ? all.filter((r: any) => [r.visitor_id, r.user_email, r.action].some((v: any) => String(v ?? "").toLowerCase().includes(ql))) : all;
  }, [data, q]);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const sum = data.summary;
  const yn = (v: boolean) => (v ? "✓" : "—");

  return (
    <div>
      {err && <div style={s.err}>{err}</div>}
      {sum ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
          {[
            ["Consent records", sum.records],
            ["Subjects", sum.subjects],
            ["Analytics accepted", `${sum.accepted_analytics} (${sum.analytics_rate}%)`],
            ["Preferences accepted", sum.accepted_preferences],
            ["Communication accepted", sum.accepted_marketing],
            ["Rejected optional", sum.rejected_all],
          ].map(([label, val]: any, i) => (
            <div key={i} style={{ ...s.card, marginBottom: 0, borderLeft: `4px solid ${c.accent}` }}>
              <div style={{ color: c.muted, fontSize: 12 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={s.card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Cookie consent log</h3>
          <span style={{ color: c.faint, fontSize: 12 }}>Append-only evidence of consent (GDPR Art. 7(1)) — never edited or deleted.</span>
          <input style={{ ...s.input, minWidth: 200, marginLeft: "auto" }} placeholder="search visitor / user / action…" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                {["When (UTC)", "Subject", "Action", "Necessary", "Preferences", "Analytics", "Communication", "Policy", "IP"].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r: any) => (
                <tr key={r.id}>
                  <td style={s.td}>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                  <td style={s.td}>{r.user_email || <span style={{ color: c.faint }}>anon {String(r.visitor_id || "").slice(0, 12)}…</span>}</td>
                  <td style={s.td}>{r.action}</td>
                  <td style={s.td}>✓</td>
                  <td style={s.td}>{yn(r.preferences)}</td>
                  <td style={s.td}>{yn(r.analytics)}</td>
                  <td style={s.td}>{yn(r.marketing)}</td>
                  <td style={s.td}>{r.policy_version}</td>
                  <td style={s.td}>{r.ip || "—"}</td>
                </tr>
              ))}
              {pageRows.length === 0 && <tr><td style={s.td} colSpan={9}>No consent records yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10 }}>
          <Pager c={c} page={page} pageSize={pageSize} total={rows.length} setPage={setPage} setPageSize={setPageSize} />
        </div>
      </div>
    </div>
  );
}


// ── Themes tab ──────────────────────────────────────────────────────────────
// Every look users published from the side dock ("Share preset"), with its
// settings laid out for review; one can be made the platform-wide default, and
// a master switch decides whether visitors may customise at all (this
// overrides UI_CUSTOMIZATION / VITE_UI_CUSTOMIZATION from the .env files).
function ThemesTab({ c, refreshTick }: { c: C; refreshTick: number }) {
  const s = S(c);
  const [data, setData] = useState<any>({ presets: [], global_preset: null, customization_enabled: true, customization_source: "env" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openName, setOpenName] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try { setData(await adminApi("/api/admin/themes")); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [refreshTick]);

  async function run(path: string, body: any, method = "POST") {
    setBusy(true); setErr(null);
    try { await adminApi(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  const setGlobal = (name: string | null) => run("/api/admin/themes/global", { name });
  const setCustomization = (enabled: boolean | null) => run("/api/admin/themes/customization", { enabled });
  const del = (name: string) => { if (confirm(`Delete preset "${name}" for everyone?`)) run(`/api/admin/themes/${encodeURIComponent(name)}`, undefined, "DELETE"); };

  const enabled = data.customization_enabled !== false;
  const swatch = (hex: string) => hex ? <span title={hex} style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: hex, border: `1px solid ${c.border2}`, verticalAlign: "middle", marginRight: 4 }} /> : <span style={{ color: c.faint }}>palette</span>;
  const pct = (v: any) => (v === undefined || v === null || v === "" ? "—" : `${v}%`);

  // Human-readable summary of a preset payload (the UiCustom + anim JSON).
  function rows(p: any): Array<[string, React.ReactNode]> {
    const a = p.anim || {};
    return [
      ["Font", p.font || "default"],
      ["Page background", p.bgImage ? `image (${p.bgImageMode || "cover"})` : (p.background || "default")],
      ["Page colour", p.pageColor ? <>{swatch(p.pageColor)}{p.pageColor}</> : "palette"],
      ["Card", <>{p.cardStyle || "glass"} · {p.cardBackground || "page"} · opacity {pct(p.surfaceOpacity)} {p.cardColor ? <>· {swatch(p.cardColor)}{p.cardColor}</> : null}</>],
      ["Header bar", <>{p.headerBackground || "page"} · opacity {pct(p.headerOpacity)} {p.headerColor ? <>· {swatch(p.headerColor)}{p.headerColor}</> : null}</>],
      ["Side navigation", <>{p.navBackground || "page"} · opacity {pct(p.navOpacity)} {p.navColor ? <>· {swatch(p.navColor)}{p.navColor}</> : null}</>],
      ["Animations", Object.keys(a).length
        ? `${a.enabled === false ? "off" : "on"}${a.duration != null ? ` · ${a.duration} ms` : ""}${a.stagger != null ? ` · stagger ${a.stagger} ms` : ""}${a.distance != null ? ` · ${a.distance} px` : ""}${a.targets ? ` · ${Object.keys(a.targets).length} per-target overrides` : ""}`
        : "defaults"],
    ];
  }

  return (
    <div>
      {err && <div style={s.err}>{err}</div>}

      {/* Master switch */}
      <div style={{ ...s.card, borderLeft: `4px solid ${enabled ? c.accent : "#dc2626"}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ margin: 0 }}>Visitor customisation — master switch</h3>
            <div style={{ color: c.muted, fontSize: 13, marginTop: 4 }}>
              {enabled
                ? "ON — the side dock (globe icon) shows the full theme editor: font, backgrounds, colours, card style, animations, save/share presets."
                : "OFF — the side dock shows only language, light/dark and the presets published here; the editor is hidden for everyone."}
              <span style={{ color: c.faint }}> Source: {data.customization_source === "admin" ? "set here (overrides .env)" : "UI_CUSTOMIZATION in .env"}.</span>
            </div>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: busy ? "wait" : "pointer", userSelect: "none" }}>
            <span style={{ fontSize: 13, color: c.muted }}>{enabled ? "Enabled" : "Disabled"}</span>
            <span onClick={() => !busy && setCustomization(!enabled)} role="switch" aria-checked={enabled}
              style={{ width: 52, height: 28, borderRadius: 14, background: enabled ? c.accent : c.border2, position: "relative", transition: "background .2s" }}>
              <span style={{ position: "absolute", top: 3, left: enabled ? 27 : 3, width: 22, height: 22, borderRadius: 11, background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.4)" }} />
            </span>
          </label>
          {data.customization_source === "admin" ? (
            <button style={s.ghost} disabled={busy} onClick={() => setCustomization(null)} title="Forget the admin override and follow the .env default again">Revert to .env</button>
          ) : null}
        </div>
      </div>

      {/* Global theme */}
      <div style={s.card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Global theme</h3>
          <span style={{ color: c.faint, fontSize: 12 }}>
            The preset every visitor starts from. Setting it pushes the look to everyone once (they can still personalise if the switch above is on).
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>Current: <b>{data.global_preset || "— platform default —"}</b></span>
            {data.global_preset ? <button style={s.ghost} disabled={busy} onClick={() => setGlobal(null)}>Clear</button> : null}
          </div>
        </div>
      </div>

      {/* Presets */}
      <div style={s.card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Published presets ({(data.presets || []).length})</h3>
          <span style={{ color: c.faint, fontSize: 12 }}>Everything users saved with "Share preset" in the side dock. Click a row to see its settings.</span>
        </div>
        {!(data.presets || []).length ? <div style={{ color: c.muted }}>No presets published yet.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={s.th}>Name</th><th style={s.th}>Author</th><th style={s.th}>Font</th><th style={s.th}>Background</th>
                  <th style={s.th}>Card</th><th style={s.th}>Animations</th><th style={s.th}>Updated</th><th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {(data.presets || []).map((p: any) => {
                  const pl = p.payload || {}; const isGlobal = data.global_preset === p.name; const open = openName === p.name;
                  return (
                    <Fragment key={p.name}>
                      <tr onClick={() => setOpenName(open ? null : p.name)} style={{ cursor: "pointer", background: isGlobal ? `${c.accent}22` : undefined }}>
                        <td style={s.td}><b>{p.name}</b>{isGlobal ? <span style={{ marginLeft: 8, fontSize: 11, color: c.accent, border: `1px solid ${c.accent}`, borderRadius: 6, padding: "1px 6px" }}>GLOBAL</span> : null}</td>
                        <td style={s.td}>{p.author || "—"}</td>
                        <td style={s.td}>{pl.font || "default"}</td>
                        <td style={s.td}>{pl.bgImage ? "image" : (pl.background || "default")}{pl.pageColor ? <> {swatch(pl.pageColor)}</> : null}</td>
                        <td style={s.td}>{pl.cardStyle || "glass"} · {pct(pl.surfaceOpacity)}</td>
                        <td style={s.td}>{pl.anim ? (pl.anim.enabled === false ? "off" : "on") : "defaults"}</td>
                        <td style={s.td}>{p.updated_at ? new Date(p.updated_at).toLocaleString() : "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                          {isGlobal
                            ? <button style={s.ghost} disabled={busy} onClick={() => setGlobal(null)}>Unset global</button>
                            : <button style={s.btn} disabled={busy} onClick={() => setGlobal(p.name)}>Set as global</button>}
                          <button style={{ ...s.ghost, marginLeft: 6, color: "#dc2626" }} disabled={busy} onClick={() => del(p.name)}>Delete</button>
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td style={{ ...s.td, background: c.panel }} colSpan={8}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "6px 24px", padding: "6px 4px" }}>
                              {rows(pl).map(([k, v], i) => (
                                <div key={i} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                                  <span style={{ color: c.muted, minWidth: 130 }}>{k}</span><span>{v}</span>
                                </div>
                              ))}
                              {pl.bgImage ? (
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <img alt="" src={String(pl.bgImage).startsWith("data:") ? pl.bgImage : pl.bgImage} style={{ maxHeight: 90, borderRadius: 6, border: `1px solid ${c.border2}` }} />
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
