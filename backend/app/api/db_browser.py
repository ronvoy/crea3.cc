"""
/dbms  –  Adminer-style database browser with CRUD + pagination.
Password is read from DBMS_PASS in .env. Dev-only.
DO NOT expose this endpoint on a public network.
"""
from __future__ import annotations

import hashlib
import hmac
from math import ceil
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import inspect as sa_inspect, text

from ..db import engine
from ..core.config import settings

router = APIRouter(tags=["db-browser"])

_COOKIE  = "dbms_auth"
_PAGE_SZ = 50


def _token() -> str:
    return hmac.new(b"dbms_browser_key", settings.dbms_pass.encode(), hashlib.sha256).hexdigest()


# ── auth ──────────────────────────────────────────────────────────────────────

def _auth_ok(token: str | None) -> bool:
    return bool(token) and hmac.compare_digest(token, _token())


# ── DB helpers ────────────────────────────────────────────────────────────────

def _tables() -> list[str]:
    return sorted(sa_inspect(engine).get_table_names())


def _columns(table: str) -> list[dict[str, Any]]:
    return sa_inspect(engine).get_columns(table)


def _pk_names(table: str) -> list[str]:
    return sa_inspect(engine).get_pk_constraint(table).get("constrained_columns", [])


def _count(table: str) -> int:
    with engine.connect() as conn:
        return conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar() or 0


def _get_page(table: str, page: int) -> tuple[list[str], list]:
    cols   = [c["name"] for c in _columns(table)]
    offset = max(0, (page - 1) * _PAGE_SZ)
    with engine.connect() as conn:
        rows = conn.execute(
            text(f'SELECT * FROM "{table}" LIMIT :lim OFFSET :off'),
            {"lim": _PAGE_SZ, "off": offset},
        ).fetchall()
    return cols, rows


def _get_row(table: str, pk_names: list[str], pk_vals: list[Any]) -> tuple[list[str], Any]:
    cols   = [c["name"] for c in _columns(table)]
    where  = " AND ".join(f'"{c}" = :pk{i}' for i, c in enumerate(pk_names))
    params = {f"pk{i}": v for i, v in enumerate(pk_vals)}
    with engine.connect() as conn:
        row = conn.execute(
            text(f'SELECT * FROM "{table}" WHERE {where}'), params
        ).fetchone()
    return cols, row


def _encode_pk(row: Any, pk_names: list[str], col_names: list[str]) -> str:
    idx = {name: i for i, name in enumerate(col_names)}
    return "|".join(str(row[idx[n]]) for n in pk_names if n in idx)


def _decode_pk(pk_str: str, table: str, pk_names: list[str]) -> list[Any]:
    parts   = pk_str.split("|", max(len(pk_names) - 1, 0))
    col_map = {c["name"]: c["type"] for c in _columns(table)}
    result: list[Any] = []
    for col, val in zip(pk_names, parts):
        t = col_map.get(col)
        try:
            if t is not None and hasattr(t, "python_type") and t.python_type == int:
                result.append(int(val))
            else:
                result.append(val)
        except (ValueError, NotImplementedError):
            result.append(val)
    return result


# ── CRUD mutations ────────────────────────────────────────────────────────────

def _coerce(raw: str, col: dict[str, Any]) -> Any:
    type_str = str(col.get("type", "")).upper()
    nullable = col.get("nullable", True)
    if "BOOL" in type_str:
        return raw in ("on", "true", "1", "yes")
    if not raw:
        return None if nullable else ""
    if any(t in type_str for t in ("INT", "BIGINT", "SMALLINT", "TINYINT")):
        try:
            return int(raw)
        except ValueError:
            return raw
    if any(t in type_str for t in ("FLOAT", "REAL", "DOUBLE", "NUMERIC", "DECIMAL")):
        try:
            return float(raw)
        except ValueError:
            return raw
    if "DATETIME" in type_str or "TIMESTAMP" in type_str:
        return raw.replace("T", " ")
    return raw


