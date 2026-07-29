from __future__ import annotations

"""Backend admin console (/admin-dashboard) — replaces Keycloak + Mailpit UIs.

Three tabs, all gated by the admin-panel JWT (see admin.require_admin_panel),
which is issued from ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env:

  • Users     — CRUD over the local `user` table (the Keycloak replacement).
  • Mail      — read the real mailbox over IMAP + send over SMTP, using the
                SMTP_* credentials in .env (the Mailpit replacement).
  • Database  — inspect any table and perform CRUD (the DBMS browser).

Credentials never reach the browser: all IMAP/SMTP/DB access is server-side.
"""

import imaplib
import email as email_lib
import socket
import ssl
from datetime import datetime
from email.header import decode_header, make_header
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import inspect as sa_inspect, text
from sqlmodel import Session, select

from ..core.config import settings
from ..core.email import _send_email
from ..core.security import hash_password
from ..db import engine, get_session
from ..models import User, UserActivity
from .admin import require_admin_panel

router = APIRouter(prefix="/api/admin", tags=["admin-panel"])


# ══════════════════════════════════════════════════════════════════════════════
# USERS TAB
# ══════════════════════════════════════════════════════════════════════════════
class AdminUserOut(BaseModel):
    id: int
    email: str
    username: str
    role: str
    email_verified: bool
    created_at: datetime | None = None
    last_login_at: datetime | None = None


class AdminUserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8, max_length=128)
    role: str = "agent"
    email_verified: bool = True


class AdminUserUpdate(BaseModel):
    email: str | None = None
    username: str | None = None
    role: str | None = None
    email_verified: bool | None = None
    password: str | None = None  # set to change the password


def _user_out(u: User) -> AdminUserOut:
    return AdminUserOut(
        id=u.id, email=u.email, username=u.username, role=u.role,
        email_verified=bool(u.email_verified),
        created_at=getattr(u, "created_at", None),
        last_login_at=getattr(u, "last_login_at", None),
    )


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    q: str | None = Query(None, description="filter by email/username"),
    _admin: str = Depends(require_admin_panel),
    session: Session = Depends(get_session),
):
    stmt = select(User).order_by(User.id.desc())
    users = session.exec(stmt).all()
    if q:
        ql = q.strip().lower()
        users = [u for u in users if ql in (u.email or "").lower() or ql in (u.username or "").lower()]
    return [_user_out(u) for u in users]


