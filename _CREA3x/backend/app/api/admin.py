import hmac
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..core.config import settings
from ..db import get_session
from ..models import AccessLog, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

# ── Admin-panel authentication ────────────────────────────────────────────────
# A standalone login for /admin (independent of Keycloak). The credentials live
# only in the backend environment; the browser only ever receives a short-lived
# signed token.
ADMIN_ALGO = "HS256"
_bearer = HTTPBearer(auto_error=False)

# Simple in-memory brute-force throttle. The panel can be reachable from the
# public tunnel, so an unlimited password oracle is not acceptable.
_MAX_ATTEMPTS = 5
_LOCKOUT_SECONDS = 300
_attempts: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _throttled(ip: str) -> bool:
    now = time.time()
    recent = [t for t in _attempts.get(ip, []) if now - t < _LOCKOUT_SECONDS]
    _attempts[ip] = recent
    return len(recent) >= _MAX_ATTEMPTS


def _record_failure(ip: str) -> None:
    _attempts.setdefault(ip, []).append(time.time())


def _admin_login_configured() -> bool:
    return bool(
        (settings.admin_email or "").strip()
        and (settings.admin_password or "").strip()
        and (settings.admin_jwt_secret or "").strip()
    )


class AdminLoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class AdminLoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


@router.post("/login", response_model=AdminLoginOut)
def admin_login(payload: AdminLoginIn, request: Request):
    """Sign in to the admin panel using ADMIN_EMAIL / ADMIN_PASSWORD from .env."""
    if not _admin_login_configured():
        # Never fall back to a default credential: a guessable admin is worse
        # than an unavailable panel.
        logger.warning("Admin login attempted but ADMIN_EMAIL/PASSWORD/JWT_SECRET are not configured.")
        raise HTTPException(
            status_code=503,
            detail="The admin panel is not configured on this server.",
        )

    ip = _client_ip(request)
    if _throttled(ip):
        raise HTTPException(
            status_code=429,
            detail="Too many failed attempts. Please try again in a few minutes.",
        )

    # Constant-time comparison so responses do not leak the credential.
    email_ok = hmac.compare_digest(
        payload.email.strip().lower(), settings.admin_email.strip().lower()
    )
    pass_ok = hmac.compare_digest(payload.password, settings.admin_password)
    if not (email_ok and pass_ok):
        _record_failure(ip)
        logger.warning("Failed admin-panel login from %s", ip)
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    _attempts.pop(ip, None)
    ttl = max(5, int(settings.admin_session_minutes)) * 60
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": settings.admin_email.strip().lower(),
            "scope": "admin-panel",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        },
        settings.admin_jwt_secret,
        algorithm=ADMIN_ALGO,
    )
    return AdminLoginOut(access_token=token, expires_in=ttl)


def require_admin_panel(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Authorize a request carrying an admin-panel token issued by /admin/login."""
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Admin authentication required.")
    if not (settings.admin_jwt_secret or "").strip():
        raise HTTPException(status_code=503, detail="The admin panel is not configured.")
    try:
        claims = jwt.decode(
            creds.credentials, settings.admin_jwt_secret, algorithms=[ADMIN_ALGO]
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Your admin session is invalid or has expired.")
    if claims.get("scope") != "admin-panel":
        raise HTTPException(status_code=403, detail="This token is not valid for the admin panel.")
    return str(claims.get("sub") or "admin")


class AccessLogOut(BaseModel):
    id: int
    ts: datetime
    method: str
    path: str
    status_code: int
    ip: str
    user_agent: str
    user_email: Optional[str] = None
    duration_ms: Optional[int] = None


@router.get("/access-logs", response_model=List[AccessLogOut])
def list_access_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    only_api: bool = Query(True, description="Only include /api/* paths"),
    session: Session = Depends(get_session),
    _admin: str = Depends(require_admin_panel),
):
    stmt = select(AccessLog)
    if only_api:
        stmt = stmt.where(AccessLog.path.startswith("/api/"))
    stmt = stmt.order_by(AccessLog.ts.desc()).offset(offset).limit(limit)
    rows = session.exec(stmt).all()
    return [
        AccessLogOut(
            id=r.id,
            ts=r.ts,
            method=r.method,
            path=r.path,
            status_code=r.status_code,
            ip=r.ip,
            user_agent=r.user_agent,
            user_email=r.user_email,
            duration_ms=r.duration_ms,
        )
        for r in rows
        if r.id is not None
    ]