def _do_create(table: str, form: dict[str, str]) -> None:
    pk_names   = _pk_names(table)
    insertable = [c for c in _columns(table) if c["name"] not in pk_names]
    if not insertable:
        insertable = _columns(table)
    cols_sql = ", ".join(f'"{c["name"]}"' for c in insertable)
    vals_sql = ", ".join(f':v{i}'         for i in range(len(insertable)))
    params   = {f"v{i}": _coerce(form.get(c["name"], ""), c) for i, c in enumerate(insertable)}
    with engine.begin() as conn:
        conn.execute(text(f'INSERT INTO "{table}" ({cols_sql}) VALUES ({vals_sql})'), params)


def _do_update(table: str, form: dict[str, str], pk_names: list[str], pk_vals: list[Any]) -> None:
    updatable = [c for c in _columns(table) if c["name"] not in pk_names]
    if not updatable:
        return
    set_sql   = ", ".join(f'"{c["name"]}" = :s{i}' for i, c in enumerate(updatable))
    where_sql = " AND ".join(f'"{c}" = :pk{i}'      for i, c in enumerate(pk_names))
    params    = {f"s{i}": _coerce(form.get(c["name"], ""), c) for i, c in enumerate(updatable)}
    params.update({f"pk{i}": v for i, v in enumerate(pk_vals)})
    with engine.begin() as conn:
        conn.execute(text(f'UPDATE "{table}" SET {set_sql} WHERE {where_sql}'), params)


def _do_delete(table: str, pk_names: list[str], pk_vals: list[Any]) -> None:
    where_sql = " AND ".join(f'"{c}" = :pk{i}' for i, c in enumerate(pk_names))
    params    = {f"pk{i}": v for i, v in enumerate(pk_vals)}
    with engine.begin() as conn:
        conn.execute(text(f'DELETE FROM "{table}" WHERE {where_sql}'), params)


# ── HTML helpers ──────────────────────────────────────────────────────────────

def _esc(s: Any) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _u(s: Any) -> str:
    return quote(str(s), safe="")


def _cell(val: Any) -> str:
    if val is None:
        return '<span class="null">NULL</span>'
    s = str(val)
    if len(s) > 100:
        return f'<abbr title="{_esc(s)}" class="trunc">{_esc(s[:100])}…</abbr>'
    return _esc(s)


