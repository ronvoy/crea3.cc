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

import base64
import imaplib
import email as email_lib
import json
import socket
import ssl
from datetime import datetime
from email.header import decode_header, make_header
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import inspect as sa_inspect, text
from sqlmodel import Session, select

from ..core.config import settings
from ..core.email import _send_email
from ..core.security import hash_password
from ..db import engine, get_session
from ..models import User, UserActivity, MailMessage, MailAttachmentRow, utcnow
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


def _detect_sent_mailbox(M) -> str:
    return _detect_mailbox(M, "\\Sent", "sent", "INBOX.Sent")


def _detect_junk_mailbox(M) -> str:
    return _detect_mailbox(M, "\\Junk", "junk", "INBOX.Junk")


@router.get("/mail/config")
def mail_config(account: str = Query("info"), _admin: str = Depends(require_admin_panel)):
    """SMTP settings + detected mailbox names for the selected account.

    (The mailbox password is intentionally NOT returned.)
    """
    acc = _mail_account(account)
    sent = "INBOX.Sent"
    junk = "INBOX.Junk"
    if _account_available(account):
        socket.setdefaulttimeout(15)
        try:
            M = _imap_connect(account)
            sent = _detect_sent_mailbox(M)
            junk = _detect_junk_mailbox(M)
            M.logout()
        except Exception:
            pass
    return {
        "account": acc["name"],
        "accounts": _accounts_list(),
        "junk_mailbox": junk,
        "smtp_host": acc["host"],
        "smtp_port": settings.smtp_port,
        "smtp_user": acc["user"],
        "smtp_from": acc["from"],
        "smtp_from_name": acc["from_name"],
        "smtp_ssl": settings.smtp_ssl,
        "smtp_starttls": settings.smtp_tls,
        "imap_available": _account_available(account),
        "inbox_mailbox": "INBOX",
        "sent_mailbox": sent,
    }


# Mailbox accounts for the admin Mail tab. "info" = the primary SMTP account;
# "support" = the support@ mailbox (only offered when its IMAP creds are set).
def _mail_account(account: str | None) -> dict:
    a = (account or "info").lower()
    if a == "support":
        return {
            "name": "support",
            "host": settings.support_imap_host or settings.smtp_host,
            "user": settings.support_imap_user,
            "password": settings.support_imap_pass,
            "from": settings.support_from or settings.support_email,
            "from_name": settings.support_from_name,
            "email": settings.support_email or settings.support_imap_user,
        }
    return {
        "name": "info",
        "host": settings.smtp_host,
        "user": settings.smtp_user,
        "password": settings.smtp_pass,
        "from": settings.smtp_from,
        "from_name": settings.smtp_from_name,
        "email": settings.smtp_user,
    }


def _account_available(account: str | None) -> bool:
    a = _mail_account(account)
    return bool(a["user"] and a["password"])


def _accounts_list() -> list[dict]:
    """Which mailbox accounts the admin Mail tab can offer (have creds)."""
    out = []
    for name in ("info", "support"):
        a = _mail_account(name)
        out.append({"account": name, "email": a["email"], "available": _account_available(name)})
    return out


def _imap_connect(account: str | None = "info"):
    a = _mail_account(account)
    M = imaplib.IMAP4_SSL(a["host"], 993, ssl_context=ssl.create_default_context())
    M.login(a["user"], a["password"])
    return M


def _parse_body_attachments(msg) -> tuple[str, list[dict]]:
    """Return (body_text, attachments). Each attachment includes its raw bytes."""
    body = ""
    attachments: list[dict] = []
    if msg.is_multipart():
        for part in msg.walk():
            disp = str(part.get("Content-Disposition") or "")
            fname = part.get_filename()
            if fname or "attachment" in disp.lower():
                try:
                    raw = part.get_payload(decode=True) or b""
                except Exception:
                    raw = b""
                attachments.append({
                    "filename": _decode(fname) or "attachment",
                    "content_type": part.get_content_type(),
                    "content": raw,
                })
                continue
            if part.get_content_type() == "text/plain" and not body:
                try:
                    body = part.get_payload(decode=True).decode("utf-8", "ignore")
                except Exception:
                    pass
        if not body:
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    try:
                        body = part.get_payload(decode=True).decode("utf-8", "ignore")
                    except Exception:
                        pass
                    break
    else:
        try:
            body = msg.get_payload(decode=True).decode("utf-8", "ignore")
        except Exception:
            body = str(msg.get_payload())
    return body[:60000], attachments


