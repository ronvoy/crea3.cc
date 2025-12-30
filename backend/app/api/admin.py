from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from ..core.config import settings
from ..db import get_session
from ..models import AccessLog


router = APIRouter(prefix="/api/admin", tags=["admin"])


class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str


class AdminLoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int


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


def _create_admin_token(email: str) -> tuple[str, int]:
    ttl = int(getattr(settings, "admin_token_ttl_minutes", 60))
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=ttl)
    payload = {
        "sub": email,
        "role": "admin",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    return token, ttl * 60


def require_admin(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid admin token")

    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not an admin token")
    return payload


@router.post("/login", response_model=AdminLoginOut)
def admin_login(body: AdminLoginIn):
    # Mock admin credentials (override via .env / environment variables).
    if body.email != settings.admin_email or body.password != settings.admin_password:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token, expires_in = _create_admin_token(str(body.email))
    return AdminLoginOut(access_token=token, expires_in_seconds=expires_in)


@router.get("/access-logs", response_model=List[AccessLogOut])
def list_access_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    only_api: bool = Query(True, description="Only include /api/* paths"),
    session: Session = Depends(get_session),
    _admin: dict = Depends(require_admin),
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
