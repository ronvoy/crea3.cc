from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..core.config import settings
from ..core.email import (
    send_password_reset_code_email,
    send_verification_code_email,
)
from ..core.keycloak_admin import (
    KeycloakAdmin,
    KeycloakAuth,
    KeycloakAuthError,
    KeycloakConnectionError,
    KeycloakError,
)
from ..core.security import generate_code, hash_password
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


def _resolve_kc_user_id(kc_admin: KeycloakAdmin, user: User, session: Session) -> str | None:
    """Return a valid Keycloak user id for this local user.

    The stored `keycloak_sub` can be stale or missing for older accounts (a
    Keycloak reset/re-import, or a user that predates the integration). In that
    case Keycloak returns 404 "User not found". We fall back to looking the user
    up by email and repair the stored sub so future calls are fast.
    """
    if user.keycloak_sub:
        try:
            kc_admin.is_user_enabled(user.keycloak_sub)  # 404s if the id is stale
            return user.keycloak_sub
        except KeycloakConnectionError:
            raise
        except KeycloakError:
            pass  # stale/missing — fall through to email lookup

    kc_user = kc_admin.find_user_by_email(user.email)
    if kc_user and kc_user.get("id"):
        new_id = kc_user["id"]
        if new_id != user.keycloak_sub:
            user.keycloak_sub = new_id
            session.add(user)
            session.commit()
        return new_id
    return None


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

    # Always require email verification before the account can sign in.
    code = generate_code()
    now = _now_utc()
    expires_at = now + timedelta(minutes=CODE_TTL_MINUTES)

    user = User(
        keycloak_sub=kc_user_id,
        email=email,
        username=display_username,
        role=selected_role,
        hashed_password=hash_password(payload.password),
        email_verified=False,
        email_verification_code=code,
        email_verification_token=secrets.token_urlsafe(16),
        email_verification_expires_at=expires_at,
        email_verification_sent_at=now,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Send the verification code email (best-effort: failures don't block signup;
    # the dev_code lets local/dev flows proceed without the inbox).
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

    # Preferred path: email + 6-digit code.
    if body.email and body.code:
        user = _find_user(session, body.email)
        if not user:
            raise HTTPException(status_code=400, detail="Invalid email or code")
        if not user.email_verification_code or body.code.strip() != user.email_verification_code:
            raise HTTPException(status_code=400, detail="Invalid verification code")
    # Legacy path: long link token.
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

    kc_admin = KeycloakAdmin.from_settings(settings)
    try:
        kc_user_id = _resolve_kc_user_id(kc_admin, user, session)
        if not kc_user_id:
            raise HTTPException(status_code=400, detail="No matching identity-provider account for this email")
        kc_admin.enable_and_verify_email(kc_user_id)
    except KeycloakConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except KeycloakError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

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
    # Don't reveal whether the account exists.
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

    return SimpleMessageOut(
        ok=True,
        message="Verification code sent.",
        dev_code=code if _is_dev() else "",
    )


@router.post("/forgot-password", response_model=SimpleMessageOut)
def forgot_password(body: ForgotPasswordIn, session: Session = Depends(get_session)) -> SimpleMessageOut:
    user = _find_user(session, body.email)
    # Always respond the same way to avoid leaking which emails are registered.
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

    kc_admin = KeycloakAdmin.from_settings(settings)
    try:
        kc_user_id = _resolve_kc_user_id(kc_admin, user, session)
        if not kc_user_id:
            raise HTTPException(status_code=400, detail="No matching identity-provider account for this email")
        kc_admin.update_password(kc_user_id, body.new_password)
        # Resetting via an emailed code proves ownership — mark verified too.
        kc_admin.enable_and_verify_email(kc_user_id)
    except KeycloakConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except KeycloakError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    user.hashed_password = hash_password(body.new_password)
    user.email_verified = True
    user.password_reset_code = None
    user.password_reset_expires_at = None
    session.add(user)
    session.commit()

    return SimpleMessageOut(ok=True, message="Password updated — you can now sign in.")


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, session: Session = Depends(get_session)) -> TokenOut:
    """Authenticate against Keycloak using username/password (Direct Access Grant)."""
    user = _find_user(session, payload.email)
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
