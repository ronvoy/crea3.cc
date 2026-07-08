from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/admin", tags=["admin-ui"])


@router.get("/login", response_class=HTMLResponse)
def admin_login_page(request: Request) -> HTMLResponse:
    # Simple HTML (no external build tooling). Uses /api/admin/login to obtain a token.
    html = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CREA Admin Login</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;background:#0b1220;color:#e8eefc;display:flex;align-items:center;justify-content:center;height:100vh}
    .card{width:min(420px,92vw);background:#111b33;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:22px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    h1{font-size:18px;margin:0 0 12px}
    p{opacity:.85;margin:0 0 16px;font-size:13px;line-height:1.4}
    label{display:block;font-size:12px;opacity:.85;margin:10px 0 6px}
    input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0b1220;color:#e8eefc;outline:none}
    button{margin-top:14px;width:100%;padding:10px 12px;border-radius:10px;border:0;background:#3b82f6;color:white;font-weight:600;cursor:pointer}
    button:disabled{opacity:.6;cursor:not-allowed}
    .err{margin-top:12px;color:#ffb4b4;font-size:13px;display:none}
    .hint{margin-top:12px;font-size:12px;opacity:.7}
    code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:8px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Admin Login</h1>
    <p>Mock admin login (for development). Enter the admin credentials configured in <code>app/core/config.py</code>.</p>
    <form id="f">
      <label>Email</label>
      <input id="email" type="email" autocomplete="username" placeholder="admin@example.com" required />
      <label>Password</label>
      <input id="password" type="password" autocomplete="current-password" placeholder="admin123" required />
      <button id="btn" type="submit">Sign in</button>
      <div class="err" id="err"></div>
      <div class="hint">After login you’ll be redirected to <code>/admin</code>.</div>
    </form>
  </div>

<script>
const f = document.getElementById('f');
const btn = document.getElementById('btn');
const err = document.getElementById('err');

function showErr(msg){
  err.textContent = msg;
  err.style.display = 'block';
}

f.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.style.display = 'none';
  btn.disabled = true;
  try{
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/api/admin/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email, password})
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){
      showErr(data?.detail || 'Login failed');
      return;
    }
    localStorage.setItem('crea_admin_token', data.access_token);
    window.location.href = '/admin';
  } catch(ex){
    showErr(String(ex));
  } finally {
    btn.disabled = false;
  }
});
</script>
</body>
</html>
"""
    return HTMLResponse(html)


@router.get("", response_class=HTMLResponse)
def admin_dashboard_page(request: Request) -> HTMLResponse:
    html = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CREA Admin Control Room</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;background:#0b1220;color:#e8eefc}
    header{padding:18px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;gap:10px;align-items:center;justify-content:space-between}
    h1{font-size:16px;margin:0}
    main{padding:16px;max-width:1100px;margin:0 auto}
    .row{display:flex;gap:12px;flex-wrap:wrap}
    .card{flex:1 1 340px;background:#111b33;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
    .kpi{font-size:28px;font-weight:800;margin:8px 0}
    .muted{opacity:.7;font-size:12px}
    .btn{background:#3b82f6;border:0;color:white;font-weight:700;border-radius:10px;padding:8px 12px;cursor:pointer}
    .btn.secondary{background:rgba(255,255,255,.10);font-weight:600}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
    th,td{padding:8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}
    th{opacity:.8;font-weight:700}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.10)}
    .topbar{display:flex;gap:8px;align-items:center}
    input{padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0b1220;color:#e8eefc;outline:none;font-size:12px}
    .warn{color:#ffdf9e}
    .error{color:#ffb4b4}
  </style>
</head>
<body>
<header>
  <h1>Admin Control Room</h1>
  <div class="topbar">
    <input id="limit" type="number" min="10" max="500" value="100" />
    <button class="btn secondary" id="refresh">Refresh</button>
    <button class="btn" id="logout">Logout</button>
  </div>
</header>

<main>
  <div class="row">
    <div class="card">
      <div class="muted">Total tracked requests (latest window)</div>
      <div class="kpi" id="kpi_total">–</div>
      <div class="muted">Counts the number of AccessLog records returned by the API.</div>
    </div>
    <div class="card">
      <div class="muted">Unique IPs (latest window)</div>
      <div class="kpi" id="kpi_ips">–</div>
      <div class="muted">Approximate, based on the same window.</div>
    </div>
    <div class="card">
      <div class="muted">Errors (status ≥ 400)</div>
      <div class="kpi" id="kpi_err">–</div>
      <div class="muted">Useful for spotting failing endpoints quickly.</div>
    </div>
  </div>

  <div class="card" style="margin-top:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-weight:800">Access Logs</div>
        <div class="muted">Most recent requests recorded by the <span class="pill">AccessLogMiddleware</span>.</div>
      </div>
      <div class="muted" id="status"></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>When (UTC)</th>
          <th>Method</th>
          <th>Path</th>
          <th>Status</th>
          <th>IP</th>
          <th>User</th>
          <th>ms</th>
        </tr>
      </thead>
      <tbody id="tbody">
      </tbody>
    </table>
    <div class="muted" style="margin-top:10px">Tip: If you get <span class="warn">401</span>, open <a style="color:#93c5fd" href="/admin/login">/admin/login</a> to sign in.</div>
  </div>
</main>

<script>
function token(){ return localStorage.getItem('crea_admin_token'); }
function logout(){
  localStorage.removeItem('crea_admin_token');
  window.location.href = '/admin/login';
}
document.getElementById('logout').addEventListener('click', logout);
document.getElementById('refresh').addEventListener('click', load);

function esc(s){
  return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

async function load(){
  const st = document.getElementById('status');
  st.textContent = 'Loading…';
  const lim = Number(document.getElementById('limit').value || 100);
  try{
    const res = await fetch(`/api/admin/access-logs?limit=${encodeURIComponent(lim)}`, {
      headers: { 'Authorization': `Bearer ${token()}` }
    });
    if(res.status === 401){
      st.innerHTML = '<span class="warn">Unauthorized</span> — please login.';
      return;
    }
    const data = await res.json();
    const logs = data?.items || [];
    document.getElementById('kpi_total').textContent = logs.length;
    document.getElementById('kpi_ips').textContent = new Set(logs.map(x => x.ip)).size;
    document.getElementById('kpi_err').textContent = logs.filter(x => (x.status_code||0) >= 400).length;

    const tbody = document.getElementById('tbody');
    tbody.innerHTML = logs.map(x => {
      const when = x.created_at || x.timestamp || '';
      return `<tr>
        <td>${esc(when)}</td>
        <td><span class="pill">${esc(x.method)}</span></td>
        <td>${esc(x.path)}</td>
        <td>${esc(x.status_code)}</td>
        <td>${esc(x.ip)}</td>
        <td>${esc(x.user_email || '')}</td>
        <td>${esc(x.duration_ms)}</td>
      </tr>`;
    }).join('');
    st.textContent = `Loaded ${logs.length} entries.`;
  }catch(ex){
    st.innerHTML = `<span class="error">${esc(ex)}</span>`;
  }
}

(function init(){
  if(!token()){
    window.location.href = '/admin/login';
    return;
  }
  load();
})();
</script>
</body>
</html>
"""
    return HTMLResponse(html)
