from __future__ import annotations

"""Self-contained authentication (no Keycloak).

Users are stored in the local `user` table with salted PBKDF2 password hashes.
Sign-in issues the app's own JWTs (see core.auth_tokens). Email verification and
password reset use 6-digit one-time CODES (reliable delivery: unlike a link,
a code carries no URL that an outbound spam filter can blocklist).
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..core.config import settings
from ..core.auth_tokens import create_access_token, create_refresh_token, decode_token
from ..core.email import send_verification_code_email, send_password_reset_code_email
from ..core.security import generate_code, hash_password, verify_password
from ..db import get_session
from ..models import User, UserActivity, utcnow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

CODE_TTL_MINUTES = 15
RESEND_COOLDOWN_SECONDS = 60


# ── helpers ───────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _is_dev() -> bool:
    return (settings.deployment_environment or "").strip().lower() == "dev"


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _log(session: Session, request: Request, event: str, *, user: User | None = None, email: str | None = None, detail: str | None = None) -> None:
    session.add(UserActivity(
        user_id=(user.id if user else None),
        email=(email or (user.email if user else None)),
        event=event,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:400],
        detail=detail,
    ))


def _find_user(session: Session, identifier: str) -> User | None:
    ident = (identifier or "").strip()
    if not ident:
        return None
    low = ident.lower()
    user = session.exec(select(User).where(User.email == low)).first()
    if not user:
        user = session.exec(select(User).where(User.username == ident)).first()
    return user


def _cooldown_remaining(sent_at: datetime | None) -> int:
    sent = _as_utc(sent_at)
    if not sent:
        return 0
    elapsed = (_now() - sent).total_seconds()
    return max(0, int(RESEND_COOLDOWN_SECONDS - elapsed))


# ── schemas ───────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8, max_length=128)
    role: str | None = None


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)  # email OR username
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class VerifyCodeIn(BaseModel):
    email: str
    code: str = Field(min_length=4, max_length=12)


class ResendIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class ResetPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=4, max_length=12)
    password: str = Field(min_length=8, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str


# ── endpoints ─────────────────────────────────────────────────────────────────
@router.post("/register")
def register(payload: RegisterIn, request: Request, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    username = payload.username.strip()
    if "@" not in email or "." not in email.split("@", 1)[-1]:
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    if session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=409, detail="This username is already taken.")

    role = (payload.role or "agent").strip().lower()
    if role not in ("agent", "mediator"):
        role = "agent"

    verification_required = bool(settings.link_verify or settings.code_verify)
    code = generate_code()
    now = _now()
    user = User(
        email=email,
        username=username,
        role=role,
        hashed_password=hash_password(payload.password),
        email_verified=not verification_required,
        email_verification_code=(code if verification_required else None),
        email_verification_expires_at=(now + timedelta(minutes=CODE_TTL_MINUTES) if verification_required else None),
        email_verification_sent_at=(now if verification_required else None),
        created_at=now,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    code_sent = False
    if verification_required:
        # The FIRST send to a brand-new recipient is the most failure-prone one
        # (SMTP greylisting, transient connect errors) — retry once before
        # giving up, and if both attempts fail, clear the resend cooldown so
        # the user can request a new code IMMEDIATELY instead of hitting the
        # 60-second 429 on a code that was never delivered.
        import time as _time
        for attempt in (1, 2):
            try:
                send_verification_code_email(to_email=email, code=code)
                code_sent = True
                break
            except Exception as exc:
                logger.warning("Verification email attempt %d failed for %s: %s", attempt, email, exc)
                if attempt == 1:
                    _time.sleep(1.5)
        if not code_sent:
            user.email_verification_sent_at = None   # resend allowed right away
            session.add(user)

    _log(session, request, "register", user=user)
    session.commit()

    return {
        "ok": True,
        "email": email,
        "email_verification_required": verification_required,
        "code_sent": code_sent,
        "dev_code": code if (_is_dev() and verification_required) else "",
    }


@router.post("/verify-code")
def verify_code(payload: VerifyCodeIn, request: Request, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    user = _find_user(session, email)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or code.")
    if user.email_verified:
        return {"ok": True, "status": "already_verified"}
    if not user.email_verification_code or payload.code.strip() != user.email_verification_code:
        raise HTTPException(status_code=400, detail="Invalid verification code.")
    expires = _as_utc(user.email_verification_expires_at)
    if expires and expires < _now():
        raise HTTPException(status_code=400, detail="This code has expired. Request a new one.")

    user.email_verified = True
    user.email_verification_code = None
    user.email_verification_expires_at = None
    session.add(user)
    _log(session, request, "verify_email", user=user)
    session.commit()
    return {"ok": True}


@router.post("/resend-verification")
def resend_verification(payload: ResendIn, request: Request, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    user = _find_user(session, email)
    # Do not reveal whether an account exists.
    if not user:
        return {"ok": True, "status": "not_found"}
    if user.email_verified:
        return {"ok": True, "status": "already_verified"}

    remaining = _cooldown_remaining(user.email_verification_sent_at)
    if remaining > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {remaining}s before requesting another code.")

    code = generate_code()
    now = _now()
    user.email_verification_code = code
    user.email_verification_expires_at = now + timedelta(minutes=CODE_TTL_MINUTES)
    user.email_verification_sent_at = now
    session.add(user)
    session.commit()

    try:
        send_verification_code_email(to_email=user.email, code=code)
    except Exception as exc:
        logger.warning("Resend verification failed for %s: %s", email, exc)
    return {"ok": True, "status": "sent", "dev_code": code if _is_dev() else ""}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordIn, request: Request, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    user = _find_user(session, email)
    generic = {"ok": True}
    if not user:
        return generic

    remaining = _cooldown_remaining(user.password_reset_sent_at)
    if remaining > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {remaining}s before requesting another code.")

    code = generate_code()
    now = _now()
    user.password_reset_code = code
    user.password_reset_expires_at = now + timedelta(minutes=CODE_TTL_MINUTES)
    user.password_reset_sent_at = now
    session.add(user)
    session.commit()

    try:
        send_password_reset_code_email(to_email=user.email, code=code)
    except Exception as exc:
        logger.warning("Reset email failed for %s: %s", email, exc)

    if _is_dev():
        return {"ok": True, "dev_code": code}
    return generic


@router.post("/reset-password")
def reset_password(payload: ResetPasswordIn, request: Request, session: Session = Depends(get_session)):
    email = payload.email.strip().lower()
    user = _find_user(session, email)
    if not user or not user.password_reset_code:
        raise HTTPException(status_code=400, detail="Invalid email or reset code.")
    if payload.code.strip() != user.password_reset_code:
        raise HTTPException(status_code=400, detail="Invalid reset code.")
    expires = _as_utc(user.password_reset_expires_at)
    if expires and expires < _now():
        raise HTTPException(status_code=400, detail="This reset code has expired. Request a new one.")

    user.hashed_password = hash_password(payload.password)
    user.email_verified = True  # proving control of the inbox verifies the email
    user.password_reset_code = None
    user.password_reset_expires_at = None
    session.add(user)
    _log(session, request, "password_reset", user=user)
    session.commit()
    return {"ok": True}


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, session: Session = Depends(get_session)):
    user = _find_user(session, payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        _log(session, request, "login_failed", email=payload.email.strip().lower(),
             detail="bad credentials")
        session.commit()
        raise HTTPException(status_code=401, detail="Invalid email/username or password.")
    if not user.email_verified:
        _log(session, request, "login_failed", user=user, detail="email unverified")
        session.commit()
        raise HTTPException(status_code=403, detail="Your email is not verified. Please verify it first.")

    access, expires_in = create_access_token(user)
    refresh = create_refresh_token(user)
    user.last_login_at = _now()
    session.add(user)
    _log(session, request, "login", user=user)
    session.commit()
    return TokenOut(access_token=access, refresh_token=refresh, expires_in=expires_in)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, request: Request, session: Session = Depends(get_session)):
    try:
        claims = decode_token(body.refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    if claims.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid session token.")
    try:
        user = session.get(User, int(claims.get("sub")))
    except (TypeError, ValueError):
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session.")
    access, expires_in = create_access_token(user)
    new_refresh = create_refresh_token(user)
    _log(session, request, "token_refresh", user=user)
    session.commit()
    return TokenOut(access_token=access, refresh_token=new_refresh, expires_in=expires_in)
