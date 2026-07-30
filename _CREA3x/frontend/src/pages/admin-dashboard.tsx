import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  const [tab, setTab] = useState<"users" | "mail" | "database">("users");
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
          {(["users", "mail", "database"] as const).map((tt) => (
            <button key={tt} onClick={() => setTab(tt)} style={tb(tab === tt)}>{tt[0].toUpperCase() + tt.slice(1)}</button>
          ))}
          <button onClick={() => setRefreshTick((n) => n + 1)} title="Refresh current tab" style={{ ...tb(false), background: c.accent, color: "#fff", borderColor: c.accent }}>⟳ Refresh</button>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme" style={tb(false)}>{theme === "dark" ? "☀ Light" : "🌙 Dark"}</button>
          <button onClick={logout} style={{ ...tb(false), color: c.danger }}>Sign out</button>
        </div>
      </header>
      <main style={{ padding: 22 }}>
        {tab === "users" && <UsersTab c={c} refreshTick={refreshTick} />}
        {tab === "mail" && <MailTab c={c} refreshTick={refreshTick} />}
        {tab === "database" && <DatabaseTab c={c} refreshTick={refreshTick} />}
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
            <option value="agent">agent</option><option value="mediator">mediator</option><option value="admin">admin</option>
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
                      <option value="agent">agent</option><option value="mediator">mediator</option><option value="admin">admin</option><option value="user">user</option>
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
function MailTab({ c, refreshTick }: { c: C; refreshTick: number }) {
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

  async function loadCfg() { try { setCfg(await adminApi("/api/admin/mail/config")); } catch (e: any) { setErr(e.message); } }
  async function loadDb() {
    setErr(null);
    try {
      const r = await adminApi(`/api/admin/mail/messages?filter=${listFilter}&mailbox=${encodeURIComponent(listMailbox)}`);
      setAll(r.messages || []); setPage(1); setOpen(null); setSelId(null);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { loadCfg(); }, []);
  useEffect(() => { loadDb(); }, [filter, box, cfg?.sent_mailbox, cfg?.junk_mailbox]);
  useEffect(() => { if (refreshTick) loadDb(); }, [refreshTick]);

  // 'Fetch Mail' = sync IMAP -> DB (once), then load from the DB cache.
  async function fetchMail() {
    setErr(null); setNote(null); setBusy(true);
    try {
      const ds = box === "junk" ? "&default_status=junk" : "";
      const r = await adminApi(`/api/admin/mail/sync?limit=${fetchN}&mailbox=${encodeURIComponent(serverMailbox)}${ds}`, { method: "POST" });
      setNote(`Synced ${box} — ${r.new} new, ${r.updated} updated, ${r.removed} removed.`);
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
      const r = await adminApi("/api/admin/mail/send", { method: "POST", body: JSON.stringify({ ...send, attachments: atts }) });
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
