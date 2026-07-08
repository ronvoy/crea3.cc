from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import AccessLog, User
from .deps import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
    _admin: User = Depends(require_admin),
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