_CSS = """<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;
     background:#0d1117;color:#c9d1d9;font-size:14px}
a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}
h1{font-size:18px;margin:0}h2{font-size:15px;margin:0 0 10px;color:#e6edf3}
h3{font-size:11px;margin:16px 0 6px;color:#8b949e;font-weight:700;text-transform:uppercase;letter-spacing:.07em}
.top{background:#161b22;border-bottom:1px solid #30363d;padding:11px 20px;
     display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:20}
.badge{background:#238636;color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600}
.wrap{padding:20px 22px;max-width:1700px}
.layout{display:flex;gap:18px;align-items:flex-start}
.nav{width:164px;flex-shrink:0;background:#161b22;border:1px solid #30363d;
     border-radius:8px;padding:7px 0;position:sticky;top:50px;max-height:calc(100vh - 70px);overflow-y:auto}
.nav a{display:block;padding:5px 13px;color:#c9d1d9;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav a:hover,.nav a.active{background:#1f2937;color:#58a6ff;text-decoration:none}
.nav .sep{height:1px;background:#30363d;margin:5px 0}
.main{flex:1;min-width:0}
.dt-wrap{overflow-x:auto}
table.dt{width:100%;border-collapse:collapse;font-size:13px}
table.dt th{text-align:left;background:#161b22;border:1px solid #30363d;
             padding:6px 10px;color:#8b949e;font-weight:600;white-space:nowrap}
table.dt td{border:1px solid #30363d;padding:5px 9px;vertical-align:top;word-break:break-word}
table.dt tr:nth-child(even) td{background:#0a0f17}
table.dt tr:hover td{background:#1a2233}
table.dt .act-col{white-space:nowrap;width:1px}
table.st{border-collapse:collapse;font-size:12px;margin-top:6px}
table.st th{background:#161b22;border:1px solid #21262d;padding:5px 9px;color:#8b949e;font-weight:600}
table.st td{border:1px solid #21262d;padding:4px 9px}
table.st td:first-child{font-weight:600;color:#79c0ff}
table.st td:nth-child(2){color:#a5d6ff}
table.st td:nth-child(3){color:#6e7681;font-size:11px}
.btn{display:inline-flex;align-items:center;gap:4px;padding:4px 11px;border-radius:6px;
     border:1px solid #30363d;background:#21262d;color:#c9d1d9;font-size:12px;
     cursor:pointer;text-decoration:none;line-height:1.5;white-space:nowrap}
.btn:hover{background:#30363d;color:#e6edf3;text-decoration:none}
.btn-green{background:#238636;border-color:#238636;color:#fff}.btn-green:hover{background:#2ea043;color:#fff}
.btn-blue {background:#1f6feb;border-color:#1f6feb;color:#fff}.btn-blue:hover {background:#388bfd;color:#fff}
.btn-red  {background:#da3633;border-color:#b62324;color:#fff}.btn-red:hover  {background:#f85149;color:#fff}
.btn-xs{padding:2px 7px;font-size:11px}
.toolbar{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.pager{display:flex;align-items:center;gap:7px;margin-top:12px;flex-wrap:wrap;font-size:13px}
.pager .info{color:#8b949e;margin-left:4px}
.pn{padding:3px 9px;border-radius:5px;border:1px solid #30363d;background:#21262d;
    color:#c9d1d9;font-size:12px;text-decoration:none;min-width:28px;text-align:center;display:inline-block}
.pn:hover{background:#30363d;color:#e6edf3;text-decoration:none}
.pn.cur{background:#1f6feb;border-color:#1f6feb;color:#fff}
.pn.dis{opacity:.35;cursor:default;pointer-events:none}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 15px}
.card a{font-weight:600;font-size:13px}.card .sub{color:#8b949e;font-size:12px;margin-top:3px}
.ok{background:#0d3a1e;border:1px solid #238636;color:#56d364;padding:7px 13px;border-radius:6px;margin-bottom:12px;font-size:13px}
.er{background:#3d0f0f;border:1px solid #da3633;color:#f85149;padding:7px 13px;border-radius:6px;margin-bottom:12px;font-size:13px}
.fwrap{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 22px;max-width:660px}
.fr{margin-bottom:13px}
.fr label{display:block;font-size:12px;color:#8b949e;margin-bottom:4px}
.fr input[type=text],.fr input[type=number],.fr input[type=datetime-local],.fr textarea{
  width:100%;padding:7px 10px;border-radius:7px;border:1px solid #30363d;
  background:#0d1117;color:#c9d1d9;font-size:13px;outline:none;font-family:inherit}
.fr input:focus,.fr textarea:focus{border-color:#58a6ff}
.fr textarea{resize:vertical;min-height:64px;font-family:monospace;font-size:12px}
.fr input[type=checkbox]{width:16px;height:16px;accent-color:#238636;cursor:pointer}
.fr .hint{font-size:11px;color:#6e7681;margin-top:3px}
.fr .pkval{font-family:monospace;color:#79c0ff;font-size:13px;padding:5px 0;display:inline-block}
.factions{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;align-items:center}
hr.sep{border:0;border-top:1px solid #30363d;margin:16px 0}
.null{color:#6e7681;font-style:italic}
.trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px;display:inline-block;vertical-align:bottom}
.lw{display:flex;align-items:center;justify-content:center;height:100vh}
.lcard{width:min(350px,92vw);background:#161b22;border:1px solid #30363d;border-radius:12px;padding:26px}
.lcard h1{margin:0 0 5px}.lcard p{color:#8b949e;font-size:13px;margin:0 0 18px}
.lcard label{display:block;font-size:12px;color:#8b949e;margin-bottom:5px}
.lcard input[type=password]{width:100%;padding:8px 11px;border-radius:7px;border:1px solid #30363d;
  background:#0d1117;color:#c9d1d9;font-size:14px;outline:none}
.lcard input[type=password]:focus{border-color:#58a6ff}
.lcard .submit{margin-top:11px;width:100%;padding:9px;border-radius:8px;border:0;
  background:#238636;color:#fff;font-weight:600;cursor:pointer;font-size:14px}
.lcard .submit:hover{background:#2ea043}
.logout-btn{margin-left:auto;background:#21262d;border:1px solid #30363d;color:#c9d1d9;
            padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px}
.logout-btn:hover{background:#30363d}
</style>"""