def _detect_mailbox(M, flag: str, name_kw: str, fallback: str) -> str:
    """Find a mailbox by special-use flag (e.g. \\Junk) or by name keyword."""
    try:
        typ, boxes = M.list()
        parsed = []
        for b in boxes or []:
            line = b.decode(errors="ignore")
            name = line.split(' "." ')[-1].strip().strip('"') if '"."' in line else line.split()[-1].strip('"')
            parsed.append((line, name))
        for line, name in parsed:
            if flag in line:
                return name
        for line, name in parsed:
            if name_kw in name.lower():
                return name
    except Exception:
        pass
    return fallback


@router.post("/mail/sync")
def mail_sync(
    account: str = Query("info"),
    mailbox: str = Query("INBOX"),
    limit: int = Query(100, ge=1, le=1000),
    default_status: str = Query("inbox"),  # 'junk' when syncing the junk folder
    _admin: str = Depends(require_admin_panel),
    session: Session = Depends(get_session),
):
    """Fetch from IMAP into the DB cache. New messages inserted (with body),
    existing ones updated (read status), server-removed ones marked deleted.
    Records are never erased."""
    if not _account_available(account):
        raise HTTPException(status_code=503, detail=f"No mailbox credentials configured for the '{account}' account.")
    socket.setdefaulttimeout(40)
    new = updated = removed = 0
    try:
        M = _imap_connect(account)
        M.select(mailbox, readonly=True)
        typ, data = M.search(None, "ALL")
        ids = data[0].split()
        unseen = set()
        try:
            _t, ud = M.search(None, "UNSEEN")
            unseen = set(ud[0].split())
        except Exception:
            pass

        server_msgids: set[str] = set()
        # Existing rows for this account + mailbox, keyed by message_id.
        existing = {m.message_id: m for m in session.exec(
            select(MailMessage).where(MailMessage.account == account, MailMessage.mailbox == mailbox)
        ).all()}

        for i in reversed(ids[-limit:]):
            _t, d = M.fetch(i, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID FROM TO CC SUBJECT DATE)])")
            hdr = email_lib.message_from_bytes(d[0][1]) if d and d[0] else None
            if hdr is None:
                continue
            msgid = (hdr.get("Message-ID") or "").strip() or f"{mailbox}:seq:{i.decode()}:{_decode(hdr.get('Subject'))[:40]}"
            server_msgids.add(msgid)
            seen = i not in unseen

            row = existing.get(msgid)
            if row:
                # Only sync read-status from the server; NEVER override a manual
                # archive/spam/delete the admin has set (those are local decisions).
                if row.seen != seen:
                    row.seen = seen
                    row.updated_at = utcnow()
                    session.add(row)
                    updated += 1
                continue

            # New message: fetch full body once.
            _t2, fd = M.fetch(i, "(BODY.PEEK[])")
            full = email_lib.message_from_bytes(fd[0][1]) if fd and fd[0] else hdr
            body, atts = _parse_body_attachments(full)
            meta = [{"filename": a["filename"], "content_type": a["content_type"]} for a in atts]
            mrow = MailMessage(
                account=account, message_id=msgid, mailbox=mailbox, imap_uid=i.decode(),
                from_addr=_decode(hdr.get("From")), to_addr=_decode(hdr.get("To")),
                cc=_decode(hdr.get("Cc")), subject=_decode(hdr.get("Subject")),
                date_str=_decode(hdr.get("Date")), body=body,
                attachments_json=json.dumps(meta), seen=seen, status=default_status,
            )
            session.add(mrow)
            session.flush()  # get mrow.id
            for a in atts:
                raw = a.get("content") or b""
                session.add(MailAttachmentRow(
                    mail_id=mrow.id, filename=a["filename"], content_type=a["content_type"],
                    size=len(raw), content_b64=base64.b64encode(raw).decode("ascii"),
                ))
            new += 1
        M.logout()

        # Messages that vanished from the server → mark deleted (kept as records).
        # (Skip when syncing the junk folder — those are junk, not inbox.)
        if default_status == "inbox":
            for mid, row in existing.items():
                if mid not in server_msgids and row.status == "inbox":
                    row.status = "deleted"
                    row.updated_at = utcnow()
                    session.add(row)
                    removed += 1

        session.commit()
        return {"ok": True, "new": new, "updated": updated, "removed": removed}
    except imaplib.IMAP4.error as e:
        raise HTTPException(status_code=502, detail=f"IMAP error: {str(e)[:150]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sync failed: {type(e).__name__}: {str(e)[:150]}")


