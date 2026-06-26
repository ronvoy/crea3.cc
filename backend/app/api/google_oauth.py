"""Google OAuth ("Sign in with Google").

Flow (no Keycloak browser-broker needed):
  1. GET /api/auth/google/login    -> 302 to Google's consent screen.
  2. Google redirects back to /api/auth/google/callback?code=...&state=...
  3. We exchange the code, read the user's email/profile, then ensure a Keycloak
     identity exists (creating it with a server-controlled random password, or
     resetting that password for a returning user). We mirror the user into the
     local DB (same `user` table; role defaults to agent; email auto-verified).
  4. We mint *real* Keycloak tokens via password-grant and redirect to the
     frontend with them in the URL fragment, so the rest of the app keeps working
     with standard Keycloak JWTs.
"""
from __future__ import annotations

import secrets
import urllib.parse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

from ..core.config import settings
from ..core.auth_tokens import create_access_token, create_refresh_token
from ..db import get_session
from ..models import User
from .deps import _unique_username

router = APIRouter(prefix="/api/auth/google", tags=["auth-google"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
STATE_COOKIE = "g_oauth_state"


def google_enabled() -> bool:
    return bool(settings.google_oauth_client_id and settings.google_oauth_client_secret)


def _frontend_base() -> str:
    origins = settings.cors_list()
    return (origins[0] if origins else "http://localhost:5173").rstrip("/")


def _fail(reason: str) -> RedirectResponse:
    """Bounce back to the login page with an error code the UI can show."""
    return RedirectResponse(f"{_frontend_base()}/login?error=google_{reason}", status_code=302)


@router.get("/login")
def google_login() -> RedirectResponse:
    if not google_enabled():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")

    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    resp = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}", status_code=302)
    # CSRF guard: same-origin (backend) cookie, returned by Google's top-level GET.
    resp.set_cookie(STATE_COOKIE, state, httponly=True, samesite="lax", max_age=600)
    return resp


@router.get("/callback")
def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    session: Session = Depends(get_session),
) -> RedirectResponse:
    if error:
        return _fail(error)
    if not google_enabled():
        return _fail("not_configured")

    cookie_state = request.cookies.get(STATE_COOKIE)
    if not code or not state or not cookie_state or not secrets.compare_digest(state, cookie_state):
        return _fail("state")

    # 1) Exchange the authorization code and read the profile.
    try:
        with httpx.Client(timeout=15.0) as client:
            tok = client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_oauth_client_id,
                    "client_secret": settings.google_oauth_client_secret,
                    "redirect_uri": settings.google_oauth_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            if tok.status_code >= 400:
                return _fail("token")
            access = tok.json().get("access_token")
            if not access:
                return _fail("token")
            ui = client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access}"})
            if ui.status_code >= 400:
                return _fail("userinfo")
            info = ui.json()
    except httpx.RequestError:
        return _fail("network")

    email = (info.get("email") or "").strip().lower()
    if not email:
        return _fail("no_email")
    # 2) Upsert the user in the local store (same `user` table). Google users
    #    have no local password (they always sign in via Google).
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        username = _unique_username(session, email.split("@", 1)[0])
        user = User(
            email=email,
            username=username,
            role="agent",
            email_verified=True,
            hashed_password="",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    elif not user.email_verified:
        # Google has verified the address — trust it.
        user.email_verified = True
        session.add(user)
        session.commit()
        session.refresh(user)

    # 3) Mint our app tokens and hand them to the frontend (URL fragment).
    access, _expires = create_access_token(user)
    refresh = create_refresh_token(user)
    fragment = urllib.parse.urlencode({"access_token": access, "refresh_token": refresh})
    resp = RedirectResponse(f"{_frontend_base()}/auth/callback#{fragment}", status_code=302)
    resp.delete_cookie(STATE_COOKIE)
    return resp