_LOGIN_BODY = """
<div class="lw"><div class="lcard">
  <h1>&#x1F5C4; DB Browser</h1>
  <p>Enter the access password to continue.</p>
  <form method="post" action="/dbms">
    <label>Password</label>
    <input type="password" name="password" autofocus placeholder="&bull;&bull;&bull;&bull;&bull;&bull;" />
    <!--ERR-->
    <button class="submit" type="submit">Unlock</button>
  </form>
</div></div>"""


def _shell(body: str, title: str = "DB Browser") -> str:
    return (
        f'<!doctype html><html lang="en"><head>'
        f'<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>'
        f'<title>CREA &middot; {_esc(title)}</title>{_CSS}</head><body>{body}</body></html>'
    )


def _topbar(n_tables: int) -> str:
    return (
        '<div class="top"><h1>&#x1F5C4; DB Browser</h1>'
        f'<span class="badge">{n_tables} tables</span>'
        '<form method="post" action="/dbms/logout" style="margin-left:auto">'
        '<button class="logout-btn" type="submit">Logout</button></form></div>'
    )


def _nav(all_tables: list[str], active: str | None = None) -> str:
    overview_cls = ' class="active"' if active is None else ""
    items = f'<a href="/dbms"{overview_cls}>Overview</a><div class="sep"></div>'
    for t in all_tables:
        cls = ' class="active"' if t == active else ""
        items += f'<a href="/dbms?table={_u(t)}"{cls}>{_esc(t)}</a>'
    return f'<div class="nav">{items}</div>'


def _flash(msg: str | None, err: str | None) -> str:
    html = ""
    if msg:
        html += f'<div class="ok">&#10003; {_esc(msg)}</div>'
    if err:
        html += f'<div class="er">&#10007; {_esc(err)}</div>'
    return html


def _redirect(url: str, msg: str | None = None, err: str | None = None) -> RedirectResponse:
    if msg:
        sep = "&" if "?" in url else "?"
        url += f"{sep}msg={_u(msg)}"
    if err:
        sep = "&" if "?" in url else "?"
        url += f"{sep}err={_u(err)}"
    return RedirectResponse(url=url, status_code=303)


# ── routes: login / logout ────────────────────────────────────────────────────

@router.get("/dbms", response_class=HTMLResponse)
def dbms_main(
    table:    str | None = Query(default=None),
    page:     int        = Query(default=1, ge=1),
    action:   str | None = Query(default=None),
    pk:       str | None = Query(default=None),
    msg:      str | None = Query(default=None),
    err:      str | None = Query(default=None),
    dbms_auth: str | None = Cookie(default=None),
) -> HTMLResponse:
    if not _auth_ok(dbms_auth):
        return HTMLResponse(_shell(_LOGIN_BODY, "DB Login"))

    all_tables = _tables()

    if table and table not in all_tables:
        return HTMLResponse(_shell(
            _flash(None, "Table not found") + f'<div style="padding:20px"><a href="/dbms">&#8592; Back</a></div>',
            "Error",
        ))

    if action == "new" and table:
        return _page_create_form(table, all_tables)
    if action == "edit" and table and pk:
        return _page_edit_form(table, pk, all_tables, err=err)
    if table:
        return _page_table(table, page, all_tables, msg=msg, err=err)
    return _page_overview(all_tables)