@router.post("/users", response_model=AdminUserOut)
def create_user(body: AdminUserCreate, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="A user with this email already exists.")
    if session.exec(select(User).where(User.username == body.username.strip())).first():
        raise HTTPException(status_code=409, detail="This username is already taken.")
    role = body.role.strip().lower() or "agent"
    if role not in ("agent", "mediator", "admin", "user"):
        role = "agent"
    u = User(
        email=email, username=body.username.strip(), role=role,
        hashed_password=hash_password(body.password),
        email_verified=bool(body.email_verified),
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    return _user_out(u)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(user_id: int, body: AdminUserUpdate, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found.")
    if body.email is not None:
        u.email = body.email.strip().lower()
    if body.username is not None:
        u.username = body.username.strip()
    if body.role is not None:
        r = body.role.strip().lower()
        if r in ("agent", "mediator", "admin", "user"):
            u.role = r
    if body.email_verified is not None:
        u.email_verified = bool(body.email_verified)
    if body.password:
        u.hashed_password = hash_password(body.password)
    session.add(u)
    session.commit()
    session.refresh(u)
    return _user_out(u)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found.")
    session.delete(u)
    session.commit()
    return {"ok": True}


@router.get("/activity")
def list_activity(
    limit: int = Query(100, ge=1, le=1000),
    _admin: str = Depends(require_admin_panel),
    session: Session = Depends(get_session),
):
    rows = session.exec(select(UserActivity).order_by(UserActivity.id.desc()).limit(limit)).all()
    return [
        {
            "id": r.id, "user_id": r.user_id, "email": r.email, "event": r.event,
            "ip": r.ip, "user_agent": r.user_agent, "detail": r.detail,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ══════════════════════════════════════════════════════════════════════════════
# MAIL TAB  (IMAP receive + SMTP send, using the .env credentials)
# ══════════════════════════════════════════════════════════════════════════════
def _decode(s: Any) -> str:
    if not s:
        return ""
    try:
        return str(make_header(decode_header(str(s))))
    except Exception:
        return str(s)


@router.get("/mail/config")
def mail_config(_admin: str = Depends(require_admin_panel)):
    """SMTP settings in use (password intentionally NOT returned)."""
    return {
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_user": settings.smtp_user,
        "smtp_from": settings.smtp_from,
        "smtp_from_name": settings.smtp_from_name,
        "smtp_ssl": settings.smtp_ssl,
        "smtp_starttls": settings.smtp_tls,
        "imap_available": bool(settings.smtp_user and settings.smtp_pass),
    }


@router.get("/mail/received")
def mail_received(
    mailbox: str = Query("INBOX"),
    limit: int = Query(30, ge=1, le=100),
    _admin: str = Depends(require_admin_panel),
):
    """Read recent messages from the real mailbox over IMAP (host = SMTP host)."""
    if not (settings.smtp_user and settings.smtp_pass):
        raise HTTPException(status_code=503, detail="No mailbox credentials configured (SMTP_USER/SMTP_PASS).")
    host = settings.smtp_host
    socket.setdefaulttimeout(20)
    try:
        M = imaplib.IMAP4_SSL(host, 993, ssl_context=ssl.create_default_context())
        M.login(settings.smtp_user, settings.smtp_pass)
        M.select(mailbox, readonly=True)
        typ, data = M.search(None, "ALL")
        ids = data[0].split()
        out = []
        for i in reversed(ids[-limit:]):
            typ, d = M.fetch(i, "(BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])")
            hdr = email_lib.message_from_bytes(d[0][1]) if d and d[0] else None
            if hdr is None:
                continue
            out.append({
                "id": i.decode(),
                "from": _decode(hdr.get("From")),
                "to": _decode(hdr.get("To")),
                "subject": _decode(hdr.get("Subject")),
                "date": _decode(hdr.get("Date")),
            })
        M.logout()
        return {"mailbox": mailbox, "count": len(out), "messages": out}
    except imaplib.IMAP4.error as e:
        raise HTTPException(status_code=502, detail=f"IMAP error: {str(e)[:150]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not read mailbox: {type(e).__name__}")


@router.get("/mail/received/{msg_id}")
def mail_message(msg_id: str, mailbox: str = Query("INBOX"), _admin: str = Depends(require_admin_panel)):
    """Full body of one message."""
    if not (settings.smtp_user and settings.smtp_pass):
        raise HTTPException(status_code=503, detail="No mailbox credentials configured.")
    socket.setdefaulttimeout(20)
    try:
        M = imaplib.IMAP4_SSL(settings.smtp_host, 993, ssl_context=ssl.create_default_context())
        M.login(settings.smtp_user, settings.smtp_pass)
        M.select(mailbox, readonly=True)
        typ, d = M.fetch(msg_id.encode(), "(RFC822)")
        M.logout()
        if not d or not d[0]:
            raise HTTPException(status_code=404, detail="Message not found.")
        msg = email_lib.message_from_bytes(d[0][1])
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True).decode("utf-8", "ignore")
                    break
            if not body:
                for part in msg.walk():
                    if part.get_content_type() == "text/html":
                        body = part.get_payload(decode=True).decode("utf-8", "ignore")
                        break
        else:
            body = msg.get_payload(decode=True).decode("utf-8", "ignore")
        return {
            "from": _decode(msg.get("From")), "to": _decode(msg.get("To")),
            "subject": _decode(msg.get("Subject")), "date": _decode(msg.get("Date")),
            "body": body[:20000],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not read message: {type(e).__name__}")


class SendMailIn(BaseModel):
    to: str = Field(min_length=3, max_length=254)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=20000)


@router.post("/mail/send")
def mail_send(body: SendMailIn, _admin: str = Depends(require_admin_panel)):
    """Send an email through the configured SMTP account."""
    try:
        _send_email(to_email=body.to.strip(), subject=body.subject, body_text=body.body)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Send failed: {type(e).__name__}: {str(e)[:150]}")
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# DATABASE TAB  (inspect tables + CRUD)
# ══════════════════════════════════════════════════════════════════════════════
def _tables() -> list[str]:
    return sorted(sa_inspect(engine).get_table_names())


def _columns(table: str) -> list[dict[str, Any]]:
    return sa_inspect(engine).get_columns(table)


def _pk_names(table: str) -> list[str]:
    return sa_inspect(engine).get_pk_constraint(table).get("constrained_columns", []) or []


def _require_table(table: str) -> None:
    if table not in _tables():
        raise HTTPException(status_code=404, detail="Unknown table.")


@router.get("/db/tables")
def db_tables(_admin: str = Depends(require_admin_panel)):
    out = []
    with engine.connect() as conn:
        for t in _tables():
            try:
                n = conn.execute(text(f'SELECT COUNT(*) FROM "{t}"')).scalar() or 0
            except Exception:
                n = -1
            out.append({"name": t, "rows": n})
    return out


@router.get("/db/tables/{table}")
def db_rows(
    table: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    _admin: str = Depends(require_admin_panel),
):
    _require_table(table)
    cols = [c["name"] for c in _columns(table)]
    pk = _pk_names(table)
    offset = (page - 1) * page_size
    with engine.connect() as conn:
        total = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar() or 0
        rows = conn.execute(
            text(f'SELECT * FROM "{table}" LIMIT :lim OFFSET :off'),
            {"lim": page_size, "off": offset},
        ).fetchall()
    return {
        "table": table,
        "columns": [{"name": c["name"], "type": str(c["type"])} for c in _columns(table)],
        "primary_key": pk,
        "total": total,
        "page": page,
        "page_size": page_size,
        "rows": [dict(zip(cols, r)) for r in rows],
    }


class DbRowIn(BaseModel):
    values: dict[str, Any]


@router.post("/db/tables/{table}")
def db_insert(table: str, body: DbRowIn, _admin: str = Depends(require_admin_panel)):
    _require_table(table)
    pk = _pk_names(table)
    cols = [c["name"] for c in _columns(table)]
    # Do not force the caller to provide autoincrement PKs.
    data = {k: v for k, v in body.values.items() if k in cols and not (k in pk and (v is None or v == ""))}
    if not data:
        raise HTTPException(status_code=400, detail="No values to insert.")
    col_sql = ", ".join(f'"{k}"' for k in data)
    val_sql = ", ".join(f":{k}" for k in data)
    with engine.begin() as conn:
        conn.execute(text(f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql})'), data)
    return {"ok": True}


@router.patch("/db/tables/{table}")
def db_update(table: str, body: DbRowIn, _admin: str = Depends(require_admin_panel)):
    """Update a row identified by its primary-key value(s) present in `values`."""
    _require_table(table)
    pk = _pk_names(table)
    if not pk:
        raise HTTPException(status_code=400, detail="Table has no primary key; cannot update safely.")
    cols = [c["name"] for c in _columns(table)]
    if not all(k in body.values for k in pk):
        raise HTTPException(status_code=400, detail=f"Provide primary key(s): {pk}")
    updates = {k: v for k, v in body.values.items() if k in cols and k not in pk}
    if not updates:
        raise HTTPException(status_code=400, detail="No non-PK columns to update.")
    set_sql = ", ".join(f'"{k}" = :{k}' for k in updates)
    where_sql = " AND ".join(f'"{k}" = :pk_{k}' for k in pk)
    params = dict(updates)
    params.update({f"pk_{k}": body.values[k] for k in pk})
    with engine.begin() as conn:
        conn.execute(text(f'UPDATE "{table}" SET {set_sql} WHERE {where_sql}'), params)
    return {"ok": True}


@router.delete("/db/tables/{table}")
def db_delete(table: str, body: DbRowIn, _admin: str = Depends(require_admin_panel)):
    """Delete a row identified by its primary-key value(s) in `values`."""
    _require_table(table)
    pk = _pk_names(table)
    if not pk:
        raise HTTPException(status_code=400, detail="Table has no primary key; cannot delete safely.")
    if not all(k in body.values for k in pk):
        raise HTTPException(status_code=400, detail=f"Provide primary key(s): {pk}")
    where_sql = " AND ".join(f'"{k}" = :pk_{k}' for k in pk)
    params = {f"pk_{k}": body.values[k] for k in pk}
    with engine.begin() as conn:
        conn.execute(text(f'DELETE FROM "{table}" WHERE {where_sql}'), params)
    return {"ok": True}
