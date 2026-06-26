from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..core.config import settings
from ..core.auth_tokens import create_access_token, create_refresh_token, decode_token
from ..core.email import (
    send_password_reset_code_email,
    send_verification_code_email,
)
from ..core.security import generate_code, hash_password, verify_password
from ..models import User
from ..schemas import (
    ForgotPasswordIn,
    LoginIn,
    RefreshIn,
    RegisterIn,
    RegisterOut,
    ResendVerificationIn,
    ResetPasswordIn,
    SimpleMessageOut,
    TokenOut,
    VerifyEmailIn,
)
from ..db import get_session

router = APIRouter(prefix="/api/auth", tags=["auth"])

# One-time codes are short-lived; the resend button is throttled to 1 minute.
CODE_TTL_MINUTES = 15
RESEND_COOLDOWN_SECONDS = 60


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


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _is_dev() -> bool:
    return settings.deployment_environment.strip().lower() == "dev"


def _find_user(session: Session, identifier: str) -> User | None:
    """Resolve a user by email / username / normalized email."""
    ident = (identifier or "").strip()
    if not ident:
        return None
    user = session.exec(select(User).where(User.email == ident)).first()
    if not user:
        user = session.exec(select(User).where(User.username == ident)).first()
    if not user:
        user = session.exec(select(User).where(User.email == _normalize_email(ident))).first()
    return user


def _cooldown_remaining(sent_at: datetime | None) -> int:
    """Seconds left before a code can be resent (0 when allowed)."""
    sent = _as_utc(sent_at)
    if not sent:
        return 0
    elapsed = (_now_utc() - sent).total_seconds()
    return max(0, int(RESEND_COOLDOWN_SECONDS - elapsed))


def _issue_tokens(user: User) -> TokenOut:
    access, expires_in = create_access_token(user)
    refresh = create_refresh_token(user)
    return TokenOut(access_token=access, refresh_token=refresh, token_type="bearer", expires_in=expires_in)


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

    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    # Always require email verification before the account can sign in.
    code = generate_code()
    now = _now_utc()

    user = User(
        email=email,
        username=display_username,
        role=selected_role,
        hashed_password=hash_password(payload.password),
        email_verified=False,
        email_verification_code=code,
        email_verification_token=secrets.token_urlsafe(16),
        email_verification_expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
        email_verification_sent_at=now,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    try:
        send_verification_code_email(to_email=email, code=code)
    except Exception:
        pass

    return RegisterOut(
        verification_token=code,
        email=email,
        verification_required=True,
        dev_code=code if _is_dev() else "",
    )


@router.post("/verify-email", response_model=SimpleMessageOut)
def verify_email(body: VerifyEmailIn, session: Session = Depends(get_session)) -> SimpleMessageOut:
    user: User | None = None

    if body.email and body.code:
        user = _find_user(session, body.email)
        if not user:
            raise HTTPException(status_code=400, detail="Invalid email or code")
        if not user.email_verification_code or body.code.strip() != user.email_verification_code:
            raise HTTPException(status_code=400, detail="Invalid verification code")
    elif body.token:
        user = session.exec(
            select(User).where(User.email_verification_token == body.token)
        ).first()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid verification token")
    else:
        raise HTTPException(status_code=400, detail="Provide an email and code")

    if user.email_verified:
        return SimpleMessageOut(ok=True, message="Email already verified")

    expires = _as_utc(user.email_verification_expires_at)
    if expires and expires < _now_utc():
        raise HTTPException(status_code=400, detail="Verification code expired — request a new one")

    user.email_verified = True
    user.email_verification_code = None
    user.email_verification_token = None
    user.email_verification_expires_at = None
    session.add(user)
    session.commit()

    return SimpleMessageOut(ok=True, message="Email verified")


@router.post("/resend-verification", response_model=SimpleMessageOut)
def resend_verification(body: ResendVerificationIn, session: Session = Depends(get_session)) -> SimpleMessageOut:
    user = _find_user(session, body.email)
    if not user:
        return SimpleMessageOut(ok=True, message="If the account exists, a new code was sent.")
    if user.email_verified:
        return SimpleMessageOut(ok=True, message="Email already verified")

    remaining = _cooldown_remaining(user.email_verification_sent_at)
    if remaining > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {remaining}s before requesting another code")

    code = generate_code()
    now = _now_utc()
    user.email_verification_code = code
    user.email_verification_expires_at = now + timedelta(minutes=CODE_TTL_MINUTES)
    user.email_verification_sent_at = now
    session.add(user)
    session.commit()

    try:
        send_verification_code_email(to_email=user.email, code=code)
    except Exception:
        pass

    return SimpleMessageOut(ok=True, message="Verification code sent.", dev_code=code if _is_dev() else "")


@router.post("/forgot-password", response_model=SimpleMessageOut)
def forgot_password(body: ForgotPasswordIn, session: Session = Depends(get_session)) -> SimpleMessageOut:
    user = _find_user(session, body.email)
    generic = SimpleMessageOut(ok=True, message="If the account exists, a reset code was sent.")
    if not user:
        return generic

    remaining = _cooldown_remaining(user.password_reset_sent_at)
    if remaining > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {remaining}s before requesting another code")

    code = generate_code()
    now = _now_utc()
    user.password_reset_code = code
    user.password_reset_expires_at = now + timedelta(minutes=CODE_TTL_MINUTES)
    user.password_reset_sent_at = now
    session.add(user)
    session.commit()

    try:
        send_password_reset_code_email(to_email=user.email, code=code)
    except Exception:
        pass

    if _is_dev():
        return SimpleMessageOut(ok=True, message="Reset code sent.", dev_code=code)
    return generic


@router.post("/reset-password", response_model=SimpleMessageOut)
def reset_password(body: ResetPasswordIn, session: Session = Depends(get_session)) -> SimpleMessageOut:
    user = _find_user(session, body.email)
    if not user or not user.password_reset_code:
        raise HTTPException(status_code=400, detail="Invalid email or reset code")
    if body.code.strip() != user.password_reset_code:
        raise HTTPException(status_code=400, detail="Invalid reset code")

    expires = _as_utc(user.password_reset_expires_at)
    if expires and expires < _now_utc():
        raise HTTPException(status_code=400, detail="Reset code expired — request a new one")

    user.hashed_password = hash_password(body.new_password)
    # Resetting via an emailed code proves ownership — mark verified too.
    user.email_verified = True
    user.password_reset_code = None
    user.password_reset_expires_at = None
    session.add(user)
    session.commit()

    return SimpleMessageOut(ok=True, message="Password updated — you can now sign in.")


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, session: Session = Depends(get_session)) -> TokenOut:
    """Authenticate against the local user store and issue app JWTs."""
    user = _find_user(session, payload.email)
    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Email address is not verified")
    return _issue_tokens(user)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, session: Session = Depends(get_session)) -> TokenOut:
    try:
        claims = decode_token(body.refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if claims.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user: User | None = None
    sub = claims.get("sub")
    if sub is not None:
        try:
            user = session.get(User, int(sub))
        except (TypeError, ValueError):
            user = None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return _issue_tokens(user)