@router.post("/dbms", response_class=HTMLResponse, response_model=None)
def dbms_login(password: str = Form(...)) -> HTMLResponse | RedirectResponse:
    if password != settings.dbms_pass:
        body = _LOGIN_BODY.replace(
            "<!--ERR-->",
            '<p style="color:#f85149;font-size:13px;margin-top:8px">Incorrect password.</p>',
        )
        return HTMLResponse(_shell(body, "DB Login"), status_code=401)
    resp = RedirectResponse(url="/dbms", status_code=303)
    resp.set_cookie(_COOKIE, _token(), httponly=True, samesite="lax")
    return resp


@router.post("/dbms/logout")
def dbms_logout() -> RedirectResponse:
    resp = RedirectResponse(url="/dbms", status_code=303)
    resp.delete_cookie(_COOKIE)
    return resp


# ── routes: CRUD ──────────────────────────────────────────────────────────────

@router.post("/dbms/create")
async def dbms_create(
    request:   Request,
    table:     str        = Query(...),
    dbms_auth: str | None = Cookie(default=None),
) -> RedirectResponse:
    if not _auth_ok(dbms_auth):
        return RedirectResponse(url="/dbms", status_code=303)
    if table not in _tables():
        return _redirect(f"/dbms?table={_u(table)}", err="Table not found")
    form = dict(await request.form())
    try:
        _do_create(table, form)
        return _redirect(f"/dbms?table={_u(table)}", msg="Row created")
    except Exception as exc:
        return _redirect(f"/dbms?table={_u(table)}&action=new", err=str(exc))


@router.post("/dbms/update")
async def dbms_update(
    request:   Request,
    table:     str        = Query(...),
    pk:        str        = Query(...),
    dbms_auth: str | None = Cookie(default=None),
) -> RedirectResponse:
    if not _auth_ok(dbms_auth):
        return RedirectResponse(url="/dbms", status_code=303)
    if table not in _tables():
        return _redirect(f"/dbms?table={_u(table)}", err="Table not found")
    pk_names = _pk_names(table)
    pk_vals  = _decode_pk(pk, table, pk_names)
    form     = dict(await request.form())
    try:
        _do_update(table, form, pk_names, pk_vals)
        return _redirect(f"/dbms?table={_u(table)}", msg="Row updated")
    except Exception as exc:
        return _redirect(f"/dbms?table={_u(table)}&action=edit&pk={_u(pk)}", err=str(exc))


@router.post("/dbms/delete")
async def dbms_delete(
    request:   Request,
    table:     str        = Query(...),
    pk:        str        = Query(...),
    dbms_auth: str | None = Cookie(default=None),
) -> RedirectResponse:
    if not _auth_ok(dbms_auth):
        return RedirectResponse(url="/dbms", status_code=303)
    if table not in _tables():
        return _redirect(f"/dbms?table={_u(table)}", err="Table not found")
    pk_names = _pk_names(table)
    pk_vals  = _decode_pk(pk, table, pk_names)
    try:
        _do_delete(table, pk_names, pk_vals)
        return _redirect(f"/dbms?table={_u(table)}", msg="Row deleted")
    except Exception as exc:
        return _redirect(f"/dbms?table={_u(table)}", err=str(exc))


# ── page renderers ────────────────────────────────────────────────────────────