_STATUSES = ("inbox", "archived", "junk", "spam", "deleted")


@router.get("/mail/messages")
def mail_messages(
    account: str = Query("info"),
    filter: str = Query("all"),  # all|unread|read|inbox|archived|junk|deleted
    mailbox: str = Query("INBOX"),  # "ALL" spans every mailbox (used by Junk)
    _admin: str = Depends(require_admin_panel),
    session: Session = Depends(get_session),
):
    """List cached messages from the DB (fast; no IMAP round-trip)."""
    stmt = select(MailMessage).where(MailMessage.account == account)
    if mailbox and mailbox.upper() != "ALL":
        stmt = stmt.where(MailMessage.mailbox == mailbox)
    f = (filter or "all").lower()
    if f == "unread":
        stmt = stmt.where(MailMessage.seen == False, MailMessage.status.notin_(("deleted", "junk", "spam")))  # noqa: E712
    elif f == "read":
        stmt = stmt.where(MailMessage.seen == True, MailMessage.status.notin_(("deleted", "junk", "spam")))  # noqa: E712
    elif f in ("inbox", "archived", "deleted"):
        stmt = stmt.where(MailMessage.status == f)
    elif f in ("junk", "spam"):
        stmt = stmt.where(MailMessage.status.in_(("junk", "spam")))
    else:
        # 'all' for a normal tab = everything EXCEPT junk/deleted (those live in
        # the Junk tab), so moving a message to junk removes it from this view.
        stmt = stmt.where(MailMessage.status.notin_(("deleted", "junk", "spam")))
    rows = session.exec(stmt.order_by(MailMessage.id.desc())).all()
    return {
        "count": len(rows),
        "messages": [
            {
                "id": r.id, "from": r.from_addr, "to": r.to_addr, "subject": r.subject,
                "date": r.date_str, "seen": r.seen, "status": r.status, "mailbox": r.mailbox,
            }
            for r in rows
        ],
    }


