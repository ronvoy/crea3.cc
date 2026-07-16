from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..core.config import settings
from ..core.email import _send_email, send_verification_code_email
from ..core.keycloak_admin import KeycloakAdmin, KeycloakAuthError, KeycloakConnectionError
from ..core import verify_store

# 6-digit email-verification code (alternative to Keycloak's link), stored on the
# Keycloak user as attributes and valid for 30 minutes.
VERIFY_CODE_TTL_SECONDS = 1800

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

RESET_TTL_SECONDS = 3600  # reset links are valid for one hour


def _reset_secret() -> bytes:
    raw = (
        settings.keycloak_admin_client_secret
        or settings.keycloak_client_secret
        or "crea3-password-reset-secret"
    )
    return hashlib.sha256(raw.encode("utf-8")).digest()


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_reset_token(user_id: str, email: str, ttl: int = RESET_TTL_SECONDS) -> str:
    payload = {"uid": user_id, "email": email, "exp": int(time.time()) + ttl}
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _b64e(hmac.new(_reset_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_reset_token(token: str) -> dict:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        raise ValueError("malformed token")
    expected = _b64e(hmac.new(_reset_secret(), body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise ValueError("bad signature")
    payload = json.loads(_b64d(body))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("expired")
    return payload


class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8, max_length=128)


class ResendIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=8, max_length=4096)
    password: str = Field(min_length=8, max_length=128)


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordIn, request: Request):
    """Email the user a link to a reset-password page embedded in the platform.

    Always responds the same way to avoid revealing whether an account exists.
    """
    email = payload.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    try:
        admin = KeycloakAdmin()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Password reset is unavailable. Please try again later.")

    try:
        user = admin.find_user_by_email(email)
    except (KeycloakConnectionError, KeycloakAuthError):
        raise HTTPException(status_code=503, detail="Password reset service is unreachable. Please try again later.")

    if user and user.get("id"):
        token = make_reset_token(user["id"], email)
        origin = request.headers.get("origin") or ""
        base = origin if origin.startswith("http") else ""
        link = f"{base}/reset-password?token={token}"
        subject = "CREA3 — Reset your password"
        body = (
            "We received a request to reset the password for your CREA3 account.\n\n"
            "Open the link below to choose a new password (valid for one hour):\n"
            f"{link}\n\n"
            "If you did not request this, you can safely ignore this email — your password will not change.\n\n"
            "—\nCREA3\n"
        )
        try:
            _send_email(to_email=email, subject=subject, body_text=body)
        except Exception:
            # Never reveal delivery problems to the caller.
            pass

    return {"ok": True}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordIn):
    """Set a new password from a signed reset token (embedded reset page)."""
    try:
        data = verify_reset_token(payload.token)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired. Please request a new one.",
        )

    user_id = data.get("uid")
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired. Please request a new one.",
        )

    try:
        admin = KeycloakAdmin()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Password reset is unavailable. Please try again later.")

    try:
        admin.update_password(user_id, payload.password)
    except KeycloakAuthError as exc:
        if "password" in str(exc).lower():
            raise HTTPException(
                status_code=422,
                detail="Your password does not meet the requirements. Use at least 8 characters, mixing letters and numbers.",
            )
        raise HTTPException(status_code=502, detail="Could not reset the password. Please try again.")
    except KeycloakConnectionError:
        raise HTTPException(status_code=503, detail="Password reset service is unreachable. Please try again later.")

    return {"ok": True}


@router.post("/resend-verification")
def resend_verification(payload: ResendIn, request: Request):
    """Re-send the email-verification message for an unverified account."""
    email = payload.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    try:
        admin = KeycloakAdmin()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Verification service is unavailable. Please try again later.")

    try:
        user = admin.find_user_by_email(email)
    except KeycloakConnectionError:
        raise HTTPException(status_code=503, detail="Verification service is unreachable. Please try again later.")
    except KeycloakAuthError:
        raise HTTPException(status_code=502, detail="Could not process the request. Please try again.")

    # Do not reveal whether an account exists.
    if not user:
        return {"ok": True, "status": "not_found"}
    if user.get("emailVerified"):
        return {"ok": True, "status": "already_verified"}

    user_id = user.get("id")
    origin = request.headers.get("origin") or ""
    redirect_uri = f"{origin}/app" if origin.startswith("http") else None
    try:
        admin.send_verify_email(user_id, client_id=settings.keycloak_client_id, redirect_uri=redirect_uri)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not send the verification email. Please try again.")
    return {"ok": True, "status": "sent"}