def _page_overview(all_tables: list[str]) -> HTMLResponse:
    cards = ""
    for t in all_tables:
        try:
            cnt = _count(t)
        except Exception:
            cnt = "?"
        cards += (
            f'<div class="card">'
            f'<a href="/dbms?table={_u(t)}">{_esc(t)}</a>'
            f'<div class="sub">{cnt} rows</div>'
            f'</div>'
        )
    main = (
        f'<h2>Database Overview</h2><div class="card-grid">{cards}</div>'
        if cards else '<p style="color:#8b949e">No tables.</p>'
    )
    body = (
        f'{_topbar(len(all_tables))}'
        f'<div class="wrap"><div class="layout">'
        f'{_nav(all_tables)}<div class="main">{main}</div>'
        f'</div></div>'
    )
    return HTMLResponse(_shell(body, "Overview"))


def _page_table(
    table: str,
    page: int,
    all_tables: list[str],
    msg: str | None = None,
    err: str | None = None,
) -> HTMLResponse:
    flash = _flash(msg, err)
    try:
        total           = _count(table)
        n_pages         = max(1, ceil(total / _PAGE_SZ))
        page            = min(max(page, 1), n_pages)
        col_names, rows = _get_page(table, page)
        pk_names        = _pk_names(table)
        cols_meta       = _columns(table)
    except Exception as exc:
        flash += _flash(None, str(exc))
        col_names, rows, total, n_pages, pk_names, cols_meta = [], [], 0, 1, [], []

    toolbar = (
        f'<div class="toolbar">'
        f'<h2>{_esc(table)}</h2>'
        f'<a href="/dbms?table={_u(table)}&action=new" class="btn btn-green">+ New row</a>'
        f'<span style="color:#8b949e;font-size:12px;margin-left:auto">{total} rows total</span>'
        f'</div>'
    )

    schema_rows = "".join(
        f'<tr><td>{_esc(c["name"])}</td><td>{_esc(str(c["type"]))}</td>'
        f'<td>{"PK &middot; " if c["name"] in pk_names else ""}'
        f'{"NOT NULL" if not c.get("nullable", True) else "nullable"}</td></tr>'
        for c in cols_meta
    )
    schema = (
        '<details style="margin-bottom:13px">'
        '<summary style="cursor:pointer;font-size:12px;color:#8b949e;user-select:none">'
        '&#9656; Schema</summary>'
        '<table class="st" style="margin-top:7px">'
        '<tr><th>Column</th><th>Type</th><th>Constraints</th></tr>'
        f'{schema_rows}</table></details>'
    )

    if not rows:
        data = '<p style="color:#8b949e;margin-top:4px">No rows on this page.</p>'
    else:
        header = (
            '<th class="act-col">Actions</th>'
            + "".join(f'<th>{_esc(c)}</th>' for c in col_names)
        )
        body_rows = ""
        for row in rows:
            pk_str   = _encode_pk(row, pk_names, col_names)
            edit_url = f"/dbms?table={_u(table)}&action=edit&pk={_u(pk_str)}"
            del_url  = f"/dbms/delete?table={_u(table)}&pk={_u(pk_str)}"
            actions  = (
                f'<td class="act-col">'
                f'<a href="{_esc(edit_url)}" class="btn btn-blue btn-xs">Edit</a>&nbsp;'
                f'<form method="post" action="{_esc(del_url)}" style="display:inline"'
                f' onsubmit="return confirm(\'Delete this row?\');">'
                f'<button class="btn btn-red btn-xs" type="submit">Del</button></form>'
                f'</td>'
            )
            cells     = "".join(f'<td>{_cell(v)}</td>' for v in row)
            body_rows += f'<tr>{actions}{cells}</tr>'
        data = f'<div class="dt-wrap"><table class="dt"><tr>{header}</tr>{body_rows}</table></div>'

    pager = _build_pager(table, page, n_pages, total)

    main = f'{flash}{toolbar}{schema}{data}{pager}'
    body = (
        f'{_topbar(len(all_tables))}'
        f'<div class="wrap"><div class="layout">'
        f'{_nav(all_tables, table)}<div class="main">{main}</div>'
        f'</div></div>'
    )
    return HTMLResponse(_shell(body, table))


