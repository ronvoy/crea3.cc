from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from datetime import datetime, timezone

from ..db import get_session
from ..models import MediatorNote, Dispute, DisputeAgent, AuditEvent, User, Notification
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}", tags=["mediator-tools"])


def _is_mediator_or_owner(dispute_id: int, user: User, session: Session) -> bool:
    """For deadline/nudge: owner, admin, or mediator may act."""
    d = session.get(Dispute, dispute_id)
    if d and (d.created_by_id == user.id or user.role == "admin"):
        return True
    part = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.email == user.email,
        )
    ).first()
    return bool(part and (part.role_in_dispute or "").lower() == "mediator")


def _is_mediator(dispute_id: int, user: User, session: Session) -> bool:
    """For private notes: ONLY a mediator (or admin) — never an ordinary party,
    even if they own the dispute, so private notes are not leaked to parties."""
    if user.role == "admin":
        return True
    part = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.email == user.email,
        )
    ).first()
    return bool(part and (part.role_in_dispute or "").lower() == "mediator")


# ---------------- Mediator private notes ----------------
class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.get("/mediator-notes")
def list_notes(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    if not _is_mediator(dispute_id, user, session):
        raise HTTPException(status_code=403, detail="Only mediators can view private notes.")
    notes = session.exec(
        select(MediatorNote).where(MediatorNote.dispute_id == dispute_id).order_by(MediatorNote.created_at.asc())
    ).all()
    return [
        {"id": n.id, "author_name": n.author_name, "body": n.body,
         "created_at": n.created_at.isoformat() if n.created_at else ""}
        for n in notes
    ]


@router.post("/mediator-notes")
def add_note(dispute_id: int, payload: NoteIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    if not _is_mediator(dispute_id, user, session):
        raise HTTPException(status_code=403, detail="Only mediators can add private notes.")
    note = MediatorNote(
        dispute_id=dispute_id, author_user_id=user.id,
        author_name=user.username or user.email, body=payload.body.strip(),
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return {"id": note.id, "author_name": note.author_name, "body": note.body,
            "created_at": note.created_at.isoformat() if note.created_at else ""}


# ---------------- Phase deadline ----------------
class DeadlineIn(BaseModel):
    # ISO datetime; null clears the deadline.
    deadline_at: str | None = None


@router.patch("/deadline")
def set_deadline(dispute_id: int, payload: DeadlineIn, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    d = can_access_dispute(dispute_id, user, session)
    if user.role != "admin" and d.created_by_id != user.id and not _is_mediator_or_owner(dispute_id, user, session):
        raise HTTPException(status_code=403, detail="Only the owner or a mediator can set the deadline.")
    if payload.deadline_at:
        v = payload.deadline_at.strip()
        if v.endswith("Z"):
            v = v[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(v)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid datetime")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        d.deadline_at = dt.astimezone(timezone.utc)
        d.deadline_reminded = False
    else:
        d.deadline_at = None
    session.add(d)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="DeadlineSet",
                           payload={"deadline_at": d.deadline_at.isoformat() if d.deadline_at else None}))
    session.commit()
    return {"deadline_at": d.deadline_at.isoformat() if d.deadline_at else None}


# ---------------- Nudge a stalled party ----------------
@router.post("/nudge")
def nudge(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Mediator/owner nudges parties who have not completed their current step.
    Sends an in-app notification to participants who are not yet 'ready'."""
    can_access_dispute(dispute_id, user, session)
    if not _is_mediator_or_owner(dispute_id, user, session):
        raise HTTPException(status_code=403, detail="Only mediators or the owner can send a nudge.")
    pending = session.exec(
        select(DisputeAgent).where(
            DisputeAgent.dispute_id == dispute_id,
            DisputeAgent.invite_status == "joined",
            (DisputeAgent.ready == False),  # noqa: E712
            (DisputeAgent.role_in_dispute != "mediator"),
        )
    ).all()
    count = 0
    for p in pending:
        if p.user_id:
            session.add(Notification(
                user_id=p.user_id, dispute_id=dispute_id,
                type="ActionRequested", payload={"reason": "pending_step"}, read=False,
            ))
            count += 1
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="PartiesNudged", payload={"count": count}))
    session.commit()
    return {"nudged": count}