@router.get("/mail/messages/{row_id}")
def mail_message_detail(row_id: int, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    """Full cached message; opening marks it read in the DB."""
    r = session.get(MailMessage, row_id)
    if not r:
        raise HTTPException(status_code=404, detail="Message not found.")
    if not r.seen:
        r.seen = True
        r.updated_at = utcnow()
        session.add(r)
        session.commit()
    # Prefer stored attachment rows (downloadable); fall back to JSON metadata.
    att_rows = session.exec(select(MailAttachmentRow).where(MailAttachmentRow.mail_id == r.id)).all()
    if att_rows:
        atts = [{"id": a.id, "filename": a.filename, "content_type": a.content_type, "size": a.size, "downloadable": True} for a in att_rows]
    else:
        try:
            meta = json.loads(r.attachments_json or "[]")
        except Exception:
            meta = []
        atts = [{"id": None, "filename": m.get("filename"), "content_type": m.get("content_type"), "downloadable": False} for m in meta]
    return {
        "id": r.id, "from": r.from_addr, "to": r.to_addr, "cc": r.cc,
        "subject": r.subject, "date": r.date_str, "body": r.body,
        "attachments": atts, "seen": r.seen, "status": r.status,
    }


@router.get("/mail/attachments/{att_id}/download")
def mail_attachment_download(att_id: int, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    """Download a stored attachment's bytes."""
    a = session.get(MailAttachmentRow, att_id)
    if not a:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    try:
        raw = base64.b64decode(a.content_b64 or "")
    except Exception:
        raw = b""
    safe = (a.filename or "attachment").replace('"', "").replace("\n", "").replace("\r", "")
    return Response(
        content=raw,
        media_type=a.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
    )


@router.delete("/mail/messages/{row_id}/permanent")
def mail_delete_permanent(row_id: int, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    """Permanently delete: remove from the mail SERVER (best-effort) and the DB."""
    r = session.get(MailMessage, row_id)
    if not r:
        raise HTTPException(status_code=404, detail="Message not found.")
    server_deleted = False
    if _account_available(r.account) and r.message_id and not r.message_id.startswith(f"{r.mailbox}:seq:"):
        socket.setdefaulttimeout(25)
        try:
            M = _imap_connect(r.account)
            M.select(r.mailbox)
            mid = r.message_id.replace('"', '')
            typ, d = M.search(None, "HEADER", "Message-ID", f'"{mid}"')
            for sid in (d[0].split() if d and d[0] else []):
                M.store(sid, "+FLAGS", "\\Deleted")
                server_deleted = True
            if server_deleted:
                M.expunge()
            M.logout()
        except Exception:
            pass
    for a in session.exec(select(MailAttachmentRow).where(MailAttachmentRow.mail_id == r.id)).all():
        session.delete(a)
    session.delete(r)
    session.commit()
    return {"ok": True, "server_deleted": server_deleted}


class MailStatusIn(BaseModel):
    status: str | None = None   # inbox|archived|junk|deleted
    seen: bool | None = None


@router.post("/mail/messages/{row_id}/status")
def mail_set_status(row_id: int, body: MailStatusIn, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    r = session.get(MailMessage, row_id)
    if not r:
        raise HTTPException(status_code=404, detail="Message not found.")
    if body.status is not None:
        if body.status not in _STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status.")
        r.status = body.status
    if body.seen is not None:
        r.seen = bool(body.seen)
    r.updated_at = utcnow()
    session.add(r)
    session.commit()
    return {"ok": True, "status": r.status, "seen": r.seen}


class MailBulkIn(BaseModel):
    ids: list[int]
    status: str | None = None
    seen: bool | None = None


@router.post("/mail/bulk-status")
def mail_bulk_status(body: MailBulkIn, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    """Apply a status and/or read-flag change to many messages at once."""
    if body.status is not None and body.status not in _STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status.")
    n = 0
    for r in session.exec(select(MailMessage).where(MailMessage.id.in_(body.ids))).all():
        if body.status is not None:
            r.status = body.status
        if body.seen is not None:
            r.seen = bool(body.seen)
        r.updated_at = utcnow()
        session.add(r)
        n += 1
    session.commit()
    return {"ok": True, "updated": n}


@router.post("/mail/bulk-permanent")
def mail_bulk_permanent(body: MailBulkIn, _admin: str = Depends(require_admin_panel), session: Session = Depends(get_session)):
    """Permanently delete many messages from the mail SERVER + the DB."""
    rows = session.exec(select(MailMessage).where(MailMessage.id.in_(body.ids))).all()
    server_deleted = 0
    socket.setdefaulttimeout(40)
    # Group by (account, mailbox) so we connect + select each folder once.
    by_box: dict[tuple[str, str], list] = {}
    for r in rows:
        if r.message_id and not r.message_id.startswith(f"{r.mailbox}:seq:") and _account_available(r.account):
            by_box.setdefault((r.account, r.mailbox), []).append(r)
    for (acct, mb), group in by_box.items():
            try:
                M = _imap_connect(acct)
                M.select(mb)
                any_del = False
                for r in group:
                    mid = r.message_id.replace('"', '')
                    typ, d = M.search(None, "HEADER", "Message-ID", f'"{mid}"')
                    for sid in (d[0].split() if d and d[0] else []):
                        M.store(sid, "+FLAGS", "\\Deleted")
                        any_del = True
                        server_deleted += 1
                if any_del:
                    M.expunge()
                M.logout()
            except Exception:
                pass
    for r in rows:
        for a in session.exec(select(MailAttachmentRow).where(MailAttachmentRow.mail_id == r.id)).all():
            session.delete(a)
        session.delete(r)
    session.commit()
    return {"ok": True, "deleted": len(rows), "server_deleted": server_deleted}


class MailAttachment(BaseModel):
    filename: str
    content_b64: str  # base64-encoded file bytes


class SendMailIn(BaseModel):
    to: str = Field(min_length=3, max_length=254)
    cc: str | None = None
    bcc: str | None = None
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=40000)
    attachments: list[MailAttachment] = Field(default_factory=list)


def _split_addrs(s: str | None) -> list[str]:
    if not s:
        return []
    return [a.strip() for a in s.replace(";", ",").split(",") if a.strip()]


@router.post("/mail/send")
def mail_send(body: SendMailIn, account: str = Query("info"), _admin: str = Depends(require_admin_panel)):
    """Send an email (To/Cc/Bcc + attachments) through the selected SMTP account."""
    import base64
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.application import MIMEApplication
    from email.utils import formataddr, make_msgid

    acc = _mail_account(account)
    to_list = _split_addrs(body.to)
    cc_list = _split_addrs(body.cc)
    bcc_list = _split_addrs(body.bcc)
    if not to_list:
        raise HTTPException(status_code=422, detail="At least one 'to' recipient is required.")

    msg = MIMEMultipart()
    msg["Message-ID"] = make_msgid(domain="crea3.cc")  # so it can be tracked/deleted server-side
    msg["From"] = formataddr((acc["from_name"], acc["from"]))
    msg["To"] = ", ".join(to_list)
    if cc_list:
        msg["Cc"] = ", ".join(cc_list)
    msg["Subject"] = body.subject
    msg.attach(MIMEText(body.body, "plain", "utf-8"))

    for att in body.attachments:
        try:
            raw = base64.b64decode(att.content_b64)
        except Exception:
            raise HTTPException(status_code=422, detail=f"Attachment '{att.filename}' is not valid base64.")
        part = MIMEApplication(raw)
        part.add_header("Content-Disposition", "attachment", filename=att.filename)
        msg.attach(part)

    recipients = to_list + cc_list + bcc_list  # Bcc: envelope only, not a header
    try:
        if settings.smtp_ssl:
            server = smtplib.SMTP_SSL(acc["host"], settings.smtp_port, timeout=25)
        else:
            server = smtplib.SMTP(acc["host"], settings.smtp_port, timeout=25)
        try:
            server.ehlo()
            if settings.smtp_tls and not settings.smtp_ssl:
                server.starttls(); server.ehlo()
            if acc["user"] and acc["password"]:
                server.login(acc["user"], acc["password"])
            server.sendmail(acc["from"], recipients, msg.as_string())
        finally:
            try:
                server.quit()
            except Exception:
                pass
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Send failed: {type(e).__name__}: {str(e)[:150]}")

    # SMTP does not copy the message to the Sent folder — do it over IMAP so the
    # message shows up in the Sent tab. Best-effort; a failure here doesn't fail
    # the send.
    try:
        import time as _time
        M = _imap_connect(account)
        sent_box = _detect_sent_mailbox(M)
        M.append(sent_box, "\\Seen", imaplib.Time2Internaldate(_time.time()), msg.as_bytes())
        M.logout()
    except Exception:
        pass

    return {"ok": True, "recipients": len(recipients)}


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