def _build_pager(table: str, page: int, n_pages: int, total: int) -> str:
    if n_pages <= 1:
        return ""
    start = (page - 1) * _PAGE_SZ + 1
    end   = min(page * _PAGE_SZ, total)

    def plink(p: int, label: str, extra: str = "") -> str:
        cls = f"pn {extra}".strip()
        return f'<a href="/dbms?table={_u(table)}&page={p}" class="{cls}">{label}</a>'

    prev_btn = plink(page - 1, "&#8249; Prev") if page > 1 else '<span class="pn dis">&#8249; Prev</span>'
    next_btn = plink(page + 1, "Next &#8250;") if page < n_pages else '<span class="pn dis">Next &#8250;</span>'

    lo, hi = max(1, page - 3), min(n_pages, page + 3)
    nums   = ""
    if lo > 1:
        nums += plink(1, "1")
        if lo > 2:
            nums += '<span style="color:#6e7681;padding:0 3px">&hellip;</span>'
    for p in range(lo, hi + 1):
        nums += plink(p, str(p), "cur" if p == page else "")
    if hi < n_pages:
        if hi < n_pages - 1:
            nums += '<span style="color:#6e7681;padding:0 3px">&hellip;</span>'
        nums += plink(n_pages, str(n_pages))

    return (
        f'<div class="pager">'
        f'{prev_btn}{nums}{next_btn}'
        f'<span class="info">Rows {start}&ndash;{end} of {total}</span>'
        f'</div>'
    )


# ── form helpers ──────────────────────────────────────────────────────────────

def _field(col: dict[str, Any], value: Any = "") -> str:
    name     = col["name"]
    type_str = str(col.get("type", "")).upper()
    nullable = col.get("nullable", True)
    hint     = f'{"nullable" if nullable else "NOT NULL"} &middot; {_esc(str(col["type"]))}'
    val_str  = "" if value is None else str(value)

    if "BOOL" in type_str:
        checked = "checked" if value else ""
        return (
            f'<div class="fr"><label>{_esc(name)}</label>'
            f'<input type="checkbox" name="{_esc(name)}" {checked}/>'
            f'<div class="hint">{hint}</div></div>'
        )

    is_big_text = "TEXT" in type_str and not any(t in type_str for t in ("VARCHAR", "NVARCHAR", "CHAR"))
    if "JSON" in type_str or is_big_text:
        return (
            f'<div class="fr"><label>{_esc(name)}</label>'
            f'<textarea name="{_esc(name)}" rows="4">{_esc(val_str)}</textarea>'
            f'<div class="hint">{hint}</div></div>'
        )

    if any(t in type_str for t in ("INT", "BIGINT", "SMALLINT", "TINYINT",
                                    "FLOAT", "REAL", "DOUBLE", "NUMERIC", "DECIMAL")):
        return (
            f'<div class="fr"><label>{_esc(name)}</label>'
            f'<input type="number" name="{_esc(name)}" value="{_esc(val_str)}" step="any"/>'
            f'<div class="hint">{hint}</div></div>'
        )

    if "DATETIME" in type_str or "TIMESTAMP" in type_str:
        dt = val_str[:16].replace(" ", "T") if val_str else ""
        return (
            f'<div class="fr"><label>{_esc(name)}</label>'
            f'<input type="datetime-local" name="{_esc(name)}" value="{_esc(dt)}"/>'
            f'<div class="hint">{hint}</div></div>'
        )

    return (
        f'<div class="fr"><label>{_esc(name)}</label>'
        f'<input type="text" name="{_esc(name)}" value="{_esc(val_str)}" autocomplete="off"/>'
        f'<div class="hint">{hint}</div></div>'
    )


