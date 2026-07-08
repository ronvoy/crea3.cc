"""Admin panel API (/administrator).

A single master-credential panel (ADMIN_PANEL_USER / ADMIN_PANEL_PASS) that
replaces the Keycloak admin console (local user management) and Mailpit (sent
email outbox), and links to the existing /dbms and /rag tools. It reuses the
shared admin token (`_create_admin_token` / `require_admin`).
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from ..core.config import settings
from ..db import get_session
from ..models import EmailLog, User
from .admin import _create_admin_token, require_admin
from .users import _delete_user_data

router = APIRouter(prefix="/api/admin-panel", tags=["admin-panel"])

_ALLOWED_ROLES = {"agent", "mediator", "admin", "user"}


# ── auth ────────────────────────────────────────────────────────────────────────
class PanelLoginIn(BaseModel):
    username: str
    password: str


class PanelTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int


@router.post("/login", response_model=PanelTokenOut)
def panel_login(body: PanelLoginIn) -> PanelTokenOut:
    if body.username != settings.admin_panel_user or body.password != settings.admin_panel_pass:
        raise HTTPException(status_code=401, detail="Invalid admin panel credentials")
    token, expires_in = _create_admin_token(f"admin-panel:{body.username}")
    return PanelTokenOut(access_token=token, expires_in_seconds=expires_in)


# ── users (Keycloak replacement) ─────────────────────────────────────────────────
class PanelUserOut(BaseModel):
    id: int
    email: str
    username: str
    role: str
    email_verified: bool
    has_password: bool
    created_at: Optional[datetime] = None


class PanelUserUpdate(BaseModel):
    role: Optional[str] = None
    email_verified: Optional[bool] = None


def _user_out(u: User) -> PanelUserOut:
    return PanelUserOut(
        id=u.id,
        email=u.email,
        username=u.username,
        role=u.role,
        email_verified=bool(getattr(u, "email_verified", False)),
        has_password=bool(getattr(u, "hashed_password", "")),
        created_at=getattr(u, "created_at", None),
    )


@router.get("/users", response_model=List[PanelUserOut])
def list_users(
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
    q: Optional[str] = Query(default=None),
) -> List[PanelUserOut]:
    users = session.exec(select(User).order_by(User.id.desc())).all()
    if q:
        needle = q.strip().lower()
        users = [u for u in users if needle in u.email.lower() or needle in u.username.lower()]
    return [_user_out(u) for u in users]


@router.patch("/users/{user_id}", response_model=PanelUserOut)
def update_user(
    user_id: int,
    body: PanelUserUpdate,
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> PanelUserOut:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        role = body.role.strip().lower()
        if role not in _ALLOWED_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role = role
    if body.email_verified is not None:
        user.email_verified = bool(body.email_verified)
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _delete_user_data(session, user)
    session.delete(user)
    session.commit()
    return {"ok": True}


# ── outbox (Mailpit replacement) ─────────────────────────────────────────────────
class EmailLogOut(BaseModel):
    id: int
    to_email: str
    subject: str
    body: str
    kind: str
    ok: bool
    error: str
    created_at: Optional[datetime] = None


@router.get("/emails", response_model=List[EmailLogOut])
def list_emails(
    _admin: dict = Depends(require_admin),
    session: Session = Depends(get_session),
    limit: int = Query(default=100, ge=1, le=500),
) -> List[EmailLogOut]:
    rows = session.exec(select(EmailLog).order_by(EmailLog.id.desc()).limit(limit)).all()
    return [
        EmailLogOut(
            id=r.id,
            to_email=r.to_email,
            subject=r.subject,
            body=r.body,
            kind=r.kind,
            ok=r.ok,
            error=r.error,
            created_at=r.created_at,
        )
        for r in rows
    ]
