from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..core.config import settings
from ..core.email import send_verification_email
from ..core.keycloak_admin import (
    KeycloakAdmin,
    KeycloakAuth,
    KeycloakAuthError,
    KeycloakConnectionError,
    KeycloakError,
)
from ..models import User
from ..schemas import LoginIn, RefreshIn, RegisterIn, RegisterOut, TokenOut, VerifyEmailIn
from ..db import get_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_email(value: str) -> str:
    """Normalize emails for local/dev usage.

    - If missing '@', assume `<value>@example.local`
    - If domain has no dot, append `.local` (e.g. `test@test` -> `test@test.local`)
    """
    v = (value or "").strip().lower()
    if not v:
        return v
    if "@" not in v:
        return f"{v}@example.local"
    local, domain = v.split("@", 1)
    if not local:
        local = "user"
    if "." not in domain:
        domain = f"{domain}.local"
    return f"{local}@{domain}"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _auto_verify() -> bool:
    """In dev (or when verified email isn't required) we auto-verify so the
    register -> login -> dashboard flow works without the email round-trip."""
    return (
        settings.deployment_environment.strip().lower() == "dev"
        or not settings.keycloak_require_verified_email
    )


@router.post("/register", response_model=RegisterOut)
def register(payload: RegisterIn, session: Session = Depends(get_session)):
    raw_email = (payload.email or "").strip()
    if not raw_email:
        raise HTTPException(status_code=400, detail="Email is required")

    email = _normalize_email(raw_email)
    display_username = (payload.username or "").strip() or email.split("@", 1)[0]

    # Self-selected role (agent/mediator; default agent). admin is provisioned
    # separately and is not user-selectable here.
    selected_role = (payload.role or "agent").strip().lower()
    if selected_role not in ("agent", "mediator"):
        selected_role = "agent"

    # Reject local duplicates early for a clearer message.
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    # Create the Keycloak identity (enabled; app-level access is controlled by
    # our own email_verified flag).
    kc_admin = KeycloakAdmin.from_settings(settings)
    try:
        kc_user_id = kc_admin.create_user(email=email, username=email, password=payload.password, enabled=True)
    except KeycloakConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except KeycloakAuthError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Best-effort: mirror the role into Keycloak as a realm role. The realm may
    # not define these roles — that's fine, the local DB role is the source of
    # truth for app authorization.
    try:
        kc_admin.assign_realm_role(kc_user_id, selected_role)
    except KeycloakError:
        pass

    auto = _auto_verify()
    token = secrets.token_urlsafe(16)
    expires_at = _now_utc() + timedelta(minutes=settings.email_verification_ttl_minutes)

    user = User(
        keycloak_sub=kc_user_id,
        email=email,
        username=display_username,
        role=selected_role,
        email_verified=auto,
        email_verification_token=None if auto else token,
        email_verification_expires_at=None if auto else expires_at,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    if auto:
        # Mark verified in Keycloak too, so the token's email_verified claim is true.
        try:
            kc_admin.enable_and_verify_email(kc_user_id)
        except KeycloakError:
            pass
        return RegisterOut(verification_token="")

    # Production: send the verification email (token also returned for dev copy/paste).
    try:
        send_verification_email(to_email=email, token=token)
    except Exception:
        pass
    return RegisterOut(verification_token=token)


@router.post("/verify-email")
def verify_email(body: VerifyEmailIn, session: Session = Depends(get_session)) -> dict:
    user = session.exec(
        select(User).where(User.email_verification_token == body.token)
    ).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    if user.email_verification_expires_at and user.email_verification_expires_at.replace(tzinfo=timezone.utc) < _now_utc():
        raise HTTPException(status_code=400, detail="Verification token expired")

    if not user.keycloak_sub:
        raise HTTPException(status_code=500, detail="Missing Keycloak mapping")

    kc_admin = KeycloakAdmin.from_settings(settings)
    try:
        kc_admin.enable_and_verify_email(user.keycloak_sub)
    except KeycloakConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except KeycloakError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None
    session.add(user)
    session.commit()

    return {"ok": True}


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, session: Session = Depends(get_session)) -> TokenOut:
    """Authenticate against Keycloak using username/password (Direct Access Grant)."""
    identifier = (payload.email or "").strip()
    user = None
    if identifier:
        user = session.exec(select(User).where(User.email == identifier)).first()
        if not user:
            user = session.exec(select(User).where(User.username == identifier)).first()
        if not user:
            user = session.exec(select(User).where(User.email == _normalize_email(identifier))).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Email address is not verified")

    kc_auth = KeycloakAuth.from_settings(settings)
    try:
        tokens = kc_auth.password_grant(username=user.email, password=payload.password)
    except KeycloakConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except KeycloakError as e:
        raise HTTPException(status_code=401, detail="Invalid credentials") from e

    return TokenOut(
        access_token=tokens.access_token or "",
        refresh_token=tokens.refresh_token or "",
        token_type="bearer",
        expires_in=int(tokens.expires_in or 0),
    )


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn) -> TokenOut:
    kc_auth = KeycloakAuth.from_settings(settings)
    try:
        tokens = kc_auth.refresh(refresh_token=body.refresh_token)
    except KeycloakConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except KeycloakError as e:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from e

    return TokenOut(
        access_token=tokens.access_token or "",
        refresh_token=tokens.refresh_token or "",
        token_type="bearer",
        expires_in=int(tokens.expires_in or 0),
    )
