"""Notifications API — the bell in the top bar.

GET    /api/notifications            -> recent notifications for the current user
GET    /api/notifications/unread-count
POST   /api/notifications/{id}/read  -> mark one read
POST   /api/notifications/read-all   -> mark all read
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from .deps import get_current_user
from ..db import get_session
from ..models import Notification, Dispute, User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: int
    dispute_id: Optional[int] = None
    dispute_title: Optional[str] = None
    type: str
    payload: dict[str, Any] = {}
    read: bool
    created_at: datetime


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    limit: int = 30,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    limit = max(1, min(int(limit or 30), 100))
    rows = session.exec(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    ).all()
    # resolve dispute titles
    titles: dict[int, str] = {}
    for r in rows:
        if r.dispute_id and r.dispute_id not in titles:
            d = session.get(Dispute, r.dispute_id)
            titles[r.dispute_id] = d.title if d else f"Dispute #{r.dispute_id}"
    return [
        NotificationOut(
            id=r.id,
            dispute_id=r.dispute_id,
            dispute_title=titles.get(r.dispute_id) if r.dispute_id else None,
            type=r.type,
            payload=r.payload or {},
            read=bool(r.read),
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/unread-count")
def unread_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.read == False,  # noqa: E712
        )
    ).all()
    return {"unread": len(rows)}


@router.post("/{notification_id}/read")
def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    n = session.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read = True
    session.add(n)
    session.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.read == False,  # noqa: E712
        )
    ).all()
    for n in rows:
        n.read = True
        session.add(n)
    session.commit()
    return {"ok": True, "marked": len(rows)}
