import { useEffect, useState } from "react";
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken() ?? ""}`,
      ...(init.headers || {}),
    },
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error((data && data.detail) || `Request failed (${res.status})`);
  return data;
}

type Tab = "users" | "mail" | "database";

export default function AdminDashboardPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("users");

  function logout() {
    localStorage.removeItem("admin_token");
    nav("/admin");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b1120", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid #1e293b" }}>
        <strong style={{ fontSize: 18 }}>CREA3 — Admin console</strong>
        <div style={{ display: "flex", gap: 8 }}>
          {(["users", "mail", "database"] as Tab[]).map((tt) => (
            <button key={tt} onClick={() => setTab(tt)} style={{ ...tabBtn, ...(tab === tt ? tabBtnActive : {}) }}>
              {tt[0].toUpperCase() + tt.slice(1)}
            </button>
          ))}
          <button onClick={logout} style={{ ...tabBtn, color: "#fca5a5" }}>Sign out</button>
        </div>
      </header>
      <main style={{ padding: 22 }}>
        {tab === "users" && <UsersTab />}
        {tab === "mail" && <MailTab />}
        {tab === "database" && <DatabaseTab />}
      </main>
    </div>
  );
}

// ── shared styles ──────────────────────────────────────────────────────────────
const tabBtn: React.CSSProperties = { background: "#1e293b", color: "#cbd5e1", border: "1px solid #334155", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 14 };
const tabBtnActive: React.CSSProperties = { background: "#2563eb", color: "#fff", borderColor: "#2563eb" };
const card: React.CSSProperties = { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 16, marginBottom: 16 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #334155", color: "#94a3b8", fontWeight: 600, fontSize: 13 };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #1f2937", fontSize: 13, verticalAlign: "top" };
const input: React.CSSProperties = { background: "#0b1120", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, padding: "6px 8px", fontSize: 13 };
const btn: React.CSSProperties = { background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { background: "transparent", color: "#cbd5e1", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 };
const errBox: React.CSSProperties = { background: "#450a0a", color: "#fecaca", border: "1px solid #7f1d1d", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 };

// ── USERS ──────────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [nu, setNu] = useState({ email: "", username: "", password: "", role: "agent" });

  async function load() {
    setErr(null);
    try {
      setUsers(await adminApi("/api/admin/users"));
      setActivity(await adminApi("/api/admin/activity?limit=50"));
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function patch(id: number, body: any) {
    try { await adminApi(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }); load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function del(id: number) {
    if (!confirm("Delete this user?")) return;
    try { await adminApi(`/api/admin/users/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function create() {
    try { await adminApi("/api/admin/users", { method: "POST", body: JSON.stringify(nu) }); setNu({ email: "", username: "", password: "", role: "agent" }); load(); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div>
      {err && <div style={errBox}>{err}</div>}
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Create user</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={input} placeholder="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
          <input style={input} placeholder="username" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
          <input style={input} placeholder="password (min 8)" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          <select style={input} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
            <option value="agent">agent</option><option value="mediator">mediator</option><option value="admin">admin</option>
          </select>
          <button style={btn} onClick={create}>Create</button>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Users ({users.length})</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["ID", "Email", "Username", "Role", "Verified", "Last login", "Actions"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={td}>{u.id}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>{u.username}</td>
                  <td style={td}>
                    <select style={input} value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })}>
                      <option value="agent">agent</option><option value="mediator">mediator</option><option value="admin">admin</option><option value="user">user</option>
                    </select>
                  </td>
                  <td style={td}>{u.email_verified ? "✓" : <button style={btnGhost} onClick={() => patch(u.id, { email_verified: true })}>verify</button>}</td>
                  <td style={td}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}</td>
                  <td style={td}><button style={{ ...btnGhost, color: "#fca5a5" }} onClick={() => del(u.id)}>delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Recent activity</h3>
        <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["When", "Event", "Email", "IP"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.id}>
                  <td style={td}>{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</td>
                  <td style={td}>{a.event}</td><td style={td}>{a.email}</td><td style={td}>{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── MAIL ─────────────────────────────────────────────────────────────────────
function MailTab() {
  const [cfg, setCfg] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [send, setSend] = useState({ to: "", subject: "", body: "" });
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      setCfg(await adminApi("/api/admin/mail/config"));
      const r = await adminApi("/api/admin/mail/received?limit=30");
      setMsgs(r.messages || []);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function view(id: string) {
    try { setOpen(await adminApi(`/api/admin/mail/received/${id}`)); }
    catch (e: any) { setErr(e.message); }
  }
  async function doSend() {
    setSendMsg(null); setErr(null);
    try { await adminApi("/api/admin/mail/send", { method: "POST", body: JSON.stringify(send) }); setSendMsg("Sent ✓"); setSend({ to: "", subject: "", body: "" }); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div>
      {err && <div style={errBox}>{err}</div>}
      {cfg && <div style={{ ...card, fontSize: 13, color: "#94a3b8" }}>
        SMTP: <b style={{ color: "#e2e8f0" }}>{cfg.smtp_user}</b> @ {cfg.smtp_host} · IMAP {cfg.imap_available ? "connected" : "unavailable"}
      </div>}

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Send email</h3>
        {sendMsg && <div style={{ color: "#86efac", marginBottom: 8 }}>{sendMsg}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={input} placeholder="to@example.com" value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })} />
          <input style={input} placeholder="subject" value={send.subject} onChange={(e) => setSend({ ...send, subject: e.target.value })} />
          <textarea style={{ ...input, minHeight: 90 }} placeholder="message" value={send.body} onChange={(e) => setSend({ ...send, body: e.target.value })} />
          <div><button style={btn} onClick={doSend}>Send</button></div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Inbox ({msgs.length})</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["From", "Subject", "Date", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {msgs.map((m) => (
                <tr key={m.id}>
                  <td style={td}>{m.from}</td><td style={td}>{m.subject}</td><td style={td}>{m.date}</td>
                  <td style={td}><button style={btnGhost} onClick={() => view(m.id)}>open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ marginTop: 0 }}>{open.subject}</h3>
          <button style={btnGhost} onClick={() => setOpen(null)}>close</button>
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>From {open.from} · {open.date}</div>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "#0b1120", padding: 12, borderRadius: 8, maxHeight: 360, overflow: "auto" }}>{open.body}</pre>
      </div>}
    </div>
  );
}

