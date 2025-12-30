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
    KeycloakError,
)
from ..models import User
from ..schemas import LoginIn, RegisterIn, RegisterOut, TokenOut, VerifyEmailIn
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


@router.post("/register", response_model=RegisterOut)
def register(payload: RegisterIn, session: Session = Depends(get_session)):
    raw_email = (payload.email or "").strip()
    if not raw_email:
        raise HTTPException(status_code=400, detail="Email is required")

    email = _normalize_email(raw_email)
    display_username = (payload.username or "").strip() or email.split("@", 1)[0]

    # Create Keycloak user disabled until email verification.
    # IMPORTANT: we set Keycloak `username == email` so password-grant login works reliably.
    kc_admin = KeycloakAdmin.from_settings(settings)
    try:
        # KeycloakAdmin exposes `create_user(..., enabled=False)`.
        # Create an *enabled* Keycloak user. We control app-level access via our own
        # "is_verified" flag (email verification flow) so users don't get stuck
        # in Keycloak "disabled" state.
        kc_user_id = kc_admin.create_user(email=email, username=email, password=payload.password, enabled=True)
    except KeycloakAuthError as e:
        raise HTTPException(status_code=400, detail=str(e))

    token = secrets.token_urlsafe(16)
    expires_at = _now_utc() + timedelta(minutes=settings.email_verification_ttl_minutes)

    user = User(
        keycloak_sub=kc_user_id,
        email=email,
        username=display_username,
        role="user",
        is_verified=False,
        verification_token=token,
        token_expires=expires_at,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Best-effort email sending (token is always returned for copy/paste).
    try:
        send_verification_email(to_email=email, token=token)
    except Exception:
        pass

    return RegisterOut(verification_token=token)




@router.post("/verify-email")
def verify_email(body: VerifyEmailIn, session: Session = Depends(get_session)) -> dict:
    """Verify email using the token previously sent.

    The frontend sends: {"token": "..."}
    """

    user = session.exec(select(User).where(User.verification_token == body.token)).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    if user.token_expires and user.token_expires.replace(tzinfo=timezone.utc) < _now_utc():
        raise HTTPException(status_code=400, detail="Verification token expired")

    if not user.keycloak_sub:
        raise HTTPException(status_code=500, detail="Missing Keycloak mapping")

    kc_admin = KeycloakAdmin.from_settings(settings)
    try:
        kc_admin.enable_and_verify_user(user.keycloak_sub)
    except KeycloakConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except KeycloakError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    user.is_verified = True
    user.verification_token = None
    user.token_expires = None
    session.add(user)
    session.commit()

    return {"ok": True}


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, session: Session = Depends(get_session)) -> TokenOut:
    """Authenticate against Keycloak using username/password.

    Users are created disabled until email verification; Keycloak will reject login.
    """

    # Ensure user exists locally and is verified (clearer error message).
    # Accept either email or username in the "email" field from the UI.
    identifier = (payload.email or "").strip()
    user = None
    if identifier:
        # Try direct email match
        user = session.exec(select(User).where(User.email == identifier)).first()
        # Try username match
        if not user:
            user = session.exec(select(User).where(User.username == identifier)).first()
        # Try normalized email (e.g. "john" -> "john@example.local")
        if not user:
            user = session.exec(select(User).where(User.email == _normalize_email(identifier))).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email address is not verified")

    kc_auth = KeycloakAuth.from_settings(settings)
    try:
        # We set Keycloak username == email at registration time.
        tokens = kc_auth.password_grant(username=user.email, password=payload.password)
    except KeycloakError as e:
        # Keycloak returns invalid_grant for wrong password / disabled user
        raise HTTPException(status_code=401, detail="Invalid credentials") from e

    return TokenOut(
        access_token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        token_type="bearer",
        expires_in=int(tokens.get("expires_in", 0)),
    )


@router.post("/refresh", response_model=TokenOut)
def refresh(refresh_token: str) -> TokenOut:
    kc_auth = KeycloakAuth.from_settings(settings)
    try:
        tokens = kc_auth.refresh_token(refresh_token=refresh_token)
    except KeycloakError as e:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from e

    return TokenOut(
        access_token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        token_type="bearer",
        expires_in=int(tokens.get("expires_in", 0)),
    )