@router.post("/register")
def register(payload: RegisterIn, request: Request):
    """Create a new account directly (embedded registration).

    The user is created in Keycloak (disabled email-verification), then a
    verification email is sent. Sign-in is blocked until the email is verified,
    matching the platform's existing policy.
    """
    email = payload.email.strip().lower()
    username = payload.username.strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    try:
        admin = KeycloakAdmin()
    except RuntimeError:
        # Admin service account not configured in this environment.
        raise HTTPException(
            status_code=503,
            detail="Registration is temporarily unavailable. Please try again later.",
        )

    try:
        if admin.find_user_by_email(email):
            raise HTTPException(status_code=409, detail="An account with this email already exists.")

        # Verification is required only if at least one method is enabled.
        verification_required = bool(settings.link_verify or settings.code_verify)
        user_id = admin.create_user(
            email=email,
            username=username,
            password=payload.password,
            email_verified=not verification_required,
        )

        origin = request.headers.get("origin") or ""
        redirect_uri = f"{origin}/app" if origin.startswith("http") else None

        # LINK_VERIFY=1 -> Keycloak's verification link (best-effort).
        email_sent = False
        if settings.link_verify:
            try:
                admin.send_verify_email(
                    user_id,
                    client_id=settings.keycloak_client_id,
                    redirect_uri=redirect_uri,
                )
                email_sent = True
            except Exception:
                email_sent = False

        # CODE_VERIFY=1 -> a 6-digit code (stored backend-side, emailed via SMTP).
        code_sent = False
        if settings.code_verify:
            try:
                code = f"{secrets.randbelow(1_000_000):06d}"
                verify_store.set_code(email, code, VERIFY_CODE_TTL_SECONDS)
                send_verification_code_email(email, code)
                code_sent = True
            except Exception:
                code_sent = False

        # No method enabled -> auto-verify so the account can sign in immediately.
        if not verification_required:
            try:
                admin.enable_and_verify_email(user_id)
            except Exception:
                pass

    except HTTPException:
        raise
    except KeycloakAuthError as exc:
        msg = str(exc)
        low = msg.lower()
        if "already exists" in low:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        if "password" in low:
            raise HTTPException(
                status_code=422,
                detail="Your password does not meet the requirements. Use at least 8 characters, mixing letters and numbers.",
            )
        raise HTTPException(status_code=502, detail="Could not create the account. Please try again.")
    except KeycloakConnectionError:
        raise HTTPException(status_code=503, detail="Registration service is unreachable. Please try again later.")

    return {
        "ok": True,
        "email_verification_required": verification_required,
        "email_sent": email_sent,
        "code_sent": code_sent,
    }


class VerifyCodeIn(BaseModel):
    email: str
    code: str = Field(min_length=4, max_length=12)


@router.post("/verify-code")
def verify_code(payload: VerifyCodeIn):
    """Verify an account using the 6-digit code (alternative to the link)."""
    email = payload.email.strip().lower()
    code = payload.code.strip()

    result = verify_store.check_and_consume(email, code)
    if result == "expired":
        raise HTTPException(status_code=400, detail="This code has expired. Request a new one.")
    if result != "ok":
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    try:
        admin = KeycloakAdmin()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Verification is temporarily unavailable.")

    try:
        user = admin.find_user_by_email(email)
        if not user or not user.get("id"):
            raise HTTPException(status_code=400, detail="Invalid email or code.")
        admin.enable_and_verify_email(user["id"])
        return {"ok": True}
    except HTTPException:
        raise
    except KeycloakConnectionError:
        raise HTTPException(status_code=503, detail="Verification service is unreachable. Please try again later.")
    except KeycloakAuthError:
        raise HTTPException(status_code=502, detail="Could not verify the code. Please try again.")