// ── DATABASE ───────────────────────────────────────────────────────────────────
function DatabaseTab() {
  const [tables, setTables] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  async function loadTables() {
    try { setTables(await adminApi("/api/admin/db/tables")); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { loadTables(); }, []);

  async function loadRows(t: string, p: number) {
    setErr(null);
    try { setData(await adminApi(`/api/admin/db/tables/${t}?page=${p}&page_size=50`)); setSel(t); setPage(p); }
    catch (e: any) { setErr(e.message); }
  }

  async function delRow(row: any) {
    if (!data?.primary_key?.length || !confirm("Delete this row?")) return;
    const values: any = {}; data.primary_key.forEach((k: string) => (values[k] = row[k]));
    try { await adminApi(`/api/admin/db/tables/${sel}`, { method: "DELETE", body: JSON.stringify({ values }) }); loadRows(sel!, page); }
    catch (e: any) { setErr(e.message); }
  }

  async function editRow(row: any) {
    if (!data?.primary_key?.length) { alert("Table has no primary key — cannot edit."); return; }
    const col = prompt("Column to edit:"); if (!col) return;
    const val = prompt(`New value for "${col}":`, String(row[col] ?? "")); if (val === null) return;
    const values: any = { [col]: val }; data.primary_key.forEach((k: string) => (values[k] = row[k]));
    try { await adminApi(`/api/admin/db/tables/${sel}`, { method: "PATCH", body: JSON.stringify({ values }) }); loadRows(sel!, page); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <div>
      {err && <div style={errBox}>{err}</div>}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ ...card, minWidth: 200, maxHeight: "70vh", overflowY: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Tables</h3>
          {tables.map((t) => (
            <div key={t.name} onClick={() => loadRows(t.name, 1)}
              style={{ padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: sel === t.name ? "#2563eb" : "transparent", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
              <span>{t.name}</span><span style={{ color: "#64748b" }}>{t.rows}</span>
            </div>
          ))}
        </div>

        <div style={{ ...card, flex: 1, overflowX: "auto" }}>
          {!data ? <div style={{ color: "#64748b" }}>Select a table.</div> : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ marginTop: 0 }}>{data.table} <span style={{ color: "#64748b", fontWeight: 400 }}>({data.total} rows, pk={JSON.stringify(data.primary_key)})</span></h3>
                <div>
                  <button style={btnGhost} disabled={page <= 1} onClick={() => loadRows(sel!, page - 1)}>‹ prev</button>
                  <span style={{ margin: "0 8px", fontSize: 13 }}>page {data.page}</span>
                  <button style={btnGhost} disabled={page * data.page_size >= data.total} onClick={() => loadRows(sel!, page + 1)}>next ›</button>
                </div>
              </div>
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr>{data.columns.map((c: any) => <th key={c.name} style={th}>{c.name}</th>)}<th style={th}>actions</th></tr></thead>
                <tbody>
                  {data.rows.map((r: any, i: number) => (
                    <tr key={i}>
                      {data.columns.map((c: any) => <td key={c.name} style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r[c.name] ?? "")}</td>)}
                      <td style={td}>
                        <button style={btnGhost} onClick={() => editRow(r)}>edit</button>{" "}
                        <button style={{ ...btnGhost, color: "#fca5a5" }} onClick={() => delRow(r)}>del</button>
                      </td>
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
