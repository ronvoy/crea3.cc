from __future__ import annotations

"""Cookie-consent API (GDPR Art. 6(1)(a) + 7, ePrivacy Directive Art. 5(3)).

The banner/modal in the footer collects granular, opt-IN consent per category.
Every decision is stored as an APPEND-ONLY row so the controller can demonstrate
what was consented to, when, and against which policy version — and so a user
can withdraw consent as easily as they gave it (Art. 7(3)).
"""

import logging

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..models import CookieConsent, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/consent", tags=["consent"])

POLICY_VERSION = "1.0"


class ConsentIn(BaseModel):
    visitor_id: str = Field(default="", max_length=64)
    preferences: bool = False
    analytics: bool = False
    marketing: bool = False
    action: str = Field(default="save", max_length=20)


def _maybe_user(request: Request, session: Session) -> User | None:
    """Resolve the signed-in user when a valid token is present; else None.

    The consent modal must work for anonymous visitors too (ePrivacy applies
    before login), so authentication is OPTIONAL here.
    """
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    try:
        from ..core.auth_tokens import decode_token
        claims = decode_token(auth.split(" ", 1)[1].strip())
        return session.get(User, int(claims.get("sub")))
    except Exception:
        return None


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.get("/policy")
def consent_policy():
    """Categories the site uses — rendered by the consent modal."""
    return {
        "policy_version": POLICY_VERSION,
        "categories": [
            {"key": "necessary", "required": True},
            {"key": "preferences", "required": False},
            {"key": "analytics", "required": False},
            {"key": "marketing", "required": False},
        ],
    }


@router.get("/me")
def my_consent(
    request: Request,
    visitor_id: str = "",
    session: Session = Depends(get_session),
):
    user = _maybe_user(request, session)
    """The caller's most recent consent record (by user id, else visitor id)."""
    stmt = select(CookieConsent).order_by(CookieConsent.id.desc())
    if user is not None:
        stmt = stmt.where(CookieConsent.user_id == user.id)
    elif visitor_id:
        stmt = stmt.where(CookieConsent.visitor_id == visitor_id)
    else:
        return {"consent": None, "policy_version": POLICY_VERSION}
    row = session.exec(stmt).first()
    if not row:
        return {"consent": None, "policy_version": POLICY_VERSION}
    return {
        "policy_version": POLICY_VERSION,
        "consent": {
            "necessary": True,
            "preferences": bool(row.preferences),
            "analytics": bool(row.analytics),
            "marketing": bool(row.marketing),
            "action": row.action,
            "given_policy_version": row.policy_version,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "outdated": row.policy_version != POLICY_VERSION,
        },
    }


@router.post("")
def record_consent(
    payload: ConsentIn,
    request: Request,
    session: Session = Depends(get_session),
):
    user = _maybe_user(request, session)
    """Store one consent decision (append-only; never overwrites history)."""
    action = payload.action if payload.action in ("accept_all", "reject_all", "save", "withdraw") else "save"
    row = CookieConsent(
        visitor_id=(payload.visitor_id or "")[:64],
        user_id=(user.id if user else None),
        necessary=True,
        preferences=bool(payload.preferences),
        analytics=bool(payload.analytics),
        marketing=bool(payload.marketing),
        action=action,
        policy_version=POLICY_VERSION,
        user_agent=(request.headers.get("user-agent") or "")[:400],
        ip=_client_ip(request)[:64],
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"ok": True, "id": row.id, "policy_version": POLICY_VERSION}