def _page_create_form(table: str, all_tables: list[str]) -> HTMLResponse:
    pk_names   = _pk_names(table)
    insertable = [c for c in _columns(table) if c["name"] not in pk_names]
    fields     = "".join(_field(c) for c in insertable)
    form = (
        f'<div class="fwrap">'
        f'<h2>New row &mdash; <code style="font-size:14px">{_esc(table)}</code></h2>'
        f'<p style="color:#8b949e;font-size:12px;margin:4px 0 14px">'
        f'PK columns are auto-generated and hidden.</p>'
        f'<form method="post" action="/dbms/create?table={_u(table)}">'
        f'{fields}'
        f'<div class="factions">'
        f'<button type="submit" class="btn btn-green">Insert row</button>'
        f'<a href="/dbms?table={_u(table)}" class="btn">Cancel</a>'
        f'</div></form></div>'
    )
    body = (
        f'{_topbar(len(all_tables))}'
        f'<div class="wrap"><div class="layout">'
        f'{_nav(all_tables, table)}<div class="main">{form}</div>'
        f'</div></div>'
    )
    return HTMLResponse(_shell(body, f"New row · {table}"))


def _page_edit_form(
    table: str,
    pk_str: str,
    all_tables: list[str],
    err: str | None = None,
) -> HTMLResponse:
    pk_names = _pk_names(table)
    pk_vals  = _decode_pk(pk_str, table, pk_names)
    try:
        col_names, row = _get_row(table, pk_names, pk_vals)
    except Exception as exc:
        return HTMLResponse(_shell(
            _flash(None, str(exc)) + f'<div style="padding:20px"><a href="/dbms?table={_u(table)}">&#8592; Back</a></div>',
            "Error",
        ))

    if row is None:
        return HTMLResponse(_shell(
            f'<div style="padding:20px;color:#8b949e">Row not found. '
            f'<a href="/dbms?table={_u(table)}">&#8592; Back</a></div>',
            "Not found",
        ))

    col_idx = {name: i for i, name in enumerate(col_names)}
    cols    = _columns(table)

    pk_display = "".join(
        f'<div class="fr"><label>{_esc(n)}'
        f' <span style="background:#238636;color:#fff;font-size:10px;padding:1px 6px;'
        f'border-radius:8px;margin-left:4px;vertical-align:middle">PK</span></label>'
        f'<span class="pkval">{_esc(str(row[col_idx[n]]))}</span></div>'
        for n in pk_names if n in col_idx
    )

    fields = "".join(
        _field(c, value=row[col_idx[c["name"]]] if c["name"] in col_idx else "")
        for c in cols
        if c["name"] not in pk_names
    )

    del_url = f"/dbms/delete?table={_u(table)}&pk={_u(pk_str)}"
    form = (
        f'<div class="fwrap">'
        f'<h2>Edit row &mdash; <code style="font-size:14px">{_esc(table)}</code></h2>'
        f'{_flash(None, err)}'
        f'{pk_display}'
        f'<form method="post" action="/dbms/update?table={_u(table)}&pk={_u(pk_str)}">'
        f'{fields}'
        f'<div class="factions">'
        f'<button type="submit" class="btn btn-blue">Save changes</button>'
        f'<a href="/dbms?table={_u(table)}" class="btn">Cancel</a>'
        f'</div></form>'
        f'<hr class="sep"/>'
        f'<form method="post" action="{_esc(del_url)}"'
        f' onsubmit="return confirm(\'Permanently delete this row?\');">'
        f'<button type="submit" class="btn btn-red">Delete this row</button>'
        f'</form></div>'
    )
    body = (
        f'{_topbar(len(all_tables))}'
        f'<div class="wrap"><div class="layout">'
        f'{_nav(all_tables, table)}<div class="main">{form}</div>'
        f'</div></div>'
    )
    return HTMLResponse(_shell(body, f"Edit · {table}"))
