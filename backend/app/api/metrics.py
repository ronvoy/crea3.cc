from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError
from ..db import get_session
from ..models import AppMetric, User, Dispute

router = APIRouter(prefix="/api/metrics", tags=["metrics"])

def _get_or_create(session: Session, key: str) -> AppMetric:
    m = session.exec(select(AppMetric).where(AppMetric.key == key)).first()
    if not m:
        m = AppMetric(key=key, value=0)
        session.add(m)
        try:
            session.commit()
        except IntegrityError:
            # Another request created the row concurrently
            session.rollback()
            m = session.exec(select(AppMetric).where(AppMetric.key == key)).first()
            if not m:
                raise
        if m:
            session.refresh(m)
    return m

@router.post("/visit")
def track_visit(session: Session = Depends(get_session)):
    m = _get_or_create(session, "visits")
    m.value += 1
    session.add(m)
    session.commit()
    return {"visits": m.value}

@router.get("/summary")
def summary(session: Session = Depends(get_session)):
    visits = session.exec(select(AppMetric).where(AppMetric.key=="visits")).first()
    users = session.exec(select(User)).all()
    disputes = session.exec(select(Dispute)).all()
    return {
        "visits": visits.value if visits else 0,
        "registered_users": len(users),
        "disputes": len(disputes),
    }
